"use client";

import { useState, useEffect, useRef } from "react";
import { useClone } from "@/lib/hooks/useClone";
import { joinMeeting, leaveMeeting, getMeetingSession, getMeetingSessions } from "@/lib/api";
import type { MeetingSession, TranscriptEntry, MeetingResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  zoom: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect width="14" height="14" rx="3" fill="currentColor" fillOpacity="0.15"/>
      <path d="M2 5a1 1 0 011-1h5a1 1 0 011 1v4a1 1 0 01-1 1H3a1 1 0 01-1-1V5zM9 5.5l3-2v7l-3-2V5.5z" fill="currentColor"/>
    </svg>
  ),
  meet: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect width="14" height="14" rx="3" fill="currentColor" fillOpacity="0.15"/>
      <path d="M7 3.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" fill="currentColor" fillOpacity="0.5"/>
      <path d="M7 5.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" fill="currentColor"/>
    </svg>
  ),
  teams: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect width="14" height="14" rx="3" fill="currentColor" fillOpacity="0.15"/>
      <path d="M5 4h4M7 4v6M4 7h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
};

const STATUS_DOT: Record<string, string> = {
  joining: "bg-amber-400/60 animate-pulse",
  in_call: "bg-emerald-400/70",
  ended: "bg-white/20",
  error: "bg-red-400/60",
};

const STATUS_LABEL: Record<string, string> = {
  joining: "Joining…",
  in_call: "Live",
  ended: "Ended",
  error: "Error",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function ActiveMeeting({
  botId,
  onLeave,
}: {
  botId: string;
  onLeave: () => void;
}) {
  const [session, setSession] = useState<MeetingSession | null>(null);
  const [leaving, setLeaving] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const data = await getMeetingSession(botId);
        if (active) {
          setSession(data);
          if (data.status === "ended" || data.status === "error") {
            clearInterval(interval);
          }
        }
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => { active = false; clearInterval(interval); };
  }, [botId]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.transcript.length]);

  async function handleLeave() {
    setLeaving(true);
    try {
      await leaveMeeting(botId);
      onLeave();
    } finally {
      setLeaving(false);
    }
  }

  if (!session) {
    return (
      <div className="glass rounded-2xl p-6 flex items-center gap-3">
        <div className="w-4 h-4 rounded-full border border-white/20 border-t-white/60 animate-spin" />
        <p className="text-sm text-white/40">Connecting bot to meeting…</p>
      </div>
    );
  }

  const isActive = session.status === "joining" || session.status === "in_call";

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn("w-2 h-2 rounded-full", STATUS_DOT[session.status])} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white/75">
                {STATUS_LABEL[session.status]}
              </span>
              <span className="text-white/30">·</span>
              <span className="text-xs text-white/35 capitalize">{session.platform}</span>
            </div>
            <p className="text-[11px] text-white/25 mt-0.5 font-mono truncate max-w-xs">
              {session.meeting_url}
            </p>
          </div>
        </div>
        {isActive && (
          <button
            onClick={handleLeave}
            disabled={leaving}
            className="glass hover:glass-md rounded-xl px-4 py-2 text-xs text-white/50 hover:text-white/70 transition-all disabled:opacity-40"
          >
            {leaving ? "Leaving…" : "Leave meeting"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 divide-x divide-white/[0.05]" style={{ minHeight: 320 }}>
        {/* Transcript */}
        <div className="flex flex-col">
          <div className="px-4 py-2.5 border-b border-white/[0.05]">
            <p className="text-[11px] text-white/35 font-medium">Live transcript</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5 max-h-72">
            {session.transcript.length === 0 ? (
              <p className="text-xs text-white/25 text-center pt-8">
                {session.status === "joining"
                  ? "Waiting to join…"
                  : "No transcript yet. Bot is listening."}
              </p>
            ) : (
              session.transcript.map((entry, i) => (
                <TranscriptLine key={i} entry={entry} />
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        {/* Clone responses */}
        <div className="flex flex-col">
          <div className="px-4 py-2.5 border-b border-white/[0.05]">
            <p className="text-[11px] text-white/35 font-medium">Clone responses</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-72">
            {session.responses.length === 0 ? (
              <p className="text-xs text-white/25 text-center pt-8">
                Mention the clone by name to trigger a response.
              </p>
            ) : (
              session.responses.map((r, i) => (
                <ResponseCard key={i} response={r} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TranscriptLine({ entry }: { entry: TranscriptEntry }) {
  return (
    <div>
      <p className="text-[10px] text-white/30 mb-0.5">
        {entry.speaker} · {formatTime(entry.ts)}
      </p>
      <p className="text-xs text-white/65 leading-relaxed">{entry.text}</p>
    </div>
  );
}

function ResponseCard({ response }: { response: MeetingResponse }) {
  return (
    <div className="glass rounded-xl p-3">
      <p className="text-[10px] text-white/30 mb-1.5 italic">"{response.question}"</p>
      <p className="text-xs text-white/70 leading-relaxed">{response.answer}</p>
      <p className="text-[10px] text-white/20 mt-1.5">{formatTime(response.ts)}</p>
    </div>
  );
}

function SessionHistoryRow({ session }: { session: MeetingSession }) {
  const duration = session.started_at && session.ended_at
    ? Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000)
    : null;

  return (
    <div className="py-3 px-4 flex items-center gap-4">
      <div className="text-white/30 shrink-0">
        {PLATFORM_ICONS[session.platform] ?? PLATFORM_ICONS.zoom}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white/55 font-mono truncate">{session.meeting_url}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <div className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[session.status])} />
          <p className="text-[10px] text-white/25">
            {session.started_at ? formatTime(session.started_at) : "—"}
            {duration !== null ? ` · ${duration}m` : ""}
            {" · "}
            {session.transcript.length} lines · {session.responses.length} responses
          </p>
        </div>
      </div>
    </div>
  );
}

export default function MeetingsPage() {
  const { clone, isLoading } = useClone();
  const [urlInput, setUrlInput] = useState("");
  const [joining, setJoining] = useState(false);
  const [activeBotId, setActiveBotId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<MeetingSession[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!clone) return;
    setLoadingHistory(true);
    getMeetingSessions(clone.clone_id)
      .then((d) => setSessions(d.sessions))
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, [clone, activeBotId]);

  if (isLoading) return <LoadingSpinner />;
  if (!clone) {
    return (
      <div className="p-8">
        <p className="text-sm text-white/40">
          Create your clone first.{" "}
          <a href="/dashboard" className="text-white/60 underline underline-offset-2">Overview →</a>
        </p>
      </div>
    );
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!urlInput.trim() || !clone) return;
    setJoining(true);
    try {
      const { bot_id } = await joinMeeting(clone.clone_id, urlInput.trim());
      setActiveBotId(bot_id);
      setUrlInput("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to join meeting");
    } finally {
      setJoining(false);
    }
  }

  const pastSessions = sessions.filter(
    (s) => s.status === "ended" || s.status === "error"
  );

  return (
    <div className="p-8 max-w-3xl flex flex-col gap-6">
      <div className="mb-2">
        <h1 className="text-2xl font-light text-white/85">Meetings</h1>
        <p className="text-sm text-white/35 mt-1">
          Send your clone to any Zoom, Meet, or Teams call. It listens and responds when called.
        </p>
      </div>

      {/* Join form */}
      {!activeBotId ? (
        <div className="glass rounded-2xl p-6">
          <h3 className="text-sm font-medium text-white/60 mb-1">Join a meeting</h3>
          <p className="text-xs text-white/35 mb-4 leading-relaxed">
            Paste a Zoom, Google Meet, or Teams URL. Your clone joins, listens, and responds when
            someone mentions{" "}
            <span className="text-white/55">{clone.display_name.split(" ")[0]}</span>.
          </p>
          <form onSubmit={handleJoin} className="flex gap-2">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://zoom.us/j/123456789"
              className="flex-1 glass rounded-xl px-4 py-2.5 text-sm text-white/80 placeholder:text-white/25 outline-none font-mono"
            />
            <button
              type="submit"
              disabled={joining || !urlInput.trim()}
              className="glass-md hover:glass-hi rounded-xl px-5 py-2.5 text-sm text-white/70 hover:text-white/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {joining ? "Joining…" : "Join →"}
            </button>
          </form>

          <div className="mt-4 flex items-start gap-2">
            <svg className="text-white/20 mt-0.5 shrink-0" width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M6 4v3M6 8.5h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            <p className="text-[11px] text-white/25 leading-relaxed">
              Requires a{" "}
              <a
                href="https://www.recall.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/40 hover:text-white/60 underline underline-offset-2"
              >
                Recall.ai
              </a>{" "}
              API key configured in your environment. Set <code className="text-white/35">RECALL_API_KEY</code>.
            </p>
          </div>
        </div>
      ) : (
        <ActiveMeeting
          botId={activeBotId}
          onLeave={() => setActiveBotId(null)}
        />
      )}

      {/* How it works */}
      {!activeBotId && (
        <div className="glass rounded-2xl p-6">
          <h3 className="text-sm font-medium text-white/60 mb-4">How it works</h3>
          <div className="flex flex-col gap-3">
            {[
              {
                step: "1",
                title: "Bot joins",
                desc: `Your clone enters the meeting as "${clone.display_name}'s Doppel" and sends a greeting.`,
              },
              {
                step: "2",
                title: "Listens for trigger",
                desc: `When someone mentions "${clone.display_name.split(" ")[0]}", the bot activates and processes the question.`,
              },
              {
                step: "3",
                title: "Responds in chat",
                desc: "The answer is posted in the meeting chat, sourced from your brain's knowledge.",
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-3">
                <div className="w-5 h-5 rounded-full glass-md flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[10px] text-white/50 font-medium">{step}</span>
                </div>
                <div>
                  <p className="text-xs font-medium text-white/60">{title}</p>
                  <p className="text-[11px] text-white/30 mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Session history */}
      {pastSessions.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <h3 className="text-sm font-medium text-white/60">Past meetings</h3>
          </div>
          {loadingHistory ? (
            <div className="px-5 py-4 text-xs text-white/30">Loading…</div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {pastSessions.map((s) => (
                <SessionHistoryRow key={s.bot_id} session={s} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


"use client";

import { useState, useEffect, useRef } from "react";
import { useClone } from "@/lib/hooks/useClone";
import { getMeetingSessions } from "@/lib/api";
import type { MeetingSession, TranscriptEntry, MeetingResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

// Web Speech API ambient types
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any;
  }
}

type Platform = "zoom" | "meet" | "teams" | "other";

const PLATFORM_LABELS: Record<Platform, string> = {
  zoom: "Zoom",
  meet: "Google Meet",
  teams: "Teams",
  other: "Other",
};

const PLATFORM_ICONS: Record<Platform, React.ReactNode> = {
  zoom: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect width="14" height="14" rx="3" fill="currentColor" fillOpacity="0.15" />
      <path d="M2 5a1 1 0 011-1h5a1 1 0 011 1v4a1 1 0 01-1 1H3a1 1 0 01-1-1V5zM9 5.5l3-2v7l-3-2V5.5z" fill="currentColor" />
    </svg>
  ),
  meet: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect width="14" height="14" rx="3" fill="currentColor" fillOpacity="0.15" />
      <path d="M7 3.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" fill="currentColor" fillOpacity="0.5" />
      <path d="M7 5.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" fill="currentColor" />
    </svg>
  ),
  teams: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect width="14" height="14" rx="3" fill="currentColor" fillOpacity="0.15" />
      <path d="M5 4h4M7 4v6M4 7h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  other: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect width="14" height="14" rx="3" fill="currentColor" fillOpacity="0.15" />
      <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
};

const STATUS_DOT: Record<string, string> = {
  joining: "bg-amber-400/60 animate-pulse",
  in_call: "bg-emerald-400/70",
  ended: "bg-white/20",
  error: "bg-red-400/60",
};

function getWsBase(): string {
  const http = process.env.NEXT_PUBLIC_FASTAPI_URL ?? "https://doppel.up.railway.app";
  return http.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
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

function MicIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={active ? "text-emerald-400/80" : "text-white/40"}
    >
      <rect x="5" y="1" width="6" height="9" rx="3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.5 8a5.5 5.5 0 0010 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="8" y1="13.5" x2="8" y2="15.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function ActiveSession({
  cloneId,
  cloneName,
  platform,
  onEnd,
}: {
  cloneId: string;
  cloneName: string;
  platform: Platform;
  onEnd: () => void;
}) {
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [responses, setResponses] = useState<MeetingResponse[]>([]);
  const [connStatus, setConnStatus] = useState<"connecting" | "live" | "error">("connecting");
  const [errorMsg, setErrorMsg] = useState("");
  const [ending, setEnding] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wsBase = getWsBase();
    const ws = new WebSocket(
      `${wsBase}/meetings/stream?clone_id=${encodeURIComponent(cloneId)}&platform=${platform}`
    );
    wsRef.current = ws;

    ws.onopen = () => {
      const SR =
        (typeof window !== "undefined" &&
          (window.SpeechRecognition || window.webkitSpeechRecognition)) ||
        null;
      if (!SR) {
        setErrorMsg("Speech recognition is not supported in this browser. Use Chrome.");
        setConnStatus("error");
        ws.close();
        return;
      }

      const recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = "en-US";
      recognitionRef.current = recognition;

      recognition.onresult = (event: { resultIndex: number; results: ({ isFinal: boolean } & { [i: number]: { transcript: string } })[]; }) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            const text = event.results[i][0].transcript.trim();
            if (!text) continue;
            const entry: TranscriptEntry = {
              speaker: "You",
              text,
              ts: new Date().toISOString(),
            };
            setTranscript((prev) => [...prev, entry]);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "transcript", speaker: "You", text }));
            }
          }
        }
      };

      recognition.onerror = (e: { error: string }) => {
        if (e.error === "not-allowed") {
          setErrorMsg("Microphone access denied. Allow mic access and try again.");
          setConnStatus("error");
        }
      };

      recognition.onend = () => {
        // restart unless we're ending
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          try { recognition.start(); } catch {}
        }
      };

      recognition.start();
      setConnStatus("live");
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "response") {
          setResponses((prev) => [
            ...prev,
            { question: msg.question, answer: msg.answer, ts: msg.ts },
          ]);
        }
      } catch {}
    };

    ws.onerror = () => {
      setConnStatus("error");
      setErrorMsg("Could not connect to backend. Check that the server is running.");
    };

    ws.onclose = () => {
      recognitionRef.current?.stop();
    };

    return () => {
      recognitionRef.current?.stop();
      if (ws.readyState !== WebSocket.CLOSED) ws.close();
    };
  }, [cloneId, platform]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript.length]);

  function handleEnd() {
    setEnding(true);
    recognitionRef.current?.stop();
    wsRef.current?.close();
    onEnd();
  }

  if (connStatus === "error") {
    return (
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start gap-3">
          <div className="w-2 h-2 rounded-full bg-red-400/60 mt-1.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-white/60">Session error</p>
            <p className="text-xs text-white/35 mt-1 leading-relaxed">{errorMsg}</p>
          </div>
        </div>
        <button
          onClick={onEnd}
          className="mt-4 glass hover:glass-md rounded-xl px-4 py-2 text-xs text-white/50 hover:text-white/70 transition-all"
        >
          Dismiss
        </button>
      </div>
    );
  }

  if (connStatus === "connecting") {
    return (
      <div className="glass rounded-2xl p-6 flex items-center gap-3">
        <div className="w-4 h-4 rounded-full border border-white/20 border-t-white/60 animate-spin" />
        <p className="text-sm text-white/40">Starting session…</p>
      </div>
    );
  }

  const firstName = cloneName.split(" ")[0];

  return (
    <div className="glass rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400/70 animate-pulse" />
            <span className="text-sm font-medium text-white/75">Live</span>
          </div>
          <span className="text-white/20">·</span>
          <div className="flex items-center gap-1.5 text-white/35">
            {PLATFORM_ICONS[platform]}
            <span className="text-xs">{PLATFORM_LABELS[platform]}</span>
          </div>
          <span className="text-white/20">·</span>
          <div className="flex items-center gap-1.5">
            <MicIcon active />
            <span className="text-xs text-white/35">Listening</span>
          </div>
        </div>
        <button
          onClick={handleEnd}
          disabled={ending}
          className="glass hover:glass-md rounded-xl px-4 py-2 text-xs text-white/50 hover:text-white/70 transition-all disabled:opacity-40"
        >
          {ending ? "Ending…" : "End session"}
        </button>
      </div>

      <div className="grid grid-cols-2 divide-x divide-white/[0.05]" style={{ minHeight: 320 }}>
        {/* Transcript */}
        <div className="flex flex-col">
          <div className="px-4 py-2.5 border-b border-white/[0.05] flex items-center justify-between">
            <p className="text-[11px] text-white/35 font-medium">Live transcript</p>
            {transcript.length > 0 && (
              <button
                onClick={() => setTranscript([])}
                className="text-[10px] text-white/20 hover:text-white/50 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5 max-h-72">
            {transcript.length === 0 ? (
              <p className="text-xs text-white/25 text-center pt-8">
                Speak to start the transcript.
              </p>
            ) : (
              transcript.map((entry, i) => <TranscriptLine key={i} entry={entry} />)
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        {/* Clone responses */}
        <div className="flex flex-col">
          <div className="px-4 py-2.5 border-b border-white/[0.05] flex items-center justify-between">
            <p className="text-[11px] text-white/35 font-medium">Clone responses</p>
            {responses.length > 0 && (
              <button
                onClick={() => setResponses([])}
                className="text-[10px] text-white/20 hover:text-white/50 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-72">
            {responses.length === 0 ? (
              <p className="text-xs text-white/25 text-center pt-8">
                Say &quot;{firstName}&quot; to trigger a response.
              </p>
            ) : (
              responses.map((r, i) => <ResponseCard key={i} response={r} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SessionHistoryRow({ session }: { session: MeetingSession }) {
  const duration =
    session.started_at && session.ended_at
      ? Math.round(
          (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000
        )
      : null;

  return (
    <div className="py-3 px-4 flex items-center gap-4">
      <div className="text-white/30 shrink-0">
        {PLATFORM_ICONS[(session.platform as Platform) ?? "other"] ?? PLATFORM_ICONS.other}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white/55 capitalize">{session.platform} session</p>
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
  const [platform, setPlatform] = useState<Platform>("zoom");
  const [sessionActive, setSessionActive] = useState(false);
  const [sessions, setSessions] = useState<MeetingSession[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!clone) return;
    setLoadingHistory(true);
    getMeetingSessions(clone.clone_id)
      .then((d) => setSessions(d.sessions))
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, [clone, sessionActive]);

  if (isLoading) return <LoadingSpinner />;
  if (!clone) {
    return (
      <div className="p-8">
        <p className="text-sm text-white/40">
          Create your clone first.{" "}
          <a href="/onboarding" className="text-white/60 underline underline-offset-2">
            Get started →
          </a>
        </p>
      </div>
    );
  }

  const firstName = clone.display_name.split(" ")[0];
  const pastSessions = sessions.filter((s) => s.status === "ended" || s.status === "error");

  return (
    <div className="p-8 max-w-5xl flex flex-col gap-6">
      <div className="mb-2">
        <h1 className="text-2xl font-light text-white/85">Meetings</h1>
        <p className="text-sm text-white/35 mt-1">
          Start a listening session during any call. Your clone responds when it hears its name.
        </p>
      </div>

      {sessionActive ? (
        <ActiveSession
          cloneId={clone.clone_id}
          cloneName={clone.display_name}
          platform={platform}
          onEnd={() => setSessionActive(false)}
        />
      ) : (
        <div className="glass rounded-2xl p-6">
          <h3 className="text-sm font-medium text-white/60 mb-1">Start a session</h3>
          <p className="text-xs text-white/35 mb-5 leading-relaxed">
            Open your meeting, then start a session here. Your browser microphone captures the
            conversation. When someone mentions{" "}
            <span className="text-white/55">{firstName}</span>, the clone answers in this window.
          </p>

          <div className="flex items-center gap-3">
            {/* Platform selector */}
            <div className="relative">
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Platform)}
                className="appearance-none bg-white/[0.05] border border-white/[0.08] rounded-xl pl-3 pr-8 py-2.5 text-sm text-white/60 outline-none focus:border-white/20 cursor-pointer"
              >
                {(Object.keys(PLATFORM_LABELS) as Platform[]).map((p) => (
                  <option key={p} value={p} className="bg-neutral-900">
                    {PLATFORM_LABELS[p]}
                  </option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30"
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
              >
                <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </div>

            <button
              onClick={() => setSessionActive(true)}
              className="glass-hi hover:bg-white/[0.14] rounded-xl px-5 py-2.5 text-sm text-white/80 hover:text-white/90 transition-all flex items-center gap-2"
            >
              <MicIcon active={false} />
              Start listening
            </button>
          </div>

          <div className="mt-4 flex items-start gap-2">
            <svg
              className="text-white/20 mt-0.5 shrink-0"
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
            >
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
              <path
                d="M6 4v3M6 8.5h.01"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            <p className="text-[11px] text-white/25 leading-relaxed">
              Uses your browser&apos;s built-in speech recognition. No external API key required.
              Works best in Chrome. Allow microphone access when prompted.
            </p>
          </div>
        </div>
      )}

      {/* How it works */}
      {!sessionActive && (
        <div className="glass rounded-2xl p-6">
          <h3 className="text-sm font-medium text-white/60 mb-4">How it works</h3>
          <div className="flex flex-col gap-3">
            {[
              {
                step: "1",
                title: "Join your meeting",
                desc: `Open Zoom, Meet, Teams, or any call in a browser tab or the desktop app.`,
              },
              {
                step: "2",
                title: "Start a session here",
                desc: `Click "Start listening". Your mic transcribes the conversation in real time.`,
              },
              {
                step: "3",
                title: "Trigger the clone",
                desc: `When someone says "${firstName}", the clone processes the question and displays a response here.`,
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
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <h3 className="text-sm font-medium text-white/60">Past sessions</h3>
            <button
              onClick={() => setSessions((prev) => prev.filter((s) => s.status !== "ended" && s.status !== "error"))}
              className="text-[11px] text-white/20 hover:text-red-400/50 transition-colors"
            >
              Clear history
            </button>
          </div>
          {loadingHistory ? (
            <div className="px-5 py-4 text-xs text-white/30">Loading…</div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {pastSessions.map((s, i) => (
                <SessionHistoryRow key={s.bot_id ?? i} session={s} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

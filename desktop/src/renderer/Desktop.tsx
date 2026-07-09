import React, { useCallback, useEffect, useRef, useState } from "react";

// ── Constants ──────────────────────────────────────────────────────────────────

const BACKEND = "https://doppel.up.railway.app";

// Module-level user id — set once Clerk loads
let _userId = "";
let _userName   = "";
let _userInitial = "?";

function api(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers as HeadersInit | undefined);
  if (_userId) headers.set("X-User-Id", _userId);
  return fetch(`${BACKEND}${path}`, { ...init, headers });
}

const DOPPEL_BLUE = "#1A73E8";
const DOPPEL_BLUE_SOFT = "rgba(26,115,232,0.08)";

const COLOR_PALETTE = [
  "#1A73E8", "#7B1FA2", "#E91E63", "#F57C00",
  "#2E7D32", "#546E7A", "#00838F", "#8E24AA",
];
function deriveColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLOR_PALETTE[h % COLOR_PALETTE.length];
}

const PALETTE_LIST = ["#7C3AED","#2563EB","#0891B2","#059669","#D97706","#DC2626","#BE185D","#0E7490"];
function listColor(name: string): string {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE_LIST[h % PALETTE_LIST.length];
}

function uuid(): string { return crypto.randomUUID(); }

// ── Types ──────────────────────────────────────────────────────────────────────

interface Clone {
  clone_id: string;
  display_name: string;
  handle: string;
  avatar_url?: string | null;
  listing_title?: string | null;
  category?: string | null;
}

interface OrgClone {
  clone_id: string;
  display_name: string;
  handle: string;
  avatar_url?: string | null;
  category?: string | null;
}

interface ChatMessage {
  id: string;
  role: "user" | "clone";
  content: string;
  isStreaming?: boolean;
  trace_id?: string;
  confidence?: number;
  needs_escalation?: boolean;
}

interface WorkflowDraft {
  name: string;
  description?: string;
  trigger?: { type: string; [key: string]: unknown };
  conditions?: unknown[];
  actions?: unknown[];
}

type FeedbackSignal = "approved" | "rejected" | "edited";
type ResponseMode = "fast" | "pro" | "extended";
type AgentEvent =
  | { type: "status";  message: string }
  | { type: "thought"; text: string }
  | { type: "action";  action: string; detail: string }
  | { type: "brain";   query: string; result: string }
  | { type: "done";    result: string }
  | { type: "error";   message: string };
type ActivityKind = "task" | "automation" | "workflow";

interface ActivityItem {
  id: string; kind: ActivityKind; name: string; status: string;
  description?: string; created_at: string; raw: Record<string, unknown>;
}

const MODES: { value: ResponseMode; label: string; hint: string }[] = [
  { value: "fast",     label: "Fast",     hint: "Quick answer · <1s"   },
  { value: "pro",      label: "Pro",      hint: "Reasoning · ~4s"      },
  { value: "extended", label: "Extended", hint: "Deep thinking · ~15s" },
];

const KIND_LABELS: Record<ActivityKind, string> = { task: "task", automation: "automation", workflow: "workflow" };
const STATUS_COLOR: Record<string, string> = {
  completed: "rgba(52,211,153,0.65)", done: "rgba(52,211,153,0.65)",
  active: "rgba(52,211,153,0.65)", running: "rgba(52,211,153,0.65)",
  pending: "rgba(255,255,255,0.35)", scheduled: "rgba(255,255,255,0.35)",
  failed: "rgba(248,113,113,0.65)", error: "rgba(248,113,113,0.65)",
  paused: "rgba(255,255,255,0.28)",
};

// ── Icons ──────────────────────────────────────────────────────────────────────

const INewChat = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;
const ITrash = () => <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M5.5 3.5V2.5h3v1M4 3.5l.7 8h4.6l.7-8M5.5 6v4M8.5 6v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IShare = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 11V2M8 2L5 5M8 2l3 3M3 9v4a1 1 0 001 1h8a1 1 0 001-1V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IMore = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="3.5" cy="8" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="12.5" cy="8" r="1.2"/></svg>;
const ISend = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 8l12-5-4 12-3-5-5-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="currentColor"/></svg>;
const IAgent = () => <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="2" y="5" width="12" height="8" rx="2" stroke="currentColor" strokeWidth="1.3" opacity="0.8"/><path d="M5 5V4a3 3 0 016 0v1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.6"/><circle cx="5.5" cy="9" r="1" fill="currentColor" opacity="0.7"/><circle cx="10.5" cy="9" r="1" fill="currentColor" opacity="0.7"/><path d="M6.5 11.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/></svg>;
const ISparkle = () => <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2l1.2 3.6L13 7l-3.8 1.4L8 12l-1.2-3.6L3 7l3.8-1.4z" opacity="0.85"/></svg>;

// ── Markdown ───────────────────────────────────────────────────────────────────

function MarkdownRenderer({ content }: { content: string }) {
  const html = content
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code style='background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:4px;font-size:0.9em;font-family:monospace'>$1</code>")
    .replace(/\n/g, "<br/>");
  return <span style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.82)" }} dangerouslySetInnerHTML={{ __html: html }} />;
}

// ── SchedulePicker (inlined) ───────────────────────────────────────────────────

const ITEM_H = 42;
function WheelPicker({ items, selected, onChange, width = 80 }: { items: { label: string; value: string }[]; selected: string; onChange: (v: string) => void; width?: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userScrolling = useRef(false);
  useEffect(() => {
    if (userScrolling.current) return;
    const idx = items.findIndex(i => i.value === selected);
    if (scrollRef.current && idx >= 0) scrollRef.current.scrollTop = idx * ITEM_H;
  }, [selected, items]);
  function handleScroll() {
    userScrolling.current = true;
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => {
      userScrolling.current = false;
      if (!scrollRef.current) return;
      const idx = Math.max(0, Math.min(items.length - 1, Math.round(scrollRef.current.scrollTop / ITEM_H)));
      scrollRef.current.scrollTo({ top: idx * ITEM_H, behavior: "smooth" });
      onChange(items[idx].value);
    }, 90);
  }
  return (
    <div style={{ position: "relative", width, height: ITEM_H * 3, overflow: "hidden", flexShrink: 0 }}>
      <style>{`.wp-scroll::-webkit-scrollbar{display:none}`}</style>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2, background: "linear-gradient(to bottom, rgba(15,15,15,0.96) 0%, rgba(15,15,15,0) 32%, rgba(15,15,15,0) 68%, rgba(15,15,15,0.96) 100%)" }} />
      <div style={{ position: "absolute", left: 4, right: 4, top: ITEM_H, height: ITEM_H, background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 9, pointerEvents: "none", zIndex: 1 }} />
      <div ref={scrollRef} onScroll={handleScroll} className="wp-scroll" style={{ height: "100%", overflowY: "scroll", paddingTop: ITEM_H, paddingBottom: ITEM_H, scrollbarWidth: "none" } as React.CSSProperties}>
        {items.map((item, i) => (
          <div key={item.value} onClick={() => { onChange(item.value); scrollRef.current?.scrollTo({ top: i * ITEM_H, behavior: "smooth" }); }} style={{ height: ITEM_H, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: item.value === selected ? 500 : 400, color: item.value === selected ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.28)", cursor: "pointer", userSelect: "none", transition: "color 0.15s" }}>
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

type Freq = "hourly" | "daily" | "weekdays" | "weekly" | "monthly";
const DAYS = ["mon","tue","wed","thu","fri","sat","sun"];
const DAY_LABEL: Record<string,string> = { mon:"Mon",tue:"Tue",wed:"Wed",thu:"Thu",fri:"Fri",sat:"Sat",sun:"Sun" };
const HOURS = Array.from({ length: 24 }, (_,i) => ({ value: String(i).padStart(2,"0"), label: String(i).padStart(2,"0") }));
const MINS  = Array.from({ length: 12 }, (_,i) => ({ value: String(i*5).padStart(2,"0"), label: String(i*5).padStart(2,"0") }));
const MONTH_DAYS = Array.from({ length: 31 }, (_,i) => ({ value: String(i+1), label: String(i+1) }));
function roundMin(m: string): string { return String(Math.round(parseInt(m,10)/5)*5%60).padStart(2,"0"); }
function buildSchedule(freq: Freq, day: string, hour: string, min: string, mday: string): string {
  if (freq === "hourly")   return "hourly";
  if (freq === "daily")    return `daily:${hour}:${min}`;
  if (freq === "weekdays") return `weekdays:${hour}:${min}`;
  if (freq === "weekly")   return `weekly:${day}:${hour}:${min}`;
  return `monthly:${mday}:${hour}:${min}`;
}
function parseSchedule(s: string) {
  if (s === "hourly") return { freq: "hourly" as Freq, day: "mon", hour: "09", min: "00", mday: "1" };
  const p = s.split(":");
  const freq = p[0] as Freq;
  if (freq === "daily")    return { freq, day: "mon", hour: p[1]??"09", min: roundMin(p[2]??"00"), mday: "1" };
  if (freq === "weekdays") return { freq, day: "mon", hour: p[1]??"09", min: roundMin(p[2]??"00"), mday: "1" };
  if (freq === "weekly")   return { freq, day: p[1]??"mon", hour: p[2]??"09", min: roundMin(p[3]??"00"), mday: "1" };
  if (freq === "monthly")  return { freq, day: "mon", hour: p[2]??"09", min: roundMin(p[3]??"00"), mday: p[1]??"1" };
  return { freq: "daily" as Freq, day: "mon", hour: "09", min: "00", mday: "1" };
}
function humanLabel(s: string): string {
  if (s === "hourly") return "Every hour";
  const p = s.split(":");
  const pad = (v: string) => v.padStart(2,"0");
  const fmtTime = (h: string, m: string) => { const hh = parseInt(h,10); const sfx = hh>=12?"PM":"AM"; const d = hh===0?12:hh>12?hh-12:hh; return `${d}:${pad(m)} ${sfx}`; };
  if (p[0]==="daily")    return `Every day at ${fmtTime(p[1],p[2])}`;
  if (p[0]==="weekdays") return `Every weekday at ${fmtTime(p[1],p[2])}`;
  if (p[0]==="weekly")   return `Every ${DAY_LABEL[p[1]]??p[1]} at ${fmtTime(p[2],p[3])}`;
  if (p[0]==="monthly")  { const d=parseInt(p[1],10); const sx=d===1?"st":d===2?"nd":d===3?"rd":"th"; return `${d}${sx} of each month at ${fmtTime(p[2],p[3])}`; }
  return s;
}

function SchedulePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parsed = parseSchedule(value);
  const [freq, setFreq] = useState<Freq>(parsed.freq);
  const [day,  setDay]  = useState(parsed.day);
  const [hour, setHour] = useState(parsed.hour);
  const [min,  setMin]  = useState(parsed.min);
  const [mday, setMday] = useState(parsed.mday);
  function emit(f=freq,d=day,h=hour,m=min,md=mday) { onChange(buildSchedule(f,d,h,m,md)); }
  const FREQ_TABS: { value: Freq; label: string }[] = [
    { value:"hourly",label:"Hourly"},{value:"daily",label:"Daily"},{value:"weekdays",label:"Weekdays"},{value:"weekly",label:"Weekly"},{value:"monthly",label:"Monthly"},
  ];
  return (
    <div style={{ background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:14,padding:"16px 16px 18px" }}>
      <div style={{ display:"flex",gap:4,marginBottom:freq!=="hourly"?18:0,flexWrap:"wrap" }}>
        {FREQ_TABS.map(tab => <button key={tab.value} onClick={() => { setFreq(tab.value); emit(tab.value,day,hour,min,mday); }} style={{ fontSize:12,padding:"5px 13px",borderRadius:20,cursor:"pointer",background:freq===tab.value?"rgba(255,255,255,0.10)":"transparent",border:`1px solid ${freq===tab.value?"rgba(255,255,255,0.18)":"rgba(255,255,255,0.07)"}`,color:freq===tab.value?"rgba(255,255,255,0.88)":"rgba(255,255,255,0.38)",fontFamily:"inherit",transition:"all 0.14s" }}>{tab.label}</button>)}
      </div>
      {freq==="weekly" && (
        <div style={{ display:"flex",gap:4,marginBottom:18 }}>
          {DAYS.map(d => <button key={d} onClick={() => { setDay(d); emit(freq,d,hour,min,mday); }} style={{ flex:1,fontSize:11,padding:"6px 0",borderRadius:8,cursor:"pointer",background:day===d?"rgba(255,255,255,0.09)":"transparent",border:`1px solid ${day===d?"rgba(255,255,255,0.16)":"rgba(255,255,255,0.06)"}`,color:day===d?"rgba(255,255,255,0.85)":"rgba(255,255,255,0.32)",fontFamily:"inherit",transition:"all 0.14s" }}>{DAY_LABEL[d]}</button>)}
        </div>
      )}
      {freq!=="hourly" && (
        <div style={{ display:"flex",alignItems:"flex-end",justifyContent:"center",gap:0 }}>
          {freq==="monthly" && (<><div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:6 }}><span style={{ fontSize:10,color:"rgba(255,255,255,0.28)",textTransform:"uppercase",letterSpacing:"0.07em" }}>Day</span><WheelPicker items={MONTH_DAYS} selected={mday} width={64} onChange={v => { setMday(v); emit(freq,day,hour,min,v); }} /></div><div style={{ height:ITEM_H,display:"flex",alignItems:"center",padding:"0 8px",color:"rgba(255,255,255,0.15)",fontSize:18 }}>·</div></>)}
          <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:6 }}><span style={{ fontSize:10,color:"rgba(255,255,255,0.28)",textTransform:"uppercase",letterSpacing:"0.07em" }}>Hour</span><WheelPicker items={HOURS} selected={hour} width={72} onChange={v => { setHour(v); emit(freq,day,v,min,mday); }} /></div>
          <div style={{ height:ITEM_H,display:"flex",alignItems:"center",padding:"0 4px",fontSize:22,color:"rgba(255,255,255,0.30)",fontWeight:300 }}>:</div>
          <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:6 }}><span style={{ fontSize:10,color:"rgba(255,255,255,0.28)",textTransform:"uppercase",letterSpacing:"0.07em" }}>Min</span><WheelPicker items={MINS} selected={min} width={72} onChange={v => { setMin(v); emit(freq,day,hour,v,mday); }} /></div>
        </div>
      )}
      <p style={{ fontSize:11,color:"rgba(255,255,255,0.35)",textAlign:"center",marginTop:14,lineHeight:1.4 }}>{humanLabel(value)}</p>
    </div>
  );
}

// ── Chat hook ──────────────────────────────────────────────────────────────────

function useWebChat({ clone, sessionId, userId, responseMode, onToolEvent }: {
  clone: Clone; sessionId: string; userId: string;
  responseMode: ResponseMode; onToolEvent?: (e: AgentEvent) => void;
}) {
  const [messages,       setMessages]       = useState<ChatMessage[]>([]);
  const [isLoading,      setIsLoading]      = useState(false);
  const [isThinking,     setIsThinking]     = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [workflowDrafts, setWorkflowDrafts] = useState<Record<string, WorkflowDraft>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef(sessionId);

  useEffect(() => { sessionRef.current = sessionId; setMessages([]); setError(null); }, [sessionId]);

  useEffect(() => {
    const stored = localStorage.getItem(`doppel_web_chat:${clone.clone_id}`);
    if (stored) { try { const p: ChatMessage[] = JSON.parse(stored); if (p.length > 0) setMessages(p.filter(m => !m.isStreaming)); } catch { /* */ } }
  }, [sessionId, clone.clone_id]);

  useEffect(() => {
    const toStore = messages.filter(m => !m.isStreaming);
    if (toStore.length === 0) return;
    try { localStorage.setItem(`doppel_web_chat:${clone.clone_id}`, JSON.stringify(toStore)); } catch { /* */ }
  }, [messages, clone.clone_id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;
    const userMsg: ChatMessage    = { id: uuid(), role: "user",  content: content.trim() };
    const cloneMsgId               = uuid();
    const placeholder: ChatMessage = { id: cloneMsgId, role: "clone", content: "", isStreaming: true };
    setMessages(prev => [...prev, userMsg, placeholder]);
    setIsLoading(true); setIsThinking(false); setError(null);
    try {
      const res = await api("/brain/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clone_id: clone.clone_id, session_id: sessionRef.current,
          message: content.trim(), context_type: "chat",
          response_mode: responseMode, owner_mode: true,
          metadata: { memory_enabled: true },
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error((errBody as { detail?: string; error?: string }).detail ?? (errBody as { detail?: string; error?: string }).error ?? `Request failed (${res.status})`);
      }
      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "", accText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim(); if (!raw) continue;
          let evt: Record<string, unknown>; try { evt = JSON.parse(raw); } catch { continue; }
          if (evt.event === "thinking") { setIsThinking(true); }
          else if (evt.event === "token") { setIsThinking(false); accText += evt.text as string; setMessages(prev => prev.map(m => m.id === cloneMsgId ? { ...m, content: accText } : m)); }
          else if (evt.event === "tool_call") { onToolEvent?.({ type: "action", action: evt.tool as string, detail: (evt.detail as string) ?? "" }); }
          else if (evt.event === "tool_result") { onToolEvent?.({ type: "status", message: evt.status === "ok" ? `✓ ${evt.tool as string}` : `✗ ${evt.tool as string}` }); }
          else if (evt.event === "workflow_draft") { const d = evt.draft as WorkflowDraft | undefined; if (d?.name) setWorkflowDrafts(prev => ({ ...prev, [cloneMsgId]: d })); }
          else if (evt.event === "done") {
            setIsThinking(false);
            const final = (evt.corrected_response as string | null) ?? accText;
            setMessages(prev => prev.map(m => m.id === cloneMsgId ? { ...m, content: final, isStreaming: false, trace_id: evt.trace_id as string | undefined, confidence: evt.confidence as number | undefined, needs_escalation: evt.needs_escalation as boolean | undefined } : m));
            const wfd = evt.workflow_draft as WorkflowDraft | undefined;
            if (wfd?.name) setWorkflowDrafts(prev => ({ ...prev, [cloneMsgId]: wfd }));
          } else if (evt.event === "error") { throw new Error(evt.message as string); }
        }
      }
    } catch (err) {
      setIsThinking(false); setError(err instanceof Error ? err.message : "Something went wrong");
      setMessages(prev => prev.filter(m => m.id !== cloneMsgId));
    } finally { setIsLoading(false); setIsThinking(false); }
  }, [clone.clone_id, responseMode, isLoading]);

  function clearMessages() {
    try { localStorage.removeItem(`doppel_web_chat:${clone.clone_id}`); } catch { /* */ }
    setMessages([]); setError(null);
  }

  return { messages, setMessages, workflowDrafts, isLoading, isThinking, error, sendMessage, clearMessages, scrollRef };
}

// ── WorkflowDraftCard ──────────────────────────────────────────────────────────

function WorkflowDraftCard({ draft, cloneId, onActivated }: { draft: WorkflowDraft; cloneId: string; onActivated: (name: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  async function activate() {
    setLoading(true); setErr(null);
    try {
      const res = await api(`/clones/${cloneId}/skills/deploy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clone_id: cloneId, workflow_draft: draft }) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); setErr((e as { detail?: string }).detail ?? "Failed to deploy."); return; }
      setDone(true); onActivated(draft.name);
    } catch { setErr("Network error."); } finally { setLoading(false); }
  }
  const triggerLabel = draft.trigger?.type === "schedule" ? "Schedule" : draft.trigger?.type === "poll_api" ? "Poll API" : draft.trigger?.type === "poll_webpage" ? "Monitor page" : draft.trigger?.type === "webhook" ? "Webhook" : draft.trigger?.type ?? "Trigger";
  return (
    <div style={{ marginTop:10,padding:"12px 14px",borderRadius:12,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)" }}>
      <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10,marginBottom:6 }}>
        <div style={{ flex:1,minWidth:0 }}>
          <p style={{ margin:"0 0 2px",fontSize:13,fontWeight:500,color:"rgba(255,255,255,0.85)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{draft.name}</p>
          {draft.description && <p style={{ margin:0,fontSize:11,color:"rgba(255,255,255,0.38)",lineHeight:1.5 }}>{draft.description}</p>}
        </div>
        <span style={{ fontSize:10,padding:"2px 8px",borderRadius:99,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.09)",color:"rgba(255,255,255,0.35)",whiteSpace:"nowrap",flexShrink:0 }}>workflow draft</span>
      </div>
      <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:10 }}>
        <span style={{ fontSize:10,padding:"2px 7px",borderRadius:6,background:"rgba(255,255,255,0.04)",color:"rgba(255,255,255,0.30)",border:"1px solid rgba(255,255,255,0.07)" }}>{triggerLabel}</span>
        {(draft.actions?.length ?? 0) > 0 && <span style={{ fontSize:10,color:"rgba(255,255,255,0.22)" }}>{draft.actions!.length} action{draft.actions!.length!==1?"s":""}</span>}
      </div>
      {err && <p style={{ fontSize:11,color:"rgba(248,113,113,0.70)",margin:"0 0 8px" }}>{err}</p>}
      {done
        ? <span style={{ fontSize:12,color:"rgba(52,211,153,0.75)",display:"inline-flex",alignItems:"center",gap:6 }}><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-7" stroke="rgba(52,211,153,0.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>Workflow activated</span>
        : <button onClick={activate} disabled={loading} style={{ fontSize:12,fontWeight:500,padding:"6px 16px",borderRadius:9,background:"rgba(255,255,255,0.09)",border:"1px solid rgba(255,255,255,0.14)",color:"rgba(255,255,255,0.80)",cursor:loading?"not-allowed":"pointer",opacity:loading?0.5:1,fontFamily:"inherit" }}>{loading?"Activating…":"Activate workflow"}</button>}
    </div>
  );
}

// ── MessageBubble ──────────────────────────────────────────────────────────────

function MessageBubble({ msg, cloneColor, cloneInitial, avatarUrl, cloneId, workflowDraft, onWorkflowActivated, onFeedbackSubmitted }: {
  msg: ChatMessage; cloneColor: string; cloneInitial: string; avatarUrl?: string | null;
  cloneId: string; workflowDraft?: WorkflowDraft | null;
  onWorkflowActivated?: (name: string) => void;
  onFeedbackSubmitted?: (msgId: string, signal: FeedbackSignal) => void;
}) {
  const [feedbackDone, setFeedbackDone] = useState<FeedbackSignal | null>(null);
  const [editMode,     setEditMode]     = useState(false);
  const [editText,     setEditText]     = useState(msg.content);
  const [submitting,   setSubmitting]   = useState(false);
  const displayContent = msg.content.replace(/<!--wf:[\s\S]*?-->/g, "").trim();

  async function submitFeedback(signal: FeedbackSignal, corrected?: string) {
    if (!msg.trace_id || submitting) return;
    setSubmitting(true);
    try {
      await api("/brain/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trace_id: msg.trace_id, clone_id: cloneId, signal_type: signal, corrected_response: corrected ?? null }) });
      setFeedbackDone(signal); setEditMode(false); onFeedbackSubmitted?.(msg.id, signal);
    } catch { /* non-fatal */ } finally { setSubmitting(false); }
  }

  if (msg.role === "user") {
    return (
      <div style={{ display:"flex",justifyContent:"flex-end",gap:12,maxWidth:"100%",animation:"msg-in 380ms cubic-bezier(0.34,1.56,0.64,1) both" }}>
        <div style={{ padding:"12px 15px",borderRadius:"14px 14px 4px 14px",background:DOPPEL_BLUE,color:"#fff",fontSize:14,lineHeight:1.55,maxWidth:"78%",wordBreak:"break-word",userSelect:"text",cursor:"text" }}>{msg.content}</div>
      </div>
    );
  }
  return (
    <div style={{ display:"flex",gap:12,maxWidth:"100%",animation:"msg-in 420ms cubic-bezier(0.34,1.56,0.64,1) both" }}>
      <div style={{ width:32,height:32,borderRadius:8,background:cloneColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:500,color:"#fff",flexShrink:0,marginTop:2,overflow:"hidden" }}>
        {avatarUrl ? <img src={avatarUrl} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none"}} /> : cloneInitial}
      </div>
      <div style={{ flex:1,minWidth:0 }}>
        <div style={{ padding:"12px 15px",borderRadius:"14px 14px 14px 4px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",maxWidth:"82%",wordBreak:"break-word",userSelect:"text",cursor:"text" }}>
          {msg.isStreaming && !msg.content
            ? <div style={{ display:"flex",alignItems:"center",gap:5 }}>{[0,1,2].map(i => <div key={i} style={{ width:6,height:6,borderRadius:"50%",background:"rgba(255,255,255,0.40)",animation:`typing-dot 1.2s ease-in-out ${i*0.2}s infinite` }} />)}</div>
            : <MarkdownRenderer content={displayContent} />}
        </div>
        {/* Feedback row */}
        {!msg.isStreaming && msg.content && msg.trace_id && (
          <div style={{ maxWidth:"82%",marginTop:6 }}>
            {feedbackDone
              ? <span style={{ fontSize:11,color:feedbackDone==="approved"?"rgba(52,211,153,0.65)":feedbackDone==="rejected"?"rgba(248,113,113,0.55)":"rgba(255,255,255,0.35)",display:"inline-flex",alignItems:"center",gap:5 }}>
                  {feedbackDone==="approved" && <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-7" stroke="rgba(52,211,153,0.80)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  {feedbackDone==="approved"?"Approved":feedbackDone==="rejected"?"Rejected":"Saved"}
                </span>
              : editMode
              ? <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
                  <textarea value={editText} onChange={e=>setEditText(e.target.value)} style={{ width:"100%",minHeight:80,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:10,padding:"8px 10px",fontSize:13,color:"rgba(255,255,255,0.80)",fontFamily:"inherit",resize:"vertical",outline:"none",boxSizing:"border-box",lineHeight:1.55 }} />
                  <div style={{ display:"flex",gap:6 }}>
                    <button onClick={()=>submitFeedback("edited",editText)} disabled={submitting||!editText.trim()} style={{ fontSize:11,fontWeight:500,padding:"4px 12px",borderRadius:7,background:"rgba(255,255,255,0.09)",border:"1px solid rgba(255,255,255,0.14)",color:"rgba(255,255,255,0.75)",cursor:"pointer",fontFamily:"inherit",opacity:submitting?0.5:1 }}>{submitting?"Saving…":"Save correction"}</button>
                    <button onClick={()=>setEditMode(false)} style={{ fontSize:11,padding:"4px 10px",borderRadius:7,background:"none",border:"1px solid rgba(255,255,255,0.07)",color:"rgba(255,255,255,0.30)",cursor:"pointer",fontFamily:"inherit" }}>Cancel</button>
                  </div>
                </div>
              : <div style={{ display:"flex",alignItems:"center",gap:4 }}>
                  <button onClick={()=>submitFeedback("approved")} disabled={submitting} style={{ display:"inline-flex",alignItems:"center",gap:4,fontSize:11,padding:"3px 10px",borderRadius:6,background:"rgba(52,211,153,0.06)",border:"1px solid rgba(52,211,153,0.14)",color:"rgba(52,211,153,0.65)",cursor:"pointer",fontFamily:"inherit",transition:"all 140ms" }} onMouseEnter={e=>{e.currentTarget.style.background="rgba(52,211,153,0.12)";e.currentTarget.style.borderColor="rgba(52,211,153,0.25)"}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(52,211,153,0.06)";e.currentTarget.style.borderColor="rgba(52,211,153,0.14)"}}><svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>Approve</button>
                  <button onClick={()=>setEditMode(true)} disabled={submitting} style={{ display:"inline-flex",alignItems:"center",gap:4,fontSize:11,padding:"3px 10px",borderRadius:6,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",color:"rgba(255,255,255,0.38)",cursor:"pointer",fontFamily:"inherit",transition:"all 140ms" }} onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.07)";e.currentTarget.style.color="rgba(255,255,255,0.60)"}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.04)";e.currentTarget.style.color="rgba(255,255,255,0.38)"}}><svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M11 2.5a1.4 1.4 0 012 2L5.5 12 2 13l1-3.5L11 2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>Edit</button>
                  <button onClick={()=>submitFeedback("rejected")} disabled={submitting} style={{ display:"inline-flex",alignItems:"center",gap:4,fontSize:11,padding:"3px 10px",borderRadius:6,background:"rgba(248,113,113,0.04)",border:"1px solid rgba(248,113,113,0.10)",color:"rgba(248,113,113,0.50)",cursor:"pointer",fontFamily:"inherit",transition:"all 140ms" }} onMouseEnter={e=>{e.currentTarget.style.background="rgba(248,113,113,0.09)";e.currentTarget.style.borderColor="rgba(248,113,113,0.22)"}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(248,113,113,0.04)";e.currentTarget.style.borderColor="rgba(248,113,113,0.10)"}}><svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>Reject</button>
                  {msg.confidence !== undefined && <span style={{ marginLeft:6,display:"inline-flex",alignItems:"center",gap:3,fontSize:10,padding:"2px 8px",borderRadius:999,background:msg.confidence>=0.7?"rgba(52,211,153,0.06)":msg.confidence>=0.4?"rgba(255,200,50,0.06)":"rgba(248,113,113,0.06)",border:`1px solid ${msg.confidence>=0.7?"rgba(52,211,153,0.14)":msg.confidence>=0.4?"rgba(255,200,50,0.14)":"rgba(248,113,113,0.14)"}`,color:msg.confidence>=0.7?"rgba(52,211,153,0.60)":msg.confidence>=0.4?"rgba(255,200,50,0.55)":"rgba(248,113,113,0.55)" }}>{Math.round(msg.confidence*100)}%</span>}
                </div>}
          </div>
        )}
        {workflowDraft && !msg.isStreaming && (
          <div style={{ maxWidth:"82%" }}><WorkflowDraftCard draft={workflowDraft} cloneId={cloneId} onActivated={name=>onWorkflowActivated?.(name)} /></div>
        )}
      </div>
    </div>
  );
}

// ── AutomateModal ──────────────────────────────────────────────────────────────

function AutomateModal({ cloneId, initialInstruction, onClose, onCreated }: { cloneId: string; initialInstruction: string; onClose: () => void; onCreated: (name: string, schedule: string) => void }) {
  const [name,        setName]        = useState(initialInstruction.slice(0,40)||"");
  const [instruction, setInstruction] = useState(initialInstruction);
  const [schedule,    setSchedule]    = useState("daily:09:00");
  const [loading,     setLoading]     = useState(false);
  const [err,         setErr]         = useState<string|null>(null);
  async function submit() {
    if (!name.trim()||!instruction.trim()) return;
    setLoading(true); setErr(null);
    try {
      const res = await api(`/clones/${cloneId}/automations`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clone_id:cloneId,name:name.trim(),instruction:instruction.trim(),schedule})});
      if (!res.ok) { setErr("Failed to create automation."); return; }
      onCreated(name.trim(),schedule);
    } catch { setErr("Network error. Try again."); } finally { setLoading(false); }
  }
  const inp: React.CSSProperties = { width:"100%",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:10,padding:"9px 12px",fontSize:13,color:"rgba(255,255,255,0.8)",fontFamily:"inherit",outline:"none",boxSizing:"border-box" };
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(8px)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center" }} onClick={onClose}>
      <div style={{ background:"#0f0f0f",border:"1px solid rgba(255,255,255,0.09)",borderRadius:20,padding:28,width:480,maxWidth:"90vw" }} onClick={e=>e.stopPropagation()}>
        <h2 style={{ fontSize:15,fontWeight:500,color:"rgba(255,255,255,0.85)",marginBottom:6 }}>Schedule automation</h2>
        <p style={{ fontSize:12,color:"rgba(255,255,255,0.35)",marginBottom:20 }}>Your clone will run this instruction on a schedule.</p>
        <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
          <div><label style={{ fontSize:11,color:"rgba(255,255,255,0.35)",display:"block",marginBottom:5 }}>Name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Weekly digest" style={inp} /></div>
          <div><label style={{ fontSize:11,color:"rgba(255,255,255,0.35)",display:"block",marginBottom:5 }}>Instruction</label><textarea value={instruction} onChange={e=>setInstruction(e.target.value)} style={{...inp,minHeight:72,resize:"vertical",lineHeight:1.6}} /></div>
          <div><label style={{ fontSize:11,color:"rgba(255,255,255,0.35)",display:"block",marginBottom:8 }}>Schedule</label><SchedulePicker value={schedule} onChange={setSchedule} /></div>
          {err && <p style={{ fontSize:11,color:"rgba(248,113,113,0.7)",margin:0 }}>{err}</p>}
        </div>
        <div style={{ display:"flex",justifyContent:"flex-end",gap:10,marginTop:18 }}>
          <button onClick={onClose} style={{ fontSize:13,padding:"7px 16px",borderRadius:10,background:"transparent",border:"1px solid rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.4)",cursor:"pointer",fontFamily:"inherit" }}>Cancel</button>
          <button onClick={submit} disabled={loading||!name.trim()||!instruction.trim()} style={{ fontSize:13,padding:"7px 18px",borderRadius:10,background:"rgba(255,255,255,0.09)",border:"1px solid rgba(255,255,255,0.14)",color:"rgba(255,255,255,0.85)",cursor:"pointer",fontFamily:"inherit",opacity:(loading||!name.trim()||!instruction.trim())?0.4:1 }}>{loading?"Saving…":"Create"}</button>
        </div>
      </div>
    </div>
  );
}

// ── ActivityPanel ──────────────────────────────────────────────────────────────

function ActivityPanel({ cloneId }: { cloneId: string }) {
  const [items,    setItems]    = useState<ActivityItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<ActivityItem|null>(null);
  const [err,      setErr]      = useState<string|null>(null);
  const [filter,   setFilter]   = useState<ActivityKind|"all">("all");

  async function load() {
    setLoading(true); setErr(null);
    try {
      const toArr = (v: unknown, key: string): Record<string,unknown>[] => {
        if (Array.isArray(v)) return v as Record<string,unknown>[];
        if (v && typeof v === "object") { const o = v as Record<string,unknown>; if (Array.isArray(o[key])) return o[key] as Record<string,unknown>[]; if (Array.isArray(o.items)) return o.items as Record<string,unknown>[]; if (Array.isArray(o.results)) return o.results as Record<string,unknown>[]; }
        return [];
      };
      const [tasksR, autoR, wfR] = await Promise.allSettled([
        api(`/clones/${cloneId}/tasks`).then(r => r.ok?r.json():[]),
        api(`/clones/${cloneId}/automations`).then(r => r.ok?r.json():[]),
        api(`/clones/${cloneId}/workflows`).then(r => r.ok?r.json():[]),
      ]);
      const all: ActivityItem[] = [];
      if (tasksR.status==="fulfilled") toArr(tasksR.value,"tasks").forEach((t) => all.push({id:t.id as string,kind:"task",name:(t.title??t.name) as string,status:(t.status as string)??"pending",description:(t.instruction??t.description) as string|undefined,created_at:(t.created_at as string)??new Date().toISOString(),raw:t}));
      if (autoR.status==="fulfilled") toArr(autoR.value,"automations").forEach((a) => all.push({id:a.id as string,kind:"automation",name:a.name as string,status:(a.status as string)??"active",description:(a.instruction??a.schedule) as string|undefined,created_at:(a.created_at as string)??new Date().toISOString(),raw:a}));
      if (wfR.status==="fulfilled") toArr(wfR.value,"workflows").forEach((w) => all.push({id:w.id as string,kind:"workflow",name:w.name as string,status:(w.status as string)??"active",description:w.description as string|undefined,created_at:(w.created_at as string)??new Date().toISOString(),raw:w}));
      all.sort((a,b) => new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
      setItems(all);
    } catch { setErr("Failed to load activity."); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [cloneId]);

  const visible = filter==="all" ? items : items.filter(i=>i.kind===filter);

  if (selected) {
    const s = selected; const statusColor = STATUS_COLOR[s.status]??"rgba(255,255,255,0.30)";
    return (
      <div style={{ flex:1,overflowY:"auto",padding:"20px 20px 40px" }} className="chat-scroll">
        <div style={{ maxWidth:680,margin:"0 auto" }}>
          <button onClick={()=>setSelected(null)} style={{ background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.35)",fontSize:12,fontFamily:"inherit",padding:"0 0 14px",display:"flex",alignItems:"center",gap:5 }} onMouseEnter={e=>{e.currentTarget.style.color="rgba(255,255,255,0.65)"}} onMouseLeave={e=>{e.currentTarget.style.color="rgba(255,255,255,0.35)"}}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>Back to activity
          </button>
          <div style={{ background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:16,padding:"20px 22px" }}>
            <div style={{ display:"flex",alignItems:"flex-start",gap:10,marginBottom:14 }}>
              <div style={{ flex:1 }}>
                <p style={{ margin:"0 0 4px",fontSize:16,fontWeight:500,color:"rgba(255,255,255,0.88)" }}>{s.name}</p>
                <div style={{ display:"flex",gap:7,alignItems:"center" }}>
                  <span style={{ fontSize:10,padding:"1px 7px",borderRadius:6,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.28)" }}>{KIND_LABELS[s.kind]}</span>
                  <span style={{ fontSize:11,color:statusColor }}>{s.status}</span>
                </div>
              </div>
            </div>
            {s.description && <p style={{ fontSize:13,color:"rgba(255,255,255,0.50)",lineHeight:1.6,margin:"0 0 16px" }}>{s.description}</p>}
            <div style={{ borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:14 }}>
              <p style={{ fontSize:10,letterSpacing:"0.10em",textTransform:"uppercase",color:"rgba(255,255,255,0.22)",margin:"0 0 10px" }}>Details</p>
              {Object.entries(s.raw).filter(([k])=>!["id","clone_id","created_at","updated_at","name","description","status","instruction"].includes(k)).map(([k,v])=>(
                <div key={k} style={{ display:"flex",gap:10,marginBottom:6 }}><span style={{ fontSize:11,color:"rgba(255,255,255,0.28)",minWidth:110 }}>{k.replace(/_/g," ")}</span><span style={{ fontSize:11,color:"rgba(255,255,255,0.55)",wordBreak:"break-all" }}>{typeof v==="object"?JSON.stringify(v):String(v??"—")}</span></div>
              ))}
              <div style={{ display:"flex",gap:10,marginBottom:6 }}><span style={{ fontSize:11,color:"rgba(255,255,255,0.28)",minWidth:110 }}>created</span><span style={{ fontSize:11,color:"rgba(255,255,255,0.55)" }}>{new Date(s.created_at).toLocaleString()}</span></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex:1,overflowY:"auto",padding:"16px 20px 40px" }} className="chat-scroll">
      <div style={{ maxWidth:680,margin:"0 auto" }}>
        <div style={{ display:"flex",gap:6,marginBottom:16,flexWrap:"wrap" }}>
          {(["all","task","automation","workflow"] as const).map(f => (
            <button key={f} onClick={()=>setFilter(f)} style={{ fontSize:11,fontWeight:500,padding:"4px 12px",borderRadius:99,border:`1px solid ${filter===f?"rgba(255,255,255,0.18)":"rgba(255,255,255,0.08)"}`,background:filter===f?"rgba(255,255,255,0.09)":"transparent",color:filter===f?"rgba(255,255,255,0.80)":"rgba(255,255,255,0.32)",cursor:"pointer",fontFamily:"inherit",transition:"all 160ms" }}>
              {f==="all"?"All":KIND_LABELS[f as ActivityKind]+"s"}
            </button>
          ))}
          <button onClick={load} style={{ marginLeft:"auto",fontSize:11,padding:"4px 10px",borderRadius:99,border:"1px solid rgba(255,255,255,0.07)",background:"transparent",color:"rgba(255,255,255,0.25)",cursor:"pointer",fontFamily:"inherit" }} onMouseEnter={e=>{e.currentTarget.style.color="rgba(255,255,255,0.55)"}} onMouseLeave={e=>{e.currentTarget.style.color="rgba(255,255,255,0.25)"}}>Refresh</button>
        </div>
        {loading && <div style={{ padding:"40px 0",display:"flex",justifyContent:"center",gap:5 }}>{[0,1,2].map(i=><div key={i} style={{ width:5,height:5,borderRadius:"50%",background:"rgba(255,255,255,0.22)",animation:`typing-dot 1.2s ease-in-out ${i*0.2}s infinite` }} />)}</div>}
        {err && <p style={{ fontSize:12,color:"rgba(248,113,113,0.60)",textAlign:"center",padding:"32px 0" }}>{err}</p>}
        {!loading && !err && visible.length===0 && <div style={{ padding:"56px 0",textAlign:"center" }}><p style={{ fontSize:13,color:"rgba(255,255,255,0.25)",margin:"0 0 4px" }}>Nothing here yet</p><p style={{ fontSize:11,color:"rgba(255,255,255,0.15)" }}>Ask your clone to do something — tasks, automations, and workflows appear here.</p></div>}
        {!loading && visible.map(item => {
          const statusColor = STATUS_COLOR[item.status]??"rgba(255,255,255,0.30)";
          return (
            <div key={item.id} onClick={()=>setSelected(item)} style={{ display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:12,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",marginBottom:6,cursor:"pointer",transition:"background 160ms,border-color 160ms" }} onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.06)";e.currentTarget.style.borderColor="rgba(255,255,255,0.12)"}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.03)";e.currentTarget.style.borderColor="rgba(255,255,255,0.07)"}}>
              <div style={{ flex:1,minWidth:0 }}>
                <p style={{ margin:"0 0 3px",fontSize:13,fontWeight:500,color:"rgba(255,255,255,0.78)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{item.name}</p>
                {item.description && <p style={{ margin:0,fontSize:11,color:"rgba(255,255,255,0.32)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{item.description}</p>}
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:7,flexShrink:0 }}>
                <span style={{ fontSize:10,padding:"1px 6px",borderRadius:5,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",color:"rgba(255,255,255,0.28)" }}>{KIND_LABELS[item.kind]}</span>
                <span style={{ fontSize:11,color:statusColor }}>{item.status}</span>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ color:"rgba(255,255,255,0.20)" }}><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── CloneChat ──────────────────────────────────────────────────────────────────

const hdrBtnStyle: React.CSSProperties = { width:32,height:32,borderRadius:8,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",color:"rgba(255,255,255,0.50)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 240ms" };

function CloneChat({ clone, userId }: { clone: Clone; userId: string }) {
  const [sessionId,           setSessionId]           = useState("");
  const [responseMode,        setResponseMode]        = useState<ResponseMode>("fast");
  const [input,               setInput]               = useState("");
  const [shareCopied,         setShareCopied]         = useState(false);
  const [moreOpen,            setMoreOpen]            = useState(false);
  const [activeView,          setActiveView]          = useState<"chat"|"activity"|"connectors">("chat");
  const [showAutomateModal,   setShowAutomateModal]   = useState(false);
  const [automateInstruction, setAutomateInstruction] = useState("");
  const [knowledgeAreas,      setKnowledgeAreas]      = useState<{area:string;depth:string}[]>([]);
  const [readiness,           setReadiness]           = useState<{is_ready:boolean;knowledge_ok:boolean;decision_making_ok:boolean;voice_ok:boolean;missing:string[]}|null>(null);
  const [autoSuggestions,     setAutoSuggestions]     = useState<string[]>([]);
  const [autoLoading,         setAutoLoading]         = useState(false);
  const [agentEvents,         setAgentEvents]         = useState<AgentEvent[]>([]);
  const [agentRunning,        setAgentRunning]        = useState(false);
  const [agentPanelOpen,      setAgentPanelOpen]      = useState(false);
  const autoDebounceRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const moreRef         = useRef<HTMLDivElement>(null);
  const textareaRef     = useRef<HTMLTextAreaElement>(null);
  const agentScrollRef  = useRef<HTMLDivElement>(null);

  const { messages, setMessages, workflowDrafts, isLoading, isThinking, error, sendMessage, clearMessages, scrollRef } = useWebChat({
    clone, sessionId, userId, responseMode,
    onToolEvent: (event) => { setAgentEvents(prev=>[...prev,event]); setAgentPanelOpen(true); setAgentRunning(true); },
  });

  useEffect(() => { if (!isLoading && agentRunning) { setAgentRunning(false); setAgentEvents(prev => { const last=prev[prev.length-1]; if (last&&last.type!=="done"&&last.type!=="error") return [...prev,{type:"done",result:""}]; return prev; }); } }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { agentScrollRef.current?.scrollTo({top:agentScrollRef.current.scrollHeight,behavior:"smooth"}); }, [agentEvents]);

  useEffect(() => {
    const key = `doppel_web_session:${userId}:${clone.handle}`;
    const existing = localStorage.getItem(key);
    if (existing) { setSessionId(existing); } else { const fresh=uuid(); localStorage.setItem(key,fresh); setSessionId(fresh); }
  }, [clone.handle, userId]);

  useEffect(() => {
    api(`/clones/${clone.handle}/knowledge-map`).then(r=>r.ok?r.json():null).then(d=>{if(d?.areas?.length)setKnowledgeAreas(d.areas)}).catch(()=>{});
  }, [clone.handle]);

  useEffect(() => {
    api(`/clones/${clone.handle}/readiness`).then(r=>r.ok?r.json():null).then(d=>{if(d)setReadiness(d)}).catch(()=>{});
  }, [clone.handle]);

  useEffect(() => {
    if (messages.length>0 && input.trim().length===0) { setAutoSuggestions([]); return; }
    if (autoDebounceRef.current) clearTimeout(autoDebounceRef.current);
    autoDebounceRef.current = setTimeout(async () => {
      setAutoLoading(true);
      try { const res=await api(`/clones/${clone.handle}/autocomplete?q=${encodeURIComponent(input.trim())}`); setAutoSuggestions(res.ok?(await res.json()).suggestions??[]:[]);
      } catch { setAutoSuggestions([]); } finally { setAutoLoading(false); }
    }, 300);
    return () => { if (autoDebounceRef.current) clearTimeout(autoDebounceRef.current); };
  }, [input, clone.handle, messages.length]);

  useEffect(() => {
    if (!moreOpen) return;
    function handler(e: MouseEvent) { if (moreRef.current&&!moreRef.current.contains(e.target as Node)) setMoreOpen(false); }
    document.addEventListener("mousedown",handler);
    return () => document.removeEventListener("mousedown",handler);
  }, [moreOpen]);

  useEffect(() => {
    const ta=textareaRef.current; if (!ta) return;
    ta.style.height="auto"; ta.style.height=`${Math.min(ta.scrollHeight,180)}px`;
  }, [input]);

  function handleShare() { const url=`https://doppel-pi.vercel.app/c/${clone.handle}`; navigator.clipboard.writeText(url).catch(()=>{}); setShareCopied(true); setTimeout(()=>setShareCopied(false),2000); }

  function isActionMessage(text: string): boolean {
    const lower=text.toLowerCase();
    return /\b(post|send|email|dm|tweet|publish)\b/.test(lower)||/\b(search|find|look up|look for|fetch)\b.{0,30}\b(in|on|from|my|the)\b/.test(lower)||/\b(schedule|book|create|add|set up|invite)\b.{0,30}\b(meeting|event|appointment|calendar)\b/.test(lower)||/\b(delete|remove|clear|archive)\b.{0,30}\b(file|folder|email|message|event|document)\b/.test(lower)||/\b(slack|gmail|google drive|github|notion|google sheets|google docs)\b/.test(lower)||/\b(remind me|set a reminder|alert me)\b/.test(lower);
  }

  function startNewConversation() {
    const fresh=uuid();
    localStorage.setItem(`doppel_web_session:${userId}:${clone.handle}`,fresh);
    localStorage.removeItem(`doppel_web_chat:${clone.clone_id}`);
    setSessionId(fresh); clearMessages(); setAgentEvents([]); setAgentPanelOpen(false);
  }

  async function handleCreateTask(instruction: string) {
    const userMsgId=uuid(); const cloneMsgId=uuid();
    setMessages(prev=>[...prev,{id:userMsgId,role:"user",content:`/task ${instruction}`},{id:cloneMsgId,role:"clone",content:"",isStreaming:true}]);
    try {
      const res=await api(`/clones/${clone.clone_id}/tasks`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clone_id:clone.clone_id,instruction})});
      const data=await res.json(); const title=data.title||instruction.slice(0,60);
      setMessages(prev=>prev.map(m=>m.id===cloneMsgId?{...m,content:`Task started: **${title}**\n\nHandling this in the background. Check the **Activity** tab above to track progress.`,isStreaming:false}:m));
    } catch { setMessages(prev=>prev.map(m=>m.id===cloneMsgId?{...m,content:"Failed to create the task. Please try again.",isStreaming:false}:m)); }
  }

  function handleSend() {
    if (!input.trim()||isLoading) return;
    const txt=input.trim(); setInput("");
    if (textareaRef.current) textareaRef.current.style.height="auto";
    if (txt.toLowerCase().startsWith("/task ")) { handleCreateTask(txt.slice(6).trim()); return; }
    if (txt.toLowerCase().startsWith("/automate ")) { setAutomateInstruction(txt.slice(10).trim()); setShowAutomateModal(true); return; }
    sendMessage(txt);
  }

  const cloneColor   = deriveColor(clone.display_name);
  const cloneInitial = clone.display_name[0]?.toUpperCase()??"A";
  const cloneName    = clone.listing_title??clone.display_name;
  const isEmpty      = messages.length===0;
  const inputIsAction = isActionMessage(input.trim());
  const cloneNotReady = readiness!==null && !readiness.is_ready;

  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%",background:"#080808",color:"rgba(255,255,255,0.82)",fontFamily:"inherit",position:"relative",overflow:"hidden" }}>
      <style>{`
        @keyframes typing-dot { 0%,80%,100%{transform:scale(0.55);opacity:0.25} 40%{transform:scale(1);opacity:0.75} }
        @keyframes msg-in { from{opacity:0;transform:translateY(14px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes menu-in { from{opacity:0;transform:scale(0.88) translateY(-8px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes panel-in { from{opacity:0;transform:translateX(18px) scale(0.97)} to{opacity:1;transform:translateX(0) scale(1)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        .chat-scroll::-webkit-scrollbar{width:4px}.chat-scroll::-webkit-scrollbar-track{background:transparent}.chat-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.10);border-radius:4px}
        .chat-textarea::-webkit-scrollbar{display:none}
        .agent-scroll::-webkit-scrollbar{width:3px}.agent-scroll::-webkit-scrollbar-track{background:transparent}.agent-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.10);border-radius:3px}
        .hdr-act{transition:background 220ms,color 220ms,border-color 220ms,transform 180ms !important}.hdr-act:hover{background:rgba(255,255,255,0.08) !important;color:rgba(255,255,255,0.90) !important}.hdr-act:active{transform:scale(0.87) !important}
        .composer-send{transition:background 220ms,opacity 180ms,transform 160ms !important}.composer-send:not(:disabled):hover{opacity:0.85}.composer-send:not(:disabled):active{transform:scale(0.90) !important}
      `}</style>

      {/* Header */}
      <header style={{ flexShrink:0,background:"rgba(8,8,8,0.85)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(255,255,255,0.09)",position:"sticky",top:0,zIndex:20 } as React.CSSProperties}>
        <div style={{ maxWidth:860,margin:"0 auto",display:"flex",alignItems:"center",gap:10,padding:"10px 16px" }}>
          <div style={{ width:36,height:36,borderRadius:8,background:cloneColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:500,color:"#fff",flexShrink:0,overflow:"hidden" }}>
            {clone.avatar_url ? <img src={clone.avatar_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none"}} /> : cloneInitial}
          </div>
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ fontSize:14,fontWeight:500,color:"rgba(255,255,255,0.93)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{cloneName}</div>
            <div style={{ fontSize:11,color:"rgba(255,255,255,0.40)",marginTop:1 }}>@{clone.handle}</div>
          </div>
          <div style={{ display:"inline-flex",gap:6 }}>
            <button className="hdr-act" onClick={startNewConversation} title="New conversation" style={hdrBtnStyle}><INewChat /></button>
            {messages.length>0 && (
              <button className="hdr-act" onClick={startNewConversation} title="Clear history" style={{...hdrBtnStyle,background:"rgba(248,113,113,0.05)",border:"1px solid rgba(248,113,113,0.15)",color:"rgba(248,113,113,0.50)"}} onMouseEnter={e=>{e.currentTarget.style.background="rgba(248,113,113,0.10)";e.currentTarget.style.borderColor="rgba(248,113,113,0.28)";e.currentTarget.style.color="rgba(248,113,113,0.80)"}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(248,113,113,0.05)";e.currentTarget.style.borderColor="rgba(248,113,113,0.15)";e.currentTarget.style.color="rgba(248,113,113,0.50)"}}><ITrash /></button>
            )}
            <button className="hdr-act" onClick={handleShare} title={shareCopied?"Copied!":"Copy link"} style={{...hdrBtnStyle,background:shareCopied?"rgba(52,211,153,0.10)":"rgba(255,255,255,0.04)",border:`1px solid ${shareCopied?"rgba(52,211,153,0.25)":"rgba(255,255,255,0.09)"}`,color:shareCopied?"rgba(52,211,153,0.75)":"rgba(255,255,255,0.50)"}}><IShare /></button>
            <div ref={moreRef} style={{ position:"relative" }}>
              <button className="hdr-act" onClick={()=>setMoreOpen(v=>!v)} title="More" style={{...hdrBtnStyle,background:moreOpen?"rgba(255,255,255,0.09)":"rgba(255,255,255,0.04)"}}><IMore /></button>
              {moreOpen && (
                <div style={{ position:"absolute",top:"calc(100% + 4px)",right:0,zIndex:50,background:"rgba(12,12,12,0.98)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:10,padding:4,minWidth:176,backdropFilter:"blur(20px)",boxShadow:"0 12px 40px rgba(0,0,0,0.65)",transformOrigin:"top right",animation:"menu-in 260ms cubic-bezier(0.34,1.56,0.64,1) both" }}>
                  {([
                    { label:"Open profile", icon:<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M6 2H2.5A1.5 1.5 0 001 3.5v8A1.5 1.5 0 002.5 13h8A1.5 1.5 0 0012 11.5V8M8 1h5v5M13 1L7 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>, action:()=>{window.open(`https://doppel-pi.vercel.app/c/${clone.handle}`,"_blank");setMoreOpen(false);} },
                    { divider:true },
                    { label:"Clear history", icon:<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M5 4V2.5h4V4M5.5 10.5V6M8.5 10.5V6M3 4l.8 8h6.4L11 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>, action:()=>{startNewConversation();setMoreOpen(false);}, danger:true },
                  ] as Array<{label?:string;icon?:React.ReactNode;action?:()=>void;danger?:boolean;divider?:boolean}>).map((item,i) => item.divider
                    ? <div key={i} style={{ height:1,background:"rgba(255,255,255,0.07)",margin:"3px 4px" }} />
                    : <button key={i} onClick={item.action} style={{ display:"flex",alignItems:"center",gap:9,width:"100%",padding:"7px 10px",borderRadius:7,border:"none",background:"transparent",cursor:"pointer",fontFamily:"inherit",fontSize:12,color:item.danger?"rgba(248,113,113,0.70)":"rgba(255,255,255,0.68)",transition:"background 100ms",textAlign:"left" }} onMouseEnter={e=>{e.currentTarget.style.background=item.danger?"rgba(248,113,113,0.08)":"rgba(255,255,255,0.06)"}} onMouseLeave={e=>{e.currentTarget.style.background="transparent"}}>
                        <span style={{ color:item.danger?"rgba(248,113,113,0.55)":"rgba(255,255,255,0.35)",flexShrink:0 }}>{item.icon}</span>{item.label}
                      </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Tab bar */}
        <div style={{ maxWidth:860,margin:"0 auto",padding:"0 16px 10px",display:"flex",gap:2 }}>
          {(["chat","activity","connectors"] as const).map(v => (
            <button key={v} onClick={()=>setActiveView(v)} style={{ fontSize:12,fontWeight:500,padding:"5px 14px",borderRadius:8,border:"none",background:activeView===v?"rgba(255,255,255,0.09)":"transparent",color:activeView===v?"rgba(255,255,255,0.82)":"rgba(255,255,255,0.30)",cursor:"pointer",fontFamily:"inherit",transition:"all 180ms",textTransform:"capitalize" }}>{v}</button>
          ))}
        </div>
      </header>

      {activeView==="chat" ? (
        <>
          {/* Readiness gate */}
          {readiness && !readiness.is_ready && (
            <div style={{ margin:"10px 16px 0",maxWidth:860,alignSelf:"center",width:"calc(100% - 32px)",flexShrink:0 }}>
              <div style={{ background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:14,padding:"14px 16px" }}>
                <div style={{ display:"flex",alignItems:"flex-start",gap:10,marginBottom:10 }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink:0,marginTop:1 }}><circle cx="8" cy="8" r="6.5" stroke="rgba(255,255,255,0.30)" strokeWidth="1.3"/><path d="M8 5v4M8 11v.5" stroke="rgba(255,255,255,0.30)" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  <div>
                    <p style={{ margin:"0 0 2px",fontSize:13,fontWeight:500,color:"rgba(255,255,255,0.78)" }}>This clone needs more training before it can respond</p>
                    <p style={{ margin:0,fontSize:11,color:"rgba(255,255,255,0.38)",lineHeight:1.55 }}>Each clone should have a <strong style={{ color:"rgba(255,255,255,0.55)" }}>specific purpose</strong> — a focused clone responds with far more precision.</p>
                  </div>
                </div>
                <div style={{ display:"flex",gap:8,flexWrap:"wrap",marginBottom:12 }}>
                  {[{label:"Knowledge",ok:readiness.knowledge_ok,hint:"5+ memory chunks"},{label:"Decision style",ok:readiness.decision_making_ok,hint:"how you reason"},{label:"Voice",ok:readiness.voice_ok,hint:"emails or messages"}].map(c=>(
                    <div key={c.label} style={{ display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:8,background:c.ok?"rgba(52,211,153,0.05)":"rgba(255,255,255,0.03)",border:`1px solid ${c.ok?"rgba(52,211,153,0.15)":"rgba(255,255,255,0.08)"}`}}>
                      {c.ok ? <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-7" stroke="rgba(52,211,153,0.75)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg> : <div style={{ width:6,height:6,borderRadius:"50%",background:"rgba(255,255,255,0.18)" }} />}
                      <span style={{ fontSize:11,color:c.ok?"rgba(52,211,153,0.70)":"rgba(255,255,255,0.40)" }}>{c.label}</span>
                      <span style={{ fontSize:10,color:"rgba(255,255,255,0.22)" }}>{c.hint}</span>
                    </div>
                  ))}
                </div>
                <a href={`https://doppel-pi.vercel.app/dashboard/train`} target="_blank" rel="noreferrer" style={{ display:"inline-flex",alignItems:"center",gap:6,fontSize:12,fontWeight:500,padding:"5px 14px",borderRadius:8,background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.12)",color:"rgba(255,255,255,0.72)",textDecoration:"none",transition:"all 140ms" }} onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.12)"}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.08)"}}>Train this clone <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg></a>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="chat-scroll" ref={scrollRef} style={{ flex:1,width:"100%",maxWidth:860,margin:"0 auto",padding:isEmpty?"24px 20px 16px":"24px 20px 140px",display:"flex",flexDirection:"column",gap:18,overflowY:"auto",boxSizing:"border-box" }}>
            {isEmpty ? (
              <div style={{ maxWidth:640,margin:"0 auto",width:"100%" }}>
                <div style={{ display:"flex",alignItems:"center",gap:14,marginBottom:16 }}>
                  <div style={{ width:48,height:48,borderRadius:12,background:cloneColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:400,color:"rgba(255,255,255,0.55)",flexShrink:0,overflow:"hidden" }}>
                    {clone.avatar_url ? <img src={clone.avatar_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none"}} /> : cloneInitial}
                  </div>
                  <div>
                    <p style={{ fontSize:18,fontWeight:400,lineHeight:1.3,letterSpacing:"-0.01em",color:"rgba(255,255,255,0.93)",margin:"0 0 2px" }}>Hi, I'm {cloneName}</p>
                    <p style={{ fontSize:13,color:"rgba(255,255,255,0.50)",margin:0 }}>Ask me anything, or give a task to handle.</p>
                  </div>
                </div>
                {knowledgeAreas.length>0 && (
                  <div style={{ marginTop:14 }}>
                    <span style={{ display:"block",fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",color:"rgba(255,255,255,0.30)",marginBottom:8 }}>Knows well</span>
                    <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>
                      {knowledgeAreas.map((a,i) => {
                        const opacity=a.depth==="deep"?0.75:a.depth==="solid"?0.50:0.32;
                        const bg=a.depth==="deep"?0.10:a.depth==="solid"?0.06:0.03;
                        const border=a.depth==="deep"?0.18:a.depth==="solid"?0.11:0.06;
                        return <span key={i} style={{ fontSize:11,fontWeight:500,padding:"3px 9px",borderRadius:20,background:`rgba(255,255,255,${bg})`,border:`1px solid rgba(255,255,255,${border})`,color:`rgba(255,255,255,${opacity})` }}>{a.area}</span>;
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              messages.map(msg => msg.isStreaming&&!msg.content ? null : (
                <MessageBubble key={msg.id} msg={msg} cloneColor={cloneColor} cloneInitial={cloneInitial} avatarUrl={clone.avatar_url} cloneId={clone.clone_id} workflowDraft={workflowDrafts[msg.id]??null}
                  onFeedbackSubmitted={(msgId,signal)=>{ setMessages(prev=>prev.map(m=>m.id===msgId?{...m}:m)); }}
                  onWorkflowActivated={name=>{ const id=uuid(); setMessages(prev=>[...prev,{id,role:"clone",content:`Workflow **${name}** is now active. Check the **Activity** tab to track it.`,isStreaming:false}]); }} />
              ))
            )}
            {/* Typing indicator */}
            {isLoading && messages.every(m=>!m.isStreaming||!m.content) && (
              <div style={{ display:"flex",gap:12 }}>
                <div style={{ width:32,height:32,borderRadius:8,background:cloneColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:500,color:"#fff",flexShrink:0,marginTop:2,overflow:"hidden" }}>
                  {clone.avatar_url ? <img src={clone.avatar_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none"}} /> : cloneInitial}
                </div>
                <div style={{ padding:"12px 15px",borderRadius:"14px 14px 14px 4px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",display:"flex",alignItems:"center",gap:5 }}>
                  {isThinking
                    ? <>{[0,1,2].map(i=><div key={i} style={{ width:6,height:6,borderRadius:"50%",background:"rgba(255,255,255,0.40)",animation:`typing-dot 1.2s ease-in-out ${i*0.2}s infinite` }} />)}<span style={{ fontSize:12,color:"rgba(255,255,255,0.50)",marginLeft:4 }}>Thinking…</span></>
                    : [0,1,2].map(i=><div key={i} style={{ width:6,height:6,borderRadius:"50%",background:"rgba(255,255,255,0.40)",animation:`typing-dot 1.2s ease-in-out ${i*0.2}s infinite` }} />)}
                </div>
              </div>
            )}
            {error && <div style={{ textAlign:"center",padding:"8px 0" }}><p style={{ fontSize:12,color:"rgba(248,113,113,0.70)",margin:0 }}>{error}</p></div>}
          </div>

          {/* Composer */}
          <div style={{ position:"sticky",bottom:0,background:"linear-gradient(180deg, rgba(8,8,8,0) 0%, rgba(8,8,8,0.88) 30%, #080808 65%)",padding:"28px 20px 16px",flexShrink:0 }}>
            <div style={{ maxWidth:860,margin:"0 auto" }}>
              <div style={{ position:"relative" }}>
                {/* Autocomplete */}
                {(autoLoading||autoSuggestions.length>0) && (
                  <div style={{ position:"absolute",bottom:"calc(100% + 6px)",left:0,right:0,background:"rgba(14,14,14,0.97)",backdropFilter:"blur(20px)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:14,overflow:"hidden",zIndex:20,boxShadow:"0 -8px 32px rgba(0,0,0,0.50)" }}>
                    {autoLoading&&autoSuggestions.length===0
                      ? <div style={{ padding:"12px 14px",display:"flex",alignItems:"center",gap:5 }}>{[0,1,2].map(i=><div key={i} style={{ width:5,height:5,borderRadius:"50%",background:"rgba(255,255,255,0.25)",animation:`typing-dot 1.2s ease-in-out ${i*0.2}s infinite` }} />)}</div>
                      : autoSuggestions.map((q,i)=>(
                        <button key={i} onClick={()=>{sendMessage(q);setAutoSuggestions([])}} style={{ display:"flex",alignItems:"center",gap:10,width:"100%",padding:"10px 14px",background:"none",border:"none",borderBottom:i<autoSuggestions.length-1?"1px solid rgba(255,255,255,0.05)":"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left",transition:"background 100ms" }} onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.05)"}} onMouseLeave={e=>{e.currentTarget.style.background="none"}}>
                          <ISparkle />
                          <span style={{ fontSize:13,color:"rgba(255,255,255,0.65)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{q}</span>
                        </button>
                      ))}
                  </div>
                )}
                {/* Input box */}
                <div style={{ display:"flex",alignItems:"flex-end",gap:8,padding:"10px 12px",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:18,transition:"border-color 120ms,box-shadow 120ms" }}
                  onFocus={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.18)";e.currentTarget.style.boxShadow="0 0 0 4px rgba(26,115,232,0.22)"}}
                  onBlur={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.09)";e.currentTarget.style.boxShadow="none"}}>
                  <textarea ref={textareaRef} className="chat-textarea" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleSend();}}}
                    placeholder={`Ask ${cloneName} anything, or give a task…`} rows={1}
                    style={{ flex:1,border:"none",outline:"none",resize:"none",background:"transparent",color:"rgba(255,255,255,0.93)",fontSize:14,lineHeight:1.5,fontFamily:"inherit",minHeight:22,maxHeight:180,overflowY:"auto" }} />
                  <button className="composer-send" onClick={handleSend} disabled={!input.trim()||isLoading||cloneNotReady}
                    style={{ width:36,height:36,borderRadius:12,background:(!input.trim()||isLoading||cloneNotReady)?"rgba(255,255,255,0.07)":inputIsAction?"rgba(52,211,153,0.18)":DOPPEL_BLUE,color:(!input.trim()||isLoading||cloneNotReady)?"rgba(255,255,255,0.30)":"#fff",border:"none",display:"flex",alignItems:"center",justifyContent:"center",cursor:(!input.trim()||isLoading||cloneNotReady)?"not-allowed":"pointer",flexShrink:0 }}>
                    {isLoading ? <div style={{ width:14,height:14,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.30)",borderTopColor:"rgba(255,255,255,0.80)",animation:"spin 0.8s linear infinite" }} /> : <ISend />}
                  </button>
                </div>
              </div>
              {/* Meta bar */}
              <div style={{ margin:"8px auto 0",display:"flex",alignItems:"center",gap:8,fontSize:11,color:"rgba(255,255,255,0.50)" }}>
                <div style={{ display:"flex",alignItems:"center",gap:1,background:"rgba(255,255,255,0.04)",borderRadius:8,padding:2,border:"1px solid rgba(255,255,255,0.06)" }}>
                  {MODES.map(m => {
                    const active=responseMode===m.value;
                    return <button key={m.value} onClick={()=>setResponseMode(m.value)} title={m.hint} style={{ display:"inline-flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:6,border:"none",fontSize:11,fontWeight:500,cursor:"pointer",fontFamily:"inherit",background:active?"rgba(255,255,255,0.09)":"transparent",color:active?"rgba(255,255,255,0.75)":"rgba(255,255,255,0.28)",transition:"all 240ms",whiteSpace:"nowrap" }}>{m.label}</button>;
                  })}
                </div>
                {/* Agent toggle button — always visible, glows when running */}
                <button
                  onClick={()=>setAgentPanelOpen(o=>!o)}
                  title="Agent panel"
                  style={{ display:"inline-flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:6,border:`1px solid ${agentPanelOpen?"rgba(52,211,153,0.30)":agentRunning?"rgba(52,211,153,0.20)":"rgba(255,255,255,0.09)"}`,background:agentPanelOpen?"rgba(52,211,153,0.10)":agentRunning?"rgba(52,211,153,0.06)":"rgba(255,255,255,0.04)",color:agentPanelOpen?"rgba(52,211,153,0.85)":agentRunning?"rgba(52,211,153,0.65)":"rgba(255,255,255,0.38)",fontSize:11,fontWeight:500,cursor:"pointer",fontFamily:"inherit",transition:"all 180ms",position:"relative" }}
                  onMouseEnter={e=>{e.currentTarget.style.background=agentPanelOpen?"rgba(52,211,153,0.14)":"rgba(255,255,255,0.07)";e.currentTarget.style.color=agentPanelOpen?"rgba(52,211,153,0.95)":"rgba(255,255,255,0.65)"}}
                  onMouseLeave={e=>{e.currentTarget.style.background=agentPanelOpen?"rgba(52,211,153,0.10)":agentRunning?"rgba(52,211,153,0.06)":"rgba(255,255,255,0.04)";e.currentTarget.style.color=agentPanelOpen?"rgba(52,211,153,0.85)":agentRunning?"rgba(52,211,153,0.65)":"rgba(255,255,255,0.38)"}}
                >
                  <IAgent />
                  Agent
                  {agentRunning && <span style={{ width:5,height:5,borderRadius:"50%",background:"rgba(52,211,153,0.80)",display:"inline-block",animation:"typing-dot 1.2s ease-in-out infinite",marginLeft:2 }} />}
                </button>
                <span style={{ marginLeft:"auto",fontSize:10,color:"rgba(255,255,255,0.18)" }}>Enter to send · Shift+Enter for new line</span>
              </div>
            </div>
          </div>
        </>
      ) : activeView==="connectors" ? (
        <ConnectorsPanel cloneId={clone.clone_id} />
      ) : (
        <ActivityPanel cloneId={clone.clone_id} />
      )}

      {/* Automate modal */}
      {showAutomateModal && (
        <AutomateModal cloneId={clone.clone_id} initialInstruction={automateInstruction}
          onClose={()=>setShowAutomateModal(false)}
          onCreated={(name,schedule)=>{
            setShowAutomateModal(false);
            const id=uuid();
            setMessages(prev=>[...prev,{id,role:"clone",content:`Automation created: **${name}** — will run ${schedule.replace(/:/g," at ").replace("daily","every day").replace("weekly","every week").replace("weekdays","every weekday").replace("hourly","every hour")}.`,isStreaming:false}]);
          }} />
      )}

      {/* Agent panel — shows when open (button toggles) or when running */}
      {agentPanelOpen && (
        <div style={{ position:"absolute",top:100,right:12,width:296,background:"rgba(10,10,10,0.96)",backdropFilter:"blur(20px)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:14,boxShadow:"0 8px 40px rgba(0,0,0,0.60)",display:"flex",flexDirection:"column",maxHeight:460,zIndex:40,animation:"panel-in 0.22s ease both" } as React.CSSProperties}>
          <div style={{ display:"flex",alignItems:"center",gap:7,padding:"10px 12px 9px",borderBottom:"1px solid rgba(255,255,255,0.07)",flexShrink:0 }}>
            <IAgent />
            <span style={{ fontSize:11,fontWeight:500,color:"rgba(255,255,255,0.50)",flex:1,letterSpacing:"0.06em" }}>Agent</span>
            {agentRunning ? <span style={{ display:"flex",alignItems:"center",gap:5,fontSize:10,color:"rgba(52,211,153,0.70)" }}><span style={{ width:5,height:5,borderRadius:"50%",background:"rgba(52,211,153,0.70)",display:"inline-block",animation:"typing-dot 1.2s ease-in-out infinite" }} />Running</span>
              : agentEvents.some(e=>e.type==="done") ? <span style={{ fontSize:10,color:"rgba(52,211,153,0.60)" }}>Done</span>
              : agentEvents.some(e=>e.type==="error") ? <span style={{ fontSize:10,color:"rgba(248,113,113,0.60)" }}>Error</span> : null}
            {!agentRunning && <button onClick={()=>setAgentPanelOpen(false)} style={{ background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.28)",fontSize:15,padding:"0 2px",lineHeight:1,fontFamily:"inherit",marginLeft:4 }} onMouseEnter={e=>{e.currentTarget.style.color="rgba(255,255,255,0.60)"}} onMouseLeave={e=>{e.currentTarget.style.color="rgba(255,255,255,0.28)"}}>×</button>}
          </div>
          <div className="agent-scroll" ref={agentScrollRef} style={{ flex:1,overflowY:"auto",padding:"10px 12px 12px",display:"flex",flexDirection:"column",gap:6 }}>
            {agentEvents.map((evt,i) => {
              if (evt.type==="status") return <div key={i} style={{ display:"flex",alignItems:"flex-start",gap:7 }}><span style={{ width:4,height:4,borderRadius:"50%",background:"rgba(255,255,255,0.22)",flexShrink:0,marginTop:5 }} /><span style={{ fontSize:11,color:"rgba(255,255,255,0.35)",lineHeight:1.55 }}>{evt.message}</span></div>;
              if (evt.type==="action") return <div key={i} style={{ padding:"7px 10px",borderRadius:9,background:"rgba(52,211,153,0.04)",border:"1px solid rgba(52,211,153,0.10)" }}><span style={{ fontSize:10,fontWeight:500,color:"rgba(52,211,153,0.70)",display:"block",marginBottom:2,textTransform:"uppercase",letterSpacing:"0.08em" }}>{evt.action}</span><span style={{ fontSize:11,color:"rgba(255,255,255,0.48)",fontFamily:"monospace",wordBreak:"break-all" }}>{evt.detail}</span></div>;
              if (evt.type==="done") return <div key={i} style={{ display:"flex",alignItems:"center",gap:8,padding:"9px 11px",borderRadius:10,background:"rgba(52,211,153,0.06)",border:"1px solid rgba(52,211,153,0.15)" }}><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-7" stroke="rgba(52,211,153,0.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg><span style={{ fontSize:12,color:"rgba(52,211,153,0.80)",fontWeight:500 }}>Done</span></div>;
              if (evt.type==="error") return <div key={i} style={{ display:"flex",alignItems:"center",gap:7,padding:"8px 10px",borderRadius:9,background:"rgba(248,113,113,0.05)",border:"1px solid rgba(248,113,113,0.15)" }}><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="rgba(248,113,113,0.65)" strokeWidth="1.3"/><path d="M8 5v4M8 11v.5" stroke="rgba(248,113,113,0.65)" strokeWidth="1.5" strokeLinecap="round"/></svg><span style={{ fontSize:11,color:"rgba(248,113,113,0.70)" }}>{evt.message}</span></div>;
              return null;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared input style ────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = { width:"100%",padding:"8px 12px",borderRadius:10,border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.04)",color:"rgba(255,255,255,0.70)",fontSize:12,fontFamily:"inherit",outline:"none" };
const labelStyle: React.CSSProperties = { display:"block",fontSize:12,color:"rgba(255,255,255,0.35)",marginBottom:6 };
const cardStyle: React.CSSProperties = { display:"flex",flexDirection:"column",gap:16,padding:"18px 20px",borderRadius:14,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)" };
const eyebrowStyle: React.CSSProperties = { fontSize:10,textTransform:"uppercase" as const,letterSpacing:"0.12em",color:"rgba(255,255,255,0.25)",margin:0 };

// ── ConnectorsPanel ───────────────────────────────────────────────────────────

const CHANNEL_DEFS: { id: string; label: string; desc: string }[] = [
  { id: "gmail",  label: "Gmail",           desc: "Read and send email on your behalf." },
  { id: "gcal",   label: "Google Calendar",  desc: "Read and create calendar events." },
  { id: "gdrive", label: "Google Drive",     desc: "Search and manage files." },
  { id: "slack",  label: "Slack",            desc: "Post messages and read channels." },
  { id: "github", label: "GitHub",           desc: "Read issues, PRs, and repos." },
  { id: "notion", label: "Notion",           desc: "Read and edit pages." },
];

const TOOL_NAME_TO_ID: Record<string, string> = {
  "Gmail": "gmail", "Google Calendar": "gcal", "Google Drive": "gdrive",
  "Slack": "slack", "GitHub Integration": "github", "Notion": "notion",
};

interface ConnectedTool { id: string; name: string; server_url: string; transport: string; tool_names: string[]; enabled: boolean; created_at: string; }

function ConnectorsPanel({ cloneId }: { cloneId: string }) {
  const [tools, setTools] = useState<ConnectedTool[]>([]);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  const webhookUrl = `${BACKEND}/webhook/whatsapp/${cloneId}`;

  function loadTools() {
    api(`/clones/${cloneId}/tools`).then(r => r.ok ? r.json() : []).then(d => { setTools(Array.isArray(d) ? d : d.tools ?? []); setLoading(false); }).catch(() => setLoading(false));
  }
  useEffect(() => { loadTools(); }, [cloneId]); // eslint-disable-line react-hooks/exhaustive-deps

  const connectedIds = new Set(tools.map(t => TOOL_NAME_TO_ID[t.name]).filter(Boolean));

  async function disconnect(chId: string) {
    const tool = tools.find(t => TOOL_NAME_TO_ID[t.name] === chId);
    if (!tool) return;
    setDisconnecting(chId);
    await api(`/clones/${cloneId}/tools/${tool.id}`, { method: "DELETE" });
    loadTools();
    setDisconnecting(null);
  }

  function connect(serviceId: string) {
    window.open(`${BACKEND}/oauth/${serviceId}/start?clone_id=${cloneId}&user_id=${_userId}`, "_blank");
  }

  return (
    <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
      {/* WhatsApp */}
      <div style={{ borderRadius:14,border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.03)",padding:"16px 18px",display:"flex",flexDirection:"column",gap:10 }}>
        <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12 }}>
          <div>
            <p style={{ fontSize:13,fontWeight:500,color:"rgba(255,255,255,0.75)",margin:0 }}>WhatsApp</p>
            <p style={{ fontSize:11,color:"rgba(255,255,255,0.35)",margin:"3px 0 0" }}>Paste this URL into your Twilio number's webhook settings.</p>
          </div>
          <span style={{ fontSize:10,padding:"2px 8px",borderRadius:999,flexShrink:0,marginTop:2,color:"rgba(255,255,255,0.28)",border:"1px solid rgba(255,255,255,0.08)" }}>Manual setup</span>
        </div>
        <div style={{ display:"flex",gap:8,alignItems:"center" }}>
          <code style={{ flex:1,fontSize:11,padding:"7px 10px",borderRadius:8,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",color:"rgba(255,255,255,0.50)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{webhookUrl}</code>
          <button onClick={() => { navigator.clipboard.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            style={{ padding:"6px 12px",borderRadius:8,fontSize:11,background:"transparent",border:"1px solid rgba(255,255,255,0.10)",color:copied?"rgba(52,211,153,0.80)":"rgba(255,255,255,0.40)",cursor:"pointer",fontFamily:"inherit",flexShrink:0,transition:"color 150ms" }}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* OAuth channels */}
      {CHANNEL_DEFS.map(ch => {
        const isConnected = connectedIds.has(ch.id);
        const isDisc = disconnecting === ch.id;
        return (
          <div key={ch.id} style={{ borderRadius:14,border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.03)",padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12 }}>
            <div>
              <p style={{ fontSize:13,fontWeight:500,color:"rgba(255,255,255,0.75)",margin:0 }}>{ch.label}</p>
              <p style={{ fontSize:11,color:"rgba(255,255,255,0.35)",margin:"3px 0 0" }}>{ch.desc}</p>
            </div>
            <div style={{ display:"flex",alignItems:"center",gap:8,flexShrink:0 }}>
              {isConnected && <span style={{ fontSize:11,padding:"2px 8px",borderRadius:999,color:"rgba(52,211,153,0.70)",background:"rgba(52,211,153,0.08)",border:"1px solid rgba(52,211,153,0.18)" }}>Connected</span>}
              {isConnected ? (
                <button disabled={isDisc} onClick={() => disconnect(ch.id)}
                  style={{ padding:"5px 12px",borderRadius:8,fontSize:11,background:"transparent",border:"1px solid rgba(248,113,113,0.15)",color:"rgba(248,113,113,0.60)",cursor:"pointer",fontFamily:"inherit",opacity:isDisc?0.4:1,transition:"all 150ms" }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(248,113,113,0.30)";e.currentTarget.style.color="rgba(248,113,113,0.85)"}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(248,113,113,0.15)";e.currentTarget.style.color="rgba(248,113,113,0.60)"}}>
                  {isDisc ? "..." : "Disconnect"}
                </button>
              ) : (
                <button onClick={() => connect(ch.id)}
                  style={{ padding:"5px 12px",borderRadius:8,fontSize:11,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.10)",color:"rgba(255,255,255,0.55)",cursor:"pointer",fontFamily:"inherit",transition:"all 150ms" }}
                  onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.09)";e.currentTarget.style.color="rgba(255,255,255,0.80)"}}
                  onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.05)";e.currentTarget.style.color="rgba(255,255,255,0.55)"}}>
                  Connect
                </button>
              )}
            </div>
          </div>
        );
      })}

      {loading && <p style={{ fontSize:12,color:"rgba(255,255,255,0.25)",textAlign:"center",padding:"12px 0" }}>Loading...</p>}
    </div>
  );
}

// ── SettingsPanel ──────────────────────────────────────────────────────────────

function SettingsPanel({ clone, onBack }: { clone: Clone; onBack: () => void }) {
  // Profile state
  const [fullName, setFullName] = useState(_userName);
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Delegate policies state
  const [blockedTopics, setBlockedTopics] = useState<string[]>([]);
  const [escalationThreshold, setEscalationThreshold] = useState(50);
  const [requireHumanReview, setRequireHumanReview] = useState(false);
  const [topicDraft, setTopicDraft] = useState("");
  const [policySaving, setPolicySaving] = useState(false);
  const [policySaved, setPolicySaved] = useState(false);
  const [policyLoaded, setPolicyLoaded] = useState(false);

  // Load profile
  useEffect(() => {
    api("/user/profile").then(r => r.json()).then(d => {
      if (d.full_name) setFullName(d.full_name);
      setBio(d.bio ?? ""); setLocation(d.location ?? ""); setWebsite(d.website ?? ""); setDob(d.dob ?? ""); setPhone(d.phone ?? "");
      setProfileLoaded(true);
    }).catch(() => setProfileLoaded(true));
  }, []);

  // Load policies
  useEffect(() => {
    api(`/identity?user_id=${_userId}&clone_id=${clone.clone_id}`).then(r => r.json()).then(d => {
      const p = d.admin_policies ?? {};
      setBlockedTopics(p.blocked_topics ?? []); setEscalationThreshold(p.escalation_threshold ?? 50); setRequireHumanReview(p.require_human_review ?? false);
      setPolicyLoaded(true);
    }).catch(() => setPolicyLoaded(true));
  }, [clone.clone_id]);

  async function saveProfile() {
    setProfileSaving(true); setProfileSaved(false);
    try {
      await api("/user/profile", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName.trim() || null, bio: bio.trim() || null, location: location.trim() || null, website: website.trim() || null, dob: dob.trim() || null, phone: phone.trim() || null }),
      });
      setProfileSaved(true); setTimeout(() => setProfileSaved(false), 2500);
    } finally { setProfileSaving(false); }
  }

  async function savePolicies() {
    setPolicySaving(true); setPolicySaved(false);
    try {
      await api("/identity/policies", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: _userId, policies: { blocked_topics: blockedTopics, escalation_threshold: escalationThreshold, require_human_review: requireHumanReview } }),
      });
      setPolicySaved(true); setTimeout(() => setPolicySaved(false), 2500);
    } finally { setPolicySaving(false); }
  }

  function addTopic() { const t = topicDraft.trim(); if (t && !blockedTopics.includes(t)) { setBlockedTopics(prev => [...prev, t]); setTopicDraft(""); } }

  const saveBtnStyle = (saving: boolean, saved: boolean): React.CSSProperties => ({
    width:"100%",padding:"8px 0",borderRadius:10,border:`1px solid ${saved?"rgba(52,211,153,0.20)":"rgba(255,255,255,0.12)"}`,
    background:saved?"rgba(52,211,153,0.08)":"rgba(255,255,255,0.06)",color:saved?"rgba(52,211,153,0.80)":"rgba(255,255,255,0.65)",
    fontSize:12,fontWeight:500,cursor:saving?"not-allowed":"pointer",fontFamily:"inherit",transition:"all 180ms",opacity:saving?0.5:1,
  });

  return (
    <div style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden" }}>
      {/* Header */}
      <header style={{ flexShrink:0,borderBottom:"1px solid rgba(255,255,255,0.07)",padding:"16px 20px" }}>
        <div style={{ display:"flex",alignItems:"center",gap:10,maxWidth:560,margin:"0 auto" }}>
          <button onClick={onBack} style={{ display:"flex",alignItems:"center",gap:5,padding:"5px 10px",borderRadius:8,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.45)",cursor:"pointer",fontSize:11,fontFamily:"inherit",transition:"all 180ms" }}
            onMouseEnter={e=>{e.currentTarget.style.color="rgba(255,255,255,0.80)";e.currentTarget.style.background="rgba(255,255,255,0.08)"}}
            onMouseLeave={e=>{e.currentTarget.style.color="rgba(255,255,255,0.45)";e.currentTarget.style.background="rgba(255,255,255,0.04)"}}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Back
          </button>
          <h2 style={{ fontSize:15,fontWeight:500,color:"rgba(255,255,255,0.85)",margin:0,flex:1 }}>Settings</h2>
        </div>
      </header>

      {/* Content */}
      <div style={{ flex:1,overflowY:"auto",padding:"24px 20px 40px" }}>
        <div style={{ maxWidth:560,margin:"0 auto",display:"flex",flexDirection:"column",gap:0 }}>

          {/* ── Profile section ─────────────────────────────────── */}
          <p style={{ ...eyebrowStyle, marginBottom:12 }}>Profile</p>

          {/* Avatar + name header */}
          <div style={{ ...cardStyle, flexDirection:"row",alignItems:"center",gap:16,padding:"20px 24px",marginBottom:20 }}>
            <div style={{ width:48,height:48,borderRadius:"50%",background:"rgba(26,115,232,0.22)",border:"1px solid rgba(26,115,232,0.35)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:600,color:"rgba(107,174,255,0.90)",flexShrink:0,userSelect:"none" as const }}>
              {_userInitial}
            </div>
            <div style={{ minWidth:0 }}>
              <p style={{ fontSize:16,fontWeight:500,color:"rgba(255,255,255,0.85)",margin:0,lineHeight:1.3 }}>{fullName || "—"}</p>
              <p style={{ fontSize:13,color:"rgba(255,255,255,0.35)",margin:"2px 0 0" }}>{_userId ? "Signed in" : ""}</p>
            </div>
          </div>

          {/* Personal info card */}
          {profileLoaded && (
            <>
              <div style={{ ...cardStyle, marginBottom:20 }}>
                <p style={eyebrowStyle}>Personal</p>
                <div>
                  <label style={labelStyle}>Full name</label>
                  <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" style={inputStyle} />
                </div>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
                  <div>
                    <label style={labelStyle}>Date of birth</label>
                    <input type="date" value={dob} onChange={e => setDob(e.target.value)} style={{ ...inputStyle, colorScheme:"dark" }} />
                  </div>
                  <div>
                    <label style={labelStyle}>Phone</label>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" style={inputStyle} />
                  </div>
                </div>
              </div>

              {/* Presence card */}
              <div style={{ ...cardStyle, marginBottom:20 }}>
                <p style={eyebrowStyle}>Presence</p>
                <div>
                  <label style={labelStyle}>Bio</label>
                  <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="A sentence or two about what you do." rows={3} style={{ ...inputStyle, resize:"none",lineHeight:"1.6" }} />
                </div>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
                  <div>
                    <label style={labelStyle}>Location</label>
                    <input value={location} onChange={e => setLocation(e.target.value)} placeholder="San Francisco" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Website</label>
                    <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://..." type="url" style={inputStyle} />
                  </div>
                </div>
              </div>

              {/* Save profile */}
              <div style={{ marginBottom:32 }}>
                <button onClick={saveProfile} disabled={profileSaving} style={saveBtnStyle(profileSaving, profileSaved)}>
                  {profileSaving ? "Saving..." : profileSaved ? "Saved" : "Save changes"}
                </button>
              </div>
            </>
          )}

          {/* ── Clone settings ──────────────────────────────────── */}
          <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:12 }}>
            <div style={{ width:28,height:28,borderRadius:7,background:clone.avatar_url?"transparent":deriveColor(clone.display_name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:500,color:"rgba(255,255,255,0.80)",overflow:"hidden",flexShrink:0 }}>
              {clone.avatar_url ? <img src={clone.avatar_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : clone.display_name[0]?.toUpperCase()}
            </div>
            <p style={{ ...eyebrowStyle, fontSize:11 }}>Delegate policies — {clone.display_name}</p>
          </div>

          {policyLoaded && (
            <div style={{ ...cardStyle, marginBottom:24 }}>
              <p style={{ fontSize:12,color:"rgba(255,255,255,0.35)",lineHeight:1.6,margin:0 }}>
                Control what your clone will and won't respond to. These policies apply to all surfaces.
              </p>

              {/* Blocked topics */}
              <div>
                <p style={{ fontSize:12,fontWeight:500,color:"rgba(255,255,255,0.50)",marginBottom:6 }}>Blocked topics</p>
                <p style={{ fontSize:11,color:"rgba(255,255,255,0.25)",marginBottom:10 }}>Your clone will decline any question touching these topics.</p>
                {blockedTopics.length > 0 && (
                  <div style={{ display:"flex",flexWrap:"wrap",gap:6,marginBottom:10 }}>
                    {blockedTopics.map(t => (
                      <span key={t} style={{ display:"inline-flex",alignItems:"center",gap:6,fontSize:12,color:"rgba(255,255,255,0.55)",background:"rgba(248,113,113,0.07)",border:"1px solid rgba(248,113,113,0.15)",borderRadius:8,padding:"4px 10px" }}>
                        {t}
                        <button onClick={() => setBlockedTopics(prev => prev.filter(x => x !== t))} style={{ background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.25)",padding:0,fontSize:12,lineHeight:1,fontFamily:"inherit" }}>x</button>
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display:"flex",gap:8 }}>
                  <input type="text" value={topicDraft} onChange={e => setTopicDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && addTopic()} placeholder="e.g. salary, competitors, legal advice" style={inputStyle} />
                  <button onClick={addTopic} style={{ padding:"6px 14px",borderRadius:10,border:"1px solid rgba(255,255,255,0.10)",background:"rgba(255,255,255,0.05)",color:"rgba(255,255,255,0.50)",fontSize:12,cursor:"pointer",fontFamily:"inherit",flexShrink:0 }}
                    onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.09)";e.currentTarget.style.color="rgba(255,255,255,0.75)"}}
                    onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.05)";e.currentTarget.style.color="rgba(255,255,255,0.50)"}}>Add</button>
                </div>
              </div>

              {/* Escalation threshold */}
              <div>
                <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6 }}>
                  <p style={{ fontSize:12,fontWeight:500,color:"rgba(255,255,255,0.50)",margin:0 }}>Escalation threshold</p>
                  <span style={{ fontSize:12,color:"rgba(255,255,255,0.35)",fontFamily:"ui-monospace, Menlo, monospace" }}>{escalationThreshold}%</span>
                </div>
                <p style={{ fontSize:11,color:"rgba(255,255,255,0.25)",marginBottom:10 }}>Responses below this confidence level will be flagged for human review.</p>
                <input type="range" min={10} max={90} value={escalationThreshold} onChange={e => setEscalationThreshold(Number(e.target.value))} style={{ width:"100%",accentColor:"rgba(255,255,255,0.50)" }} />
                <div style={{ display:"flex",justifyContent:"space-between",fontSize:10,color:"rgba(255,255,255,0.20)",marginTop:4 }}>
                  <span>10% (rarely escalate)</span><span>90% (almost always)</span>
                </div>
              </div>

              {/* Require human review */}
              <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                <div>
                  <p style={{ fontSize:12,fontWeight:500,color:"rgba(255,255,255,0.50)",marginBottom:3 }}>Require human review for all responses</p>
                  <p style={{ fontSize:11,color:"rgba(255,255,255,0.25)",margin:0 }}>Clone drafts but never auto-sends — you approve every response.</p>
                </div>
                <button onClick={() => setRequireHumanReview(v => !v)} style={{ position:"relative",width:36,height:20,borderRadius:10,flexShrink:0,background:requireHumanReview?"rgba(255,255,255,0.30)":"rgba(255,255,255,0.08)",border:"none",cursor:"pointer",transition:"background 180ms" }}>
                  <span style={{ position:"absolute",top:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"transform 180ms",transform:requireHumanReview?"translateX(18px)":"translateX(2px)" }} />
                </button>
              </div>

              {/* Save policies */}
              <button onClick={savePolicies} disabled={policySaving} style={saveBtnStyle(policySaving, policySaved)}>
                {policySaving ? "Saving..." : policySaved ? "Saved" : "Save policies"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────────

function Sidebar({ open, clones, orgClones, active, userName, userInitial, onSelect, onToggle, onOpenSettings }: {
  open: boolean;
  clones: Clone[];
  orgClones: OrgClone[];
  active: Clone | null;
  userName: string;
  userInitial: string;
  onSelect: (c: Clone) => void;
  onToggle: () => void;
  onOpenSettings: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = search
    ? clones.filter(c => (c.listing_title??c.display_name).toLowerCase().includes(search.toLowerCase()) || c.handle.includes(search.toLowerCase()))
    : clones;

  function openExternal(url: string) { window.open(url, "_blank"); }

  return (
    <div style={{ position:"relative", width: open ? 300 : 0, flexShrink: 0, transition:"width 220ms cubic-bezier(0.4,0,0.2,1)", overflow:"hidden" }}>
      <div style={{ width: 300, height:"100%", display:"flex", flexDirection:"column", background:"rgba(255,255,255,0.025)", borderRight:"1px solid rgba(255,255,255,0.09)" }}>

        {/* Colored gradient top bar — matches home page exactly */}
        <div style={{ height: 2, flexShrink: 0, background:"linear-gradient(90deg, #1A73E8 0%, #A78BFA 50%, #E91E63 100%)" }} />

        {/* Brand header */}
        <div style={{ padding:"16px 16px 12px", flexShrink: 0 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: 14 }}>
            <div style={{ display:"inline-flex", alignItems:"center", gap: 9 }}>
              <div className="sb__brand-mark" style={{ width: 24, height: 24, borderRadius: 7 }} />
              <span style={{ fontSize: 15, fontWeight: 600, letterSpacing:"-0.02em", color:"rgba(255,255,255,0.93)" }}>doppel</span>
            </div>
            <button
              onClick={() => openExternal(`https://doppel-pi.vercel.app/dashboard`)}
              title="Open dashboard"
              style={{ width: 30, height: 30, borderRadius: 9, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.09)", color:"rgba(255,255,255,0.50)", cursor:"pointer", transition:"all 180ms" }}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.10)";e.currentTarget.style.color="rgba(255,255,255,0.80)"}}
              onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.06)";e.currentTarget.style.color="rgba(255,255,255,0.50)"}}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1.5" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><rect x="7.5" y="1.5" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><rect x="1.5" y="7.5" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><rect x="7.5" y="7.5" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/></svg>
            </button>
          </div>

          {/* Search with icon */}
          <div style={{ position:"relative" }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ position:"absolute", left: 11, top:"50%", transform:"translateY(-50%)", color:"rgba(255,255,255,0.25)", pointerEvents:"none" }}>
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search"
              style={{ width:"100%", padding:"8px 12px 8px 32px", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)", borderRadius: 10, fontSize: 13, color:"rgba(255,255,255,0.70)", outline:"none", fontFamily:"inherit", boxSizing:"border-box" as const }}
              onFocus={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)"}
              onBlur={e  => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}
            />
          </div>
        </div>

        {/* My Brain + My Organisation shortcut cards */}
        <div style={{ padding:"0 8px 6px", display:"flex", flexDirection:"column", gap: 4 }}>
          <button
            onClick={() => openExternal(`https://doppel-pi.vercel.app/dashboard/my-brain`)}
            style={{ display:"flex", alignItems:"center", gap: 10, padding:"11px 16px", borderRadius: 12, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", color:"rgba(255,255,255,0.70)", fontSize: 13, fontWeight: 500, cursor:"pointer", textAlign:"left" as const, fontFamily:"inherit", transition:"all 150ms", width:"100%" }}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.09)";e.currentTarget.style.color="rgba(255,255,255,0.90)";e.currentTarget.style.borderColor="rgba(255,255,255,0.16)"}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.05)";e.currentTarget.style.color="rgba(255,255,255,0.70)";e.currentTarget.style.borderColor="rgba(255,255,255,0.09)"}}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M8 2C5.2 2 3 4.2 3 7c0 1.7.8 3.2 2 4.1V13h6v-1.9c1.2-.9 2-2.4 2-4.1 0-2.8-2.2-5-5-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
              <path d="M6 13h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            My Brain
          </button>
          <button
            onClick={() => openExternal(`https://doppel-pi.vercel.app/org`)}
            style={{ display:"flex", alignItems:"center", gap: 10, padding:"11px 16px", borderRadius: 12, background:"rgba(26,115,232,0.07)", border:"1px solid rgba(26,115,232,0.18)", color:"rgba(107,174,255,0.75)", fontSize: 13, fontWeight: 500, cursor:"pointer", textAlign:"left" as const, fontFamily:"inherit", transition:"all 150ms", width:"100%" }}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(26,115,232,0.14)";e.currentTarget.style.color="rgba(107,174,255,0.95)";e.currentTarget.style.borderColor="rgba(26,115,232,0.34)"}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(26,115,232,0.07)";e.currentTarget.style.color="rgba(107,174,255,0.75)";e.currentTarget.style.borderColor="rgba(26,115,232,0.18)"}}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <circle cx="6" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.3"/>
              <circle cx="11.5" cy="5" r="1.6" stroke="currentColor" strokeWidth="1.2" opacity="0.6"/>
              <path d="M1.5 13.5c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M11.5 8.5c1.9.3 3 1.7 3 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>
            </svg>
            My Organisation
          </button>
        </div>

        {/* Clone list */}
        <div style={{ flex: 1, overflowY:"auto", padding:"0 8px", display:"flex", flexDirection:"column" }}>
          {filtered.length === 0 && !search && <p style={{ fontSize: 12, color:"rgba(255,255,255,0.25)", textAlign:"center", padding:"28px 0" }}>No clones.</p>}
          {filtered.length === 0 && search  && <p style={{ fontSize: 12, color:"rgba(255,255,255,0.25)", padding:"20px 16px", textAlign:"center" }}>No results</p>}
          {filtered.map(c => {
            const name = c.listing_title ?? c.display_name;
            const col  = listColor(name);
            const sel  = active?.clone_id === c.clone_id;
            return (
              <div key={c.clone_id} onClick={() => onSelect(c)}
                style={{ display:"flex", alignItems:"center", gap: 9, padding:"8px 9px", borderRadius: 10, marginBottom: 1, cursor:"pointer", background: sel ? "rgba(255,255,255,0.08)" : "transparent", border:`1px solid ${sel ? "rgba(255,255,255,0.10)" : "transparent"}`, transition:"background 220ms" }}
                onMouseEnter={e=>{if(!sel)e.currentTarget.style.background="rgba(255,255,255,0.04)"}}
                onMouseLeave={e=>{if(!sel)e.currentTarget.style.background="transparent"}}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: col, display:"flex", alignItems:"center", justifyContent:"center", fontSize: 12, fontWeight: 500, color:"#fff", flexShrink: 0, overflow:"hidden" }}>
                  {c.avatar_url ? <img src={c.avatar_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none"}} /> : name[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: sel ? 500 : 400, color: sel ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.62)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{name}</p>
                  {c.category && <p style={{ margin: 0, fontSize: 10, color:"rgba(255,255,255,0.28)", textTransform:"capitalize" as const }}>{c.category}</p>}
                </div>
              </div>
            );
          })}

          {/* Org Clones section */}
          {orgClones.length > 0 && (
            <div style={{ marginTop:"auto", paddingTop: 12, borderTop:"1px solid rgba(255,255,255,0.06)" }}>
              <p style={{ fontSize: 10, textTransform:"uppercase" as const, letterSpacing:"0.12em", color:"rgba(107,174,255,0.40)", padding:"8px 14px 4px", margin: 0 }}>Org Clones</p>
              {orgClones.map(c => {
                const sel   = active?.clone_id === c.clone_id;
                const color = listColor(c.display_name);
                return (
                  <div key={c.clone_id}
                    onClick={() => onSelect(c as Clone)}
                    style={{ display:"flex", alignItems:"center", gap: 10, padding:"8px 14px", borderRadius: 12, cursor:"pointer", background: sel ? "rgba(107,174,255,0.12)" : "transparent", transition:"background 150ms", marginBottom: 2 }}
                    onMouseEnter={e=>{if(!sel)e.currentTarget.style.background="rgba(107,174,255,0.06)"}}
                    onMouseLeave={e=>{if(!sel)e.currentTarget.style.background="transparent"}}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, background: c.avatar_url ? "transparent" : `rgba(26,115,232,0.15)`, border:`1px solid rgba(26,115,232,0.25)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize: 12, fontWeight: 500, color, overflow:"hidden" }}>
                      {c.avatar_url ? <img src={c.avatar_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : c.display_name[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 500, color:"rgba(255,255,255,0.75)", margin: 0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.display_name}</p>
                      <p style={{ fontSize: 10, color:"rgba(255,255,255,0.30)", margin:"1px 0 0" }}>org</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* User footer */}
        <div style={{ flexShrink: 0, padding:"12px 16px", borderTop:"1px solid rgba(255,255,255,0.07)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap: 10 }}>
            {/* Avatar circle — Clerk UserButton replacement */}
            <div style={{ width: 30, height: 30, borderRadius:"50%", background:"rgba(26,115,232,0.22)", border:"1px solid rgba(26,115,232,0.35)", display:"flex", alignItems:"center", justifyContent:"center", fontSize: 12, fontWeight: 600, color:"rgba(107,174,255,0.90)", flexShrink: 0, userSelect:"none" as const }}>
              {userInitial}
            </div>
            <p style={{ fontSize: 12, fontWeight: 500, color:"rgba(255,255,255,0.65)", margin: 0 }}>{userName}</p>
          </div>
          <button
            onClick={onOpenSettings}
            title="Settings"
            style={{ width: 30, height: 30, borderRadius: 8, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)", color:"rgba(255,255,255,0.40)", cursor:"pointer", transition:"all 180ms" }}
            onMouseEnter={e=>{e.currentTarget.style.color="rgba(255,255,255,0.75)";e.currentTarget.style.background="rgba(255,255,255,0.09)"}}
            onMouseLeave={e=>{e.currentTarget.style.color="rgba(255,255,255,0.40)";e.currentTarget.style.background="rgba(255,255,255,0.05)"}}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6.86 1.45a1.14 1.14 0 0 1 2.28 0l.12.72a.57.57 0 0 0 .78.38l.66-.32a1.14 1.14 0 0 1 1.62 1.14l-.1.73a.57.57 0 0 0 .48.63l.72.12a1.14 1.14 0 0 1 .57 1.97l-.52.5a.57.57 0 0 0 0 .79l.52.5a1.14 1.14 0 0 1-.57 1.97l-.72.12a.57.57 0 0 0-.48.63l.1.73a1.14 1.14 0 0 1-1.62 1.14l-.66-.32a.57.57 0 0 0-.78.38l-.12.72a1.14 1.14 0 0 1-2.28 0l-.12-.72a.57.57 0 0 0-.78-.38l-.66.32a1.14 1.14 0 0 1-1.62-1.14l.1-.73a.57.57 0 0 0-.48-.63l-.72-.12a1.14 1.14 0 0 1-.57-1.97l.52-.5a.57.57 0 0 0 0-.79l-.52-.5A1.14 1.14 0 0 1 2.58 4.6l.72-.12a.57.57 0 0 0 .48-.63l-.1-.73A1.14 1.14 0 0 1 5.3 1.98l.66.32a.57.57 0 0 0 .78-.38l.12-.47Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="8" cy="8" r="2.25" stroke="currentColor" strokeWidth="1.2"/></svg>
          </button>
        </div>
      </div>

      {/* Collapse toggle */}
      <button onClick={onToggle} style={{ position:"absolute", right: -13, top:"50%", transform:"translateY(-50%)", width: 26, height: 26, borderRadius:"50%", background:"#141414", border:"1px solid rgba(255,255,255,0.10)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"rgba(255,255,255,0.40)", zIndex: 10, boxShadow:"0 2px 8px rgba(0,0,0,0.60)", transition:"all 180ms" }}
        onMouseEnter={e=>{e.currentTarget.style.color="rgba(255,255,255,0.85)";e.currentTarget.style.borderColor="rgba(255,255,255,0.20)"}}
        onMouseLeave={e=>{e.currentTarget.style.color="rgba(255,255,255,0.40)";e.currentTarget.style.borderColor="rgba(255,255,255,0.10)"}}>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d={open ? "M7 1.5L3.5 5.5l3.5 4" : "M4 1.5l3.5 4L4 9.5"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function Desktop() {
  const [clones,       setClones]       = useState<Clone[]>([]);
  const [orgClones,    setOrgClones]    = useState<OrgClone[]>([]);
  const [active,       setActive]       = useState<Clone | null>(null);
  const [sidebarOpen,  setSidebarOpen]  = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [userId,       setUserId]       = useState("");
  const [userName,     setUserName]     = useState("You");
  const [userInitial,  setUserInitial]  = useState("?");
  const [loading,      setLoading]      = useState(true);

  async function initWithAuth(auth: { userId: string; firstName: string; lastName: string }) {
    _userId = auth.userId;
    setUserId(auth.userId);
    const name = [auth.firstName, auth.lastName].filter(Boolean).join(" ") || "You";
    _userName = name; setUserName(name);
    _userInitial = auth.firstName?.[0]?.toUpperCase() ?? auth.userId.slice(-1).toUpperCase();
    setUserInitial(_userInitial);

    const [clonesR, orgR] = await Promise.allSettled([
      api("/clones/mine"),
      api("/org/clones"),
    ]);
    if (clonesR.status === "fulfilled" && clonesR.value.ok) {
      const d = await clonesR.value.json();
      const cs: Clone[] = d.clones ?? [];
      setClones(cs);
      if (cs.length > 0) setActive(cs[0]);
    }
    if (orgR.status === "fulfilled" && orgR.value.ok) {
      const d = await orgR.value.json();
      setOrgClones(d.clones ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      // Check for existing session, then try sign-in popup
      let auth = await window.doppelDesktop.getAuth();
      if (!auth) auth = await window.doppelDesktop.signIn();
      if (auth) {
        await initWithAuth(auth);
      } else {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div style={{ display:"flex",height:"100vh",alignItems:"center",justifyContent:"center",background:"#080808" }}>
        <div style={{ width:20,height:20,border:"2px solid rgba(255,255,255,0.08)",borderTopColor:"rgba(255,255,255,0.55)",borderRadius:"50%",animation:"spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!userId) {
    return (
      <div style={{ display:"flex",height:"100vh",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,background:"#080808" }}>
        <p style={{ fontSize:14,fontWeight:500,color:"rgba(255,255,255,0.55)",margin:0 }}>Sign in required</p>
        <button onClick={async () => { setLoading(true); const auth = await window.doppelDesktop.signIn(); if (auth) await initWithAuth(auth); else setLoading(false); }}
          style={{ fontSize:12,padding:"7px 18px",borderRadius:9,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.10)",color:"rgba(255,255,255,0.65)",cursor:"pointer",fontFamily:"inherit" }}>
          Sign in
        </button>
      </div>
    );
  }

  if (clones.length === 0) {
    return (
      <div style={{ display:"flex",height:"100vh",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,background:"#080808" }}>
        <p style={{ fontSize:14,fontWeight:500,color:"rgba(255,255,255,0.55)",margin:0 }}>No clones yet</p>
        <p style={{ fontSize:12,color:"rgba(255,255,255,0.28)",margin:0,textAlign:"center",maxWidth:240,lineHeight:1.6 }}>Create a clone on doppel-pi.vercel.app to get started.</p>
      </div>
    );
  }

  return (
    <div style={{ display:"flex",height:"100vh",background:"#080808",overflow:"hidden" }}>
      <Sidebar
        open={sidebarOpen}
        clones={clones}
        orgClones={orgClones}
        active={active}
        userName={userName}
        userInitial={userInitial}
        onSelect={c=>{if(c.clone_id!==active?.clone_id){setActive(c);setShowSettings(false)}}}
        onToggle={()=>setSidebarOpen(o=>!o)}
        onOpenSettings={()=>setShowSettings(true)}
      />
      <div style={{ flex:1,overflow:"hidden",display:"flex",flexDirection:"column",minWidth:0 }}>
        {showSettings && active
          ? <SettingsPanel key={`settings-${active.clone_id}`} clone={active} onBack={()=>setShowSettings(false)} />
          : active
          ? <CloneChat key={active.clone_id} clone={active} userId={userId} />
          : <div style={{ flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(255,255,255,0.22)",fontSize:13 }}>Select a clone to start.</div>}
      </div>
    </div>
  );
}

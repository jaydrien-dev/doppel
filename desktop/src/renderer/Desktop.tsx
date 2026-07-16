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
const IMic = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="5" y="1" width="6" height="9" rx="3" stroke="currentColor" strokeWidth="1.4"/><path d="M3 7.5a5 5 0 0010 0M8 13v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;

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

// ── TrainingScoreBar ──────────────────────────────────────────────────────────

interface TrainingBreakdown { score: number; max: number; label: string; hint: string; }
interface TrainingScore { score: number; grade: string; breakdown: Record<string, TrainingBreakdown>; next_action: string; total_items: number; items_target: number; }

function TrainingScoreBar({ handle }: { handle: string }) {
  const [data, setData] = useState<TrainingScore | null>(null);
  const [expanded, setExpanded] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    function load() {
      api(`/clones/${handle}/training-score`).then(r => r.ok ? r.json() : null).then(d => { if (mounted && d) setData(d); }).catch(() => {});
    }
    load();
    const iv = setInterval(load, 60000);
    return () => { mounted = false; clearInterval(iv); };
  }, [handle]);

  useEffect(() => {
    if (!expanded) return;
    function handler(e: MouseEvent) { if (popRef.current && !popRef.current.contains(e.target as Node)) setExpanded(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expanded]);

  if (!data) return null;

  const gradeColor = data.grade === "A" ? "rgba(52,211,153,0.80)" : data.grade === "B" ? "rgba(52,211,153,0.60)" : data.grade === "C" ? "rgba(255,255,255,0.55)" : "rgba(248,113,113,0.65)";

  return (
    <div ref={popRef} style={{ position: "relative" }}>
      <button
        onClick={() => setExpanded(v => !v)}
        title={`Training: ${data.score}% — ${data.next_action}`}
        style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          padding: "4px 12px 4px 6px", borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.04)",
          cursor: "pointer", fontFamily: "inherit", transition: "all 180ms",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
      >
        {/* Circular progress ring */}
        <svg width="24" height="24" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
          <circle cx="12" cy="12" r="10" fill="none" stroke={gradeColor} strokeWidth="2.5"
            strokeDasharray={`${(data.score / 100) * 62.83} 62.83`}
            strokeLinecap="round" transform="rotate(-90 12 12)" style={{ transition: "stroke-dasharray 0.6s ease" }} />
          <text x="12" y="12.5" textAnchor="middle" dominantBaseline="central"
            style={{ fontSize: 8, fontWeight: 600, fill: gradeColor }}>{data.grade}</text>
        </svg>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.50)", whiteSpace: "nowrap" }}>{data.score}%</span>
      </button>

      {expanded && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50,
          width: 280, padding: "14px 16px",
          background: "rgba(12,12,12,0.98)", border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 14, backdropFilter: "blur(20px)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.65)",
          animation: "menu-in 260ms cubic-bezier(0.34,1.56,0.64,1) both",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.70)" }}>Training Score</span>
            <span style={{ fontSize: 18, fontWeight: 500, color: gradeColor }}>{data.score}<span style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>/100</span></span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.values(data.breakdown).map((b, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: b.score >= b.max ? "rgba(52,211,153,0.70)" : "rgba(255,255,255,0.45)" }}>{b.label}</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{b.score}/{b.max}</span>
                </div>
                <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)" }}>
                  <div style={{ height: "100%", borderRadius: 2, width: `${(b.score / b.max) * 100}%`, background: b.score >= b.max ? "rgba(52,211,153,0.55)" : "rgba(255,255,255,0.20)", transition: "width 0.4s ease" }} />
                </div>
              </div>
            ))}
          </div>

          {data.next_action && (
            <div style={{ marginTop: 14, padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.25)", display: "block", marginBottom: 3 }}>Next step</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{data.next_action}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── VoiceMemoButton ───────────────────────────────────────────────────────────

function VoiceMemoButton({ cloneId }: { cloneId: string }) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const doppel = (window as any).doppelDesktop;

  // Listen for global hotkey (Ctrl+Shift+V)
  useEffect(() => {
    if (!doppel?.onVoiceHotkey) return;
    const unsub = doppel.onVoiceHotkey(() => {
      if (recorderRef.current && recorderRef.current.state === "recording") {
        stopRecording();
      } else {
        startRecording();
      }
    });
    return unsub;
  }, [cloneId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size < 1000) { setToast("Too short"); setTimeout(() => setToast(""), 2000); return; }
        setUploading(true);
        try {
          const buf = await blob.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
          const result = await doppel.uploadVoiceMemo(cloneId, base64);
          if (result?.ok && result.stored) {
            setToast("Got it — transcribed and learned");
          } else if (result?.ok && !result.stored) {
            setToast("Too short to store");
          } else {
            setToast(result?.error || "Upload failed");
          }
        } catch { setToast("Upload failed"); }
        setUploading(false);
        setTimeout(() => setToast(""), 3000);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch { setToast("Mic access denied"); setTimeout(() => setToast(""), 3000); }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
      recorderRef.current = null;
      setRecording(false);
    }
  }

  function handleClick() {
    if (recording) stopRecording();
    else startRecording();
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={uploading}
        title={recording ? "Stop recording" : "Record voice memo (Ctrl+Shift+V)"}
        style={{
          position: "absolute", bottom: 130, right: 20, zIndex: 30,
          width: 44, height: 44, borderRadius: 22,
          background: recording ? "rgba(248,113,113,0.18)" : "rgba(255,255,255,0.07)",
          border: `1px solid ${recording ? "rgba(248,113,113,0.35)" : "rgba(255,255,255,0.10)"}`,
          color: recording ? "rgba(248,113,113,0.90)" : "rgba(255,255,255,0.50)",
          cursor: uploading ? "wait" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 200ms", boxShadow: recording ? "0 0 16px rgba(248,113,113,0.20)" : "none",
        }}
        onMouseEnter={e => { if (!recording) { e.currentTarget.style.background = "rgba(255,255,255,0.11)"; e.currentTarget.style.color = "rgba(255,255,255,0.75)"; } }}
        onMouseLeave={e => { if (!recording) { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "rgba(255,255,255,0.50)"; } }}
      >
        {uploading
          ? <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.25)", borderTopColor: "rgba(255,255,255,0.75)", animation: "spin 0.8s linear infinite" }} />
          : recording
            ? <div style={{ width: 14, height: 14, borderRadius: 3, background: "rgba(248,113,113,0.85)", animation: "typing-dot 1s ease-in-out infinite" }} />
            : <IMic />
        }
      </button>
      {toast && (
        <div style={{
          position: "absolute", bottom: 180, right: 20, zIndex: 30,
          padding: "8px 14px", borderRadius: 10,
          background: "rgba(10,10,10,0.95)", border: "1px solid rgba(255,255,255,0.10)",
          backdropFilter: "blur(12px)", boxShadow: "0 4px 20px rgba(0,0,0,0.40)",
          fontSize: 12, color: "rgba(255,255,255,0.70)", whiteSpace: "nowrap",
          animation: "msg-in 200ms ease both",
        }}>
          {toast}
        </div>
      )}
    </>
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
  const [activeView,          setActiveView]          = useState<"chat"|"activity"|"connectors"|"training"|"knowledge">("chat");
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
        <div style={{ maxWidth:1080,margin:"0 auto",display:"flex",alignItems:"center",gap:10,padding:"10px 16px" }}>
          <div style={{ width:36,height:36,borderRadius:8,background:cloneColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:500,color:"#fff",flexShrink:0,overflow:"hidden" }}>
            {clone.avatar_url ? <img src={clone.avatar_url} alt="" style={{ width:"100%",height:"100%",objectFit:"cover" }} onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none"}} /> : cloneInitial}
          </div>
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ fontSize:14,fontWeight:500,color:"rgba(255,255,255,0.93)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{cloneName}</div>
            <div style={{ fontSize:11,color:"rgba(255,255,255,0.40)",marginTop:1 }}>@{clone.handle}</div>
          </div>
          <TrainingScoreBar handle={clone.handle} />
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
        <div style={{ maxWidth:1080,margin:"0 auto",padding:"0 16px 10px",display:"flex",gap:2 }}>
          {(["chat","activity","connectors","training","knowledge"] as const).map(v => (
            <button key={v} onClick={()=>setActiveView(v)} style={{ fontSize:12,fontWeight:500,padding:"5px 14px",borderRadius:8,border:"none",background:activeView===v?"rgba(255,255,255,0.09)":"transparent",color:activeView===v?"rgba(255,255,255,0.82)":"rgba(255,255,255,0.30)",cursor:"pointer",fontFamily:"inherit",transition:"all 180ms",textTransform:"capitalize" }}>{v}</button>
          ))}
        </div>
      </header>

      {activeView==="chat" ? (
        <>
          {/* Readiness gate */}
          {readiness && !readiness.is_ready && (
            <div style={{ margin:"10px 16px 0",maxWidth:1080,alignSelf:"center",width:"calc(100% - 32px)",flexShrink:0 }}>
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
          <div className="chat-scroll" ref={scrollRef} style={{ flex:1,width:"100%",maxWidth:1080,margin:"0 auto",padding:isEmpty?"24px 20px 16px":"24px 20px 140px",display:"flex",flexDirection:"column",gap:18,overflowY:"auto",boxSizing:"border-box" }}>
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
            <div style={{ maxWidth:1080,margin:"0 auto" }}>
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
      ) : activeView==="training" ? (
        <TrainingPanel cloneId={clone.clone_id} handle={clone.handle} />
      ) : activeView==="knowledge" ? (
        <KnowledgePanel cloneId={clone.clone_id} handle={clone.handle} />
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

      {/* Voice memo floating button */}
      {activeView === "chat" && <VoiceMemoButton cloneId={clone.clone_id} />}

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

// ── TrainingPanel ─────────────────────────────────────────────────────────────

interface ObsSource { source_type: string; enabled: boolean; items_observed: number; items_ingested: number; last_observed_at: string | null; status: string; }
interface ObsActivity { id: string; source_type: string; items_fetched: number; items_ingested: number; items_skipped: number; insights_extracted: number; duration_ms: number | null; error_message: string | null; started_at: string; }
interface PendingInsight { id: string; insight_type: string; content: string; confidence: number; source_type: string; created_at: string; metadata: Record<string, unknown>; }

const OBS_SOURCE_LABELS: Record<string, string> = { gmail: "Gmail", slack: "Slack", gdrive: "Google Drive", github: "GitHub", notion: "Notion", gcal: "Calendar", screenwatch: "Screen Watch" };
const OBS_SOURCE_LIST = ["gmail", "slack", "gdrive", "github", "notion", "gcal", "screenwatch"];

// ── Training Suggestions — surface low-confidence queries ──────────────────

interface TrainingSuggestion {
  id: string;
  question: string;
  confidence: number;
  needs_escalation: boolean;
  created_at: string;
}

function TrainingSuggestions({ handle, onTeach }: { handle: string; onTeach: (topic: string) => void }) {
  const [suggestions, setSuggestions] = useState<TrainingSuggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    api(`/clones/${handle}/training-suggestions?limit=5`)
      .then(async (r) => {
        if (r.ok) {
          const d = await r.json();
          setSuggestions(d.suggestions ?? []);
        }
      })
      .catch(() => {});
  }, [handle]);

  const visible = suggestions.filter((s) => !dismissed.has(s.id));
  if (visible.length === 0) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.10em", color: "rgba(248,113,113,0.50)", margin: "0 0 10px" }}>
        Knowledge gaps
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {visible.map((s) => (
          <div
            key={s.id}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px", borderRadius: 12,
              background: "rgba(248,113,113,0.03)",
              border: "1px solid rgba(248,113,113,0.10)",
            }}
          >
            <div style={{
              width: 24, height: 24, borderRadius: 6, flexShrink: 0,
              background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "rgba(248,113,113,0.60)", fontSize: 12,
            }}>?</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                "{s.question}"
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 10, color: "rgba(255,255,255,0.22)" }}>
                {Math.round(s.confidence * 100)}% confidence
              </p>
            </div>
            <button
              onClick={() => onTeach(s.question)}
              style={{
                fontSize: 10, fontWeight: 500, padding: "4px 10px", borderRadius: 7,
                background: "rgba(167,139,250,0.10)", border: "1px solid rgba(167,139,250,0.22)",
                color: "rgba(167,139,250,0.80)", cursor: "pointer", fontFamily: "inherit",
                flexShrink: 0, whiteSpace: "nowrap",
              }}
            >
              Teach it
            </button>
            <button
              onClick={() => setDismissed((prev) => new Set(prev).add(s.id))}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "rgba(255,255,255,0.18)", fontSize: 13, padding: "0 2px",
                lineHeight: 1, fontFamily: "inherit", flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Desktop Feed-Data panels (use api() instead of fetch) ────────────────────

const DESKTOP_TOPICS = ["how I close deals","my management style","how I give feedback","our pricing strategy","how I think about product","my decision-making process"];
type DInterviewMsg = { role: "clone"|"user"; text: string };

function DesktopInterviewPanel({ cloneId, initialTopic }: { cloneId: string; initialTopic?: string }) {
  const [phase, setPhase] = useState<"topic"|"interview"|"review">("topic");
  const [topic, setTopic] = useState("");
  const hasAutoStarted = useRef(false);
  const [messages, setMessages] = useState<DInterviewMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [chunks, setChunks] = useState<string[]>([]);
  const [removedChunks, setRemovedChunks] = useState<Set<number>>(new Set());
  const [ingesting, setIngesting] = useState(false);
  const [ingestDone, setIngestDone] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const userTurnCount = messages.filter(m=>m.role==="user").length;

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[messages,loading]);
  useEffect(()=>{if(inputRef.current){inputRef.current.style.height="auto";inputRef.current.style.height=Math.min(inputRef.current.scrollHeight,120)+"px";}},[input]);

  function reset(){setPhase("topic");setMessages([]);setChunks([]);setRemovedChunks(new Set());setInput("");setError(null);setIngestDone(false);}

  function startInterview(t?:string){
    const t_=(t??topic).trim();if(!t_)return;if(t)setTopic(t);
    setMessages([]);setError(null);setIngestDone(false);
    setMessages([{role:"clone",text:`Tell me about ${t_}. Where would you like to start — and what's the most important thing you want me to understand about it?`}]);
    setPhase("interview");
  }

  // Auto-start when triggered from training suggestions
  useEffect(() => {
    if (initialTopic && !hasAutoStarted.current) {
      hasAutoStarted.current = true;
      startInterview(initialTopic);
    }
  }, [initialTopic]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSend(){
    const text=input.trim();if(!text||loading)return;setInput("");setError(null);
    const updated:DInterviewMsg[]=[...messages,{role:"user",text}];setMessages(updated);setLoading(true);
    try{
      const res=await api("/interview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:topic.trim(),messages:updated,action:"followup"})});
      const d=await res.json();
      if(d.question)setMessages(prev=>[...prev,{role:"clone",text:d.question}]);else setError("No response — try again");
    }catch{setError("Failed to get next question");}finally{setLoading(false);}
  }

  async function handleFinish(){
    if(userTurnCount===0){reset();return;}setFormatting(true);
    try{
      const res=await api("/interview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:topic.trim(),messages,action:"format"})});
      const d=await res.json();setChunks(d.chunks??[]);setRemovedChunks(new Set());setPhase("review");
    }catch{setError("Failed to format — try again");}finally{setFormatting(false);}
  }

  async function handleIngestAll(){
    if(ingesting||chunks.length===0)return;setIngesting(true);setError(null);
    const toIngest=chunks.filter((_,i)=>!removedChunks.has(i));
    try{
      for(const chunk of toIngest){
        await api("/ingestion/text",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clone_id:cloneId,text:chunk,source:"interview"})});
      }
      setIngestDone(true);
    }catch{setError("Ingestion failed — try again");}finally{setIngesting(false);}
  }

  const keptChunks=chunks.filter((_,i)=>!removedChunks.has(i));

  return (
    <div style={{ borderRadius:14,overflow:"hidden",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",marginBottom:14 }}>
      {/* Header */}
      <div style={{ padding:"18px 20px 14px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",gap:10 }}>
        <div style={{ width:32,height:32,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(167,139,250,0.12)",border:"1px solid rgba(167,139,250,0.22)",color:"rgba(167,139,250,0.85)",flexShrink:0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <div style={{ flex:1 }}>
          <div style={{ display:"flex",alignItems:"center",gap:6 }}>
            <span style={{ fontSize:14,fontWeight:500,color:"rgba(255,255,255,0.85)" }}>Train by talking</span>
            <span style={{ fontSize:9,fontWeight:500,padding:"2px 6px",borderRadius:999,background:"rgba(167,139,250,0.10)",color:"rgba(167,139,250,0.70)",border:"1px solid rgba(167,139,250,0.18)" }}>Recommended</span>
          </div>
          <p style={{ fontSize:11,color:"rgba(255,255,255,0.30)",margin:"2px 0 0" }}>Answer naturally — everything gets cleaned up and saved.</p>
        </div>
      </div>

      {/* Topic */}
      {phase==="topic"&&(
        <div style={{ padding:"20px 20px 18px" }}>
          <p style={{ fontSize:18,fontWeight:300,color:"rgba(255,255,255,0.78)",margin:"0 0 4px" }}>What do you want to teach your clone today?</p>
          <p style={{ fontSize:12,color:"rgba(255,255,255,0.30)",margin:"0 0 16px",lineHeight:1.5 }}>Pick a topic — the interviewer will ask questions until it understands everything you know about it.</p>
          <div style={{ display:"flex",gap:6,marginBottom:12 }}>
            <input value={topic} onChange={e=>setTopic(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&topic.trim())startInterview();}}
              placeholder="e.g. how I close deals, my management style..." autoFocus
              style={{ flex:1,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:10,padding:"9px 12px",fontSize:13,color:"rgba(255,255,255,0.75)",fontFamily:"inherit",outline:"none" }} />
            <button onClick={()=>startInterview()} disabled={!topic.trim()}
              style={{ padding:"0 18px",borderRadius:10,fontSize:12,fontWeight:500,background:topic.trim()?"rgba(167,139,250,0.15)":"rgba(167,139,250,0.05)",border:`1px solid ${topic.trim()?"rgba(167,139,250,0.28)":"rgba(167,139,250,0.10)"}`,color:topic.trim()?"rgba(167,139,250,0.85)":"rgba(167,139,250,0.28)",cursor:topic.trim()?"pointer":"default",fontFamily:"inherit",whiteSpace:"nowrap" }}>
              Start
            </button>
          </div>
          <div style={{ display:"flex",flexWrap:"wrap",gap:5 }}>
            <span style={{ fontSize:10,color:"rgba(255,255,255,0.22)",alignSelf:"center",marginRight:2 }}>Try:</span>
            {DESKTOP_TOPICS.map(t=>(
              <button key={t} onClick={()=>startInterview(t)}
                style={{ fontSize:11,padding:"3px 9px",borderRadius:999,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.40)",cursor:"pointer",fontFamily:"inherit" }}>{t}</button>
            ))}
          </div>
        </div>
      )}

      {/* Interview */}
      {phase==="interview"&&(
        <div style={{ display:"flex",flexDirection:"column" }}>
          <div style={{ display:"flex",alignItems:"center",gap:8,padding:"8px 20px",background:"rgba(255,255,255,0.015)",borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
            <span style={{ fontSize:10,color:"rgba(255,255,255,0.22)" }}>Topic:</span>
            <span style={{ fontSize:11,color:"rgba(167,139,250,0.70)",background:"rgba(167,139,250,0.08)",border:"1px solid rgba(167,139,250,0.14)",borderRadius:5,padding:"2px 7px" }}>{topic}</span>
            {userTurnCount>0&&<span style={{ fontSize:10,color:"rgba(255,255,255,0.20)",marginLeft:"auto" }}>{userTurnCount} exchange{userTurnCount!==1?"s":""}</span>}
          </div>
          <div style={{ minHeight:240,maxHeight:380,overflowY:"auto",display:"flex",flexDirection:"column",gap:12,padding:"16px 20px",scrollbarWidth:"thin" }}>
            {messages.map((m,i)=>(
              <div key={i} style={{ display:"flex",gap:8,alignItems:"flex-end",flexDirection:m.role==="user"?"row-reverse":"row" }}>
                {m.role==="clone"&&<div style={{ width:24,height:24,borderRadius:"50%",flexShrink:0,background:"rgba(167,139,250,0.15)",border:"1px solid rgba(167,139,250,0.22)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600,color:"rgba(167,139,250,0.80)" }}>?</div>}
                <div style={{ maxWidth:"72%",padding:"9px 13px",borderRadius:m.role==="clone"?"4px 14px 14px 14px":"14px 4px 14px 14px",background:m.role==="clone"?"rgba(255,255,255,0.04)":"rgba(167,139,250,0.10)",border:`1px solid ${m.role==="clone"?"rgba(255,255,255,0.07)":"rgba(167,139,250,0.20)"}`,fontSize:12,color:m.role==="clone"?"rgba(255,255,255,0.75)":"rgba(255,255,255,0.70)",lineHeight:1.55 }}>{m.text}</div>
              </div>
            ))}
            {(loading||formatting)&&(
              <div style={{ display:"flex",gap:8,alignItems:"flex-end" }}>
                <div style={{ width:24,height:24,borderRadius:"50%",background:"rgba(167,139,250,0.15)",border:"1px solid rgba(167,139,250,0.22)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600,color:"rgba(167,139,250,0.80)",flexShrink:0 }}>?</div>
                <div style={{ display:"flex",gap:4,padding:"10px 14px",borderRadius:"4px 14px 14px 14px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)" }}>
                  {[0,1,2].map(i=>(<span key={i} style={{ width:4,height:4,borderRadius:"50%",background:"rgba(255,255,255,0.30)",display:"inline-block",animation:`typing-dot 1s ${i*0.18}s ease-in-out infinite` }} />))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div style={{ borderTop:"1px solid rgba(255,255,255,0.06)",padding:"12px 16px 14px" }}>
            {error&&<p style={{ fontSize:10,color:"rgba(248,113,113,0.60)",margin:"0 0 6px 2px" }}>{error}</p>}
            <div style={{ display:"flex",gap:6,alignItems:"flex-end" }}>
              <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleSend();}}}
                placeholder="Type your answer... (Enter to send)"
                rows={1} disabled={loading||formatting}
                style={{ flex:1,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:10,padding:"8px 12px",fontSize:12,color:"rgba(255,255,255,0.75)",fontFamily:"inherit",resize:"none",overflow:"hidden",outline:"none",lineHeight:1.5 }} />
              <button onClick={handleSend} disabled={!input.trim()||loading||formatting}
                style={{ padding:"8px 14px",borderRadius:10,fontSize:12,fontWeight:500,background:(input.trim()&&!loading&&!formatting)?"rgba(167,139,250,0.14)":"rgba(255,255,255,0.03)",border:`1px solid ${(input.trim()&&!loading&&!formatting)?"rgba(167,139,250,0.25)":"rgba(255,255,255,0.07)"}`,color:(input.trim()&&!loading&&!formatting)?"rgba(167,139,250,0.85)":"rgba(255,255,255,0.20)",cursor:(!input.trim()||loading||formatting)?"default":"pointer",fontFamily:"inherit",flexShrink:0 }}>Send</button>
            </div>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:8 }}>
              <span style={{ fontSize:10,color:"rgba(255,255,255,0.20)" }}>{userTurnCount===0?"Answer the first question to get started":`${userTurnCount} exchange${userTurnCount!==1?"s":""}`}</span>
              <div style={{ display:"flex",gap:5 }}>
                <button onClick={reset} style={{ padding:"4px 10px",borderRadius:7,fontSize:11,background:"none",border:"1px solid rgba(255,255,255,0.07)",color:"rgba(255,255,255,0.25)",cursor:"pointer",fontFamily:"inherit" }}>Discard</button>
                <button onClick={handleFinish} disabled={loading||formatting||userTurnCount===0}
                  style={{ padding:"4px 12px",borderRadius:7,fontSize:11,fontWeight:500,background:(userTurnCount>0&&!loading&&!formatting)?"rgba(52,211,153,0.08)":"rgba(255,255,255,0.02)",border:`1px solid ${(userTurnCount>0&&!loading&&!formatting)?"rgba(52,211,153,0.20)":"rgba(255,255,255,0.06)"}`,color:(userTurnCount>0&&!loading&&!formatting)?"rgba(52,211,153,0.75)":"rgba(255,255,255,0.18)",cursor:(loading||formatting||userTurnCount===0)?"default":"pointer",fontFamily:"inherit" }}>
                  {formatting?"Processing...":"Finish & review"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review */}
      {phase==="review"&&(
        <div style={{ padding:"18px 20px 20px" }}>
          <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,marginBottom:12 }}>
            <div>
              <p style={{ fontSize:14,fontWeight:500,color:"rgba(255,255,255,0.82)",margin:"0 0 3px" }}>{keptChunks.length} piece{keptChunks.length!==1?"s":""} extracted</p>
              <p style={{ fontSize:11,color:"rgba(255,255,255,0.30)",margin:0 }}>Remove anything inaccurate before saving.</p>
            </div>
            <span style={{ fontSize:10,color:"rgba(255,255,255,0.22)",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:5,padding:"2px 8px",flexShrink:0 }}>{topic}</span>
          </div>
          <div style={{ display:"flex",flexDirection:"column",gap:6,marginBottom:14,maxHeight:320,overflowY:"auto",paddingRight:2 }}>
            {chunks.map((chunk,i)=>{
              const removed=removedChunks.has(i);
              return (
                <div key={i} style={{ padding:"10px 12px",borderRadius:9,background:removed?"rgba(255,255,255,0.01)":"rgba(255,255,255,0.04)",border:`1px solid ${removed?"rgba(255,255,255,0.04)":"rgba(255,255,255,0.08)"}`,display:"flex",gap:10,alignItems:"flex-start",opacity:removed?0.35:1 }}>
                  <span style={{ fontSize:9,color:"rgba(255,255,255,0.18)",fontFamily:"monospace",flexShrink:0,paddingTop:2,minWidth:16 }}>#{i+1}</span>
                  <p style={{ fontSize:12,color:"rgba(255,255,255,0.68)",lineHeight:1.6,margin:0,flex:1 }}>{chunk}</p>
                  <button onClick={()=>setRemovedChunks(prev=>{const next=new Set(prev);if(next.has(i))next.delete(i);else next.add(i);return next;})}
                    style={{ background:"none",border:"none",cursor:"pointer",padding:"1px 3px",color:removed?"rgba(52,211,153,0.45)":"rgba(255,255,255,0.20)",flexShrink:0,fontSize:13,lineHeight:1 }}>{removed?"\u21a9":"\u00d7"}</button>
                </div>
              );
            })}
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:8 }}>
            {ingestDone?(
              <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                <span style={{ fontSize:12,color:"rgba(52,211,153,0.70)" }}>{"\u2713"} {keptChunks.length} piece{keptChunks.length!==1?"s":""} saved</span>
                <button onClick={reset} style={{ padding:"5px 12px",borderRadius:7,fontSize:11,background:"none",border:"1px solid rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.35)",cursor:"pointer",fontFamily:"inherit" }}>New session</button>
              </div>
            ):(
              <>
                <button onClick={handleIngestAll} disabled={ingesting||keptChunks.length===0}
                  style={{ padding:"7px 18px",borderRadius:10,fontSize:12,fontWeight:500,background:keptChunks.length>0?"rgba(52,211,153,0.10)":"rgba(255,255,255,0.02)",border:`1px solid ${keptChunks.length>0?"rgba(52,211,153,0.22)":"rgba(255,255,255,0.06)"}`,color:keptChunks.length>0?"rgba(52,211,153,0.80)":"rgba(255,255,255,0.22)",cursor:(ingesting||keptChunks.length===0)?"default":"pointer",fontFamily:"inherit",opacity:ingesting?0.6:1 }}>
                  {ingesting?"Saving...":`Save ${keptChunks.length} piece${keptChunks.length!==1?"s":""}`}
                </button>
                <button onClick={()=>setPhase("interview")} style={{ padding:"7px 14px",borderRadius:10,fontSize:12,background:"none",border:"1px solid rgba(255,255,255,0.07)",color:"rgba(255,255,255,0.30)",cursor:"pointer",fontFamily:"inherit" }}>Keep talking</button>
                <button onClick={reset} style={{ padding:"7px 14px",borderRadius:10,fontSize:12,background:"none",border:"none",color:"rgba(255,255,255,0.20)",cursor:"pointer",fontFamily:"inherit" }}>Discard</button>
              </>
            )}
            {error&&<span style={{ fontSize:10,color:"rgba(248,113,113,0.60)" }}>{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SpeechRecognition types for voice panel ─────────────────────────────────

type DSpeechEvent = { results: { [i: number]: { [j: number]: { transcript: string }; isFinal: boolean } }; resultIndex: number };
type DSpeechError = { error: string };
interface DSpeechRec { continuous: boolean; interimResults: boolean; lang: string; start(): void; stop(): void; onresult: ((e: DSpeechEvent) => void) | null; onerror: ((e: DSpeechError) => void) | null; onend: (() => void) | null; }

function dChunkTranscript(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  const chunks: string[] = []; let current = "";
  for (const s of sentences) {
    const joined = (current + " " + s).trim();
    if (joined.split(/\s+/).length > 250 && current) { chunks.push(current.trim()); current = s; }
    else current = joined;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(c => c.split(/\s+/).length >= 5);
}

function DesktopVoicePanel({ cloneId }: { cloneId: string }) {
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [transcript, setTranscript] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const recognitionRef = useRef<DSpeechRec | null>(null);
  const finalRef = useRef("");
  const supported = typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  function startRecording() {
    if (!supported) return;
    setError(null); setResult(null); setTranscript(""); setInterim(""); finalRef.current = "";
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    const rec: DSpeechRec = new SR();
    rec.continuous = true; rec.interimResults = true; rec.lang = "en-US";
    rec.onresult = (e: DSpeechEvent) => {
      let interimText = "";
      for (let i = e.resultIndex; i < Object.keys(e.results).length; i++) {
        const r = e.results[i];
        if (r.isFinal) { finalRef.current += r[0].transcript + " "; setTranscript(finalRef.current); }
        else interimText += r[0].transcript;
      }
      setInterim(interimText);
    };
    rec.onerror = (e: DSpeechError) => { if (e.error !== "no-speech") setError(`Mic: ${e.error}`); };
    rec.onend = () => { setRecording(false); setInterim(""); };
    recognitionRef.current = rec; rec.start(); setRecording(true);
  }

  function stopRecording() { recognitionRef.current?.stop(); setRecording(false); }

  async function handleIngest() {
    const text = finalRef.current.trim();
    if (!text) return;
    const chunks = dChunkTranscript(text);
    if (chunks.length === 0) { setError("Too short — speak a few more sentences."); return; }
    setIngesting(true); setError(null);
    try {
      let total = 0;
      for (const chunk of chunks) {
        const res = await api("/ingestion/text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clone_id: cloneId, text: chunk, source: "voice" }) });
        const d = await res.json(); total += d.chunks_stored ?? 0;
      }
      setResult(`${total} chunk${total !== 1 ? "s" : ""} saved`);
      setTranscript(""); finalRef.current = "";
    } catch { setError("Failed"); }
    finally { setIngesting(false); }
  }

  return (
    <div style={{ borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: open ? 10 : 0 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center",
          background: recording ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${recording ? "rgba(239,68,68,0.20)" : "rgba(255,255,255,0.08)"}`,
          color: recording ? "rgba(239,68,68,0.70)" : "rgba(255,255,255,0.40)", flexShrink: 0,
        }}>
          {recording
            ? <span style={{ width: 7, height: 7, borderRadius: 2, background: "rgba(239,68,68,0.75)", animation: "voice-pulse 1s ease-in-out infinite" }} />
            : <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="8" y="2" width="8" height="13" rx="4" stroke="currentColor" strokeWidth="1.5"/><path d="M4 11a8 8 0 0016 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M12 19v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          }
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.70)", margin: 0 }}>Voice monologue</p>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", margin: 0 }}>Speak freely, save the transcript</p>
        </div>
        <button onClick={() => { setOpen(o => !o); if (recording) stopRecording(); setResult(null); setError(null); }}
          style={{ fontSize: 11, padding: "4px 10px", borderRadius: 7, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.40)", cursor: "pointer", fontFamily: "inherit" }}>
          {open ? "Close" : "Record"}
        </button>
      </div>
      {open && (
        <>
          {!supported && <p style={{ fontSize: 11, color: "rgba(248,113,113,0.60)", margin: "0 0 8px" }}>Not supported in this browser.</p>}
          {(transcript || interim || recording) && (
            <div style={{ minHeight: 50, maxHeight: 120, overflowY: "auto", padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.55, marginBottom: 8 }}>
              {transcript}
              {interim && <span style={{ color: "rgba(255,255,255,0.25)" }}>{interim}</span>}
              {recording && !transcript && !interim && <span style={{ color: "rgba(255,255,255,0.20)" }}>Listening...</span>}
            </div>
          )}
          <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
            {!recording
              ? <button onClick={startRecording} disabled={!supported} style={{ padding: "6px 12px", borderRadius: 7, fontSize: 11, fontWeight: 500, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.55)", cursor: supported ? "pointer" : "not-allowed", fontFamily: "inherit", opacity: !supported ? 0.4 : 1 }}>Start recording</button>
              : <button onClick={stopRecording} style={{ padding: "6px 12px", borderRadius: 7, fontSize: 11, fontWeight: 500, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.20)", color: "rgba(239,68,68,0.70)", cursor: "pointer", fontFamily: "inherit", animation: "voice-pulse 1.5s ease-in-out infinite" }}>Stop</button>
            }
            {transcript && !recording && (
              <button onClick={handleIngest} disabled={ingesting} style={{ padding: "6px 12px", borderRadius: 7, fontSize: 11, fontWeight: 500, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.55)", cursor: ingesting ? "default" : "pointer", fontFamily: "inherit" }}>
                {ingesting ? "Saving..." : "Save to memory"}
              </button>
            )}
            {result && <span style={{ fontSize: 10, color: "rgba(52,211,153,0.65)" }}>{result}</span>}
            {error && <span style={{ fontSize: 10, color: "rgba(248,113,113,0.60)" }}>{error}</span>}
          </div>
          <style>{`@keyframes voice-pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>
        </>
      )}
    </div>
  );
}

function DesktopTextPanel({ cloneId }:{ cloneId:string }){
  const [text,setText]=useState("");
  const [open,setOpen]=useState(false);
  const [ingesting,setIngesting]=useState(false);
  const [result,setResult]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);

  async function handleIngest(){
    const trimmed=text.trim();if(!trimmed||ingesting)return;
    setIngesting(true);setResult(null);setError(null);
    try{
      const res=await api("/ingestion/text",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clone_id:cloneId,text:trimmed,source:"upload"})});
      const d=await res.json();
      if(!res.ok){setError(String(d.detail??d.error??"Failed"));return;}
      setResult(`${d.chunks_stored} chunk${d.chunks_stored!==1?"s":""} saved`);setText("");setOpen(false);
    }catch(e){setError(String(e));}finally{setIngesting(false);}
  }

  return (
    <div style={{ borderRadius:12,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",padding:"14px 16px" }}>
      <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:open?10:0 }}>
        <div style={{ width:28,height:28,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.40)",flexShrink:0 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 10h16M4 14h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </div>
        <div style={{ flex:1 }}>
          <p style={{ fontSize:12,fontWeight:500,color:"rgba(255,255,255,0.70)",margin:0 }}>Paste text</p>
          <p style={{ fontSize:10,color:"rgba(255,255,255,0.25)",margin:0 }}>Notes, bios, frameworks, opinions</p>
        </div>
        <button onClick={()=>{setOpen(o=>!o);setResult(null);setError(null);}}
          style={{ fontSize:11,padding:"4px 10px",borderRadius:7,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.40)",cursor:"pointer",fontFamily:"inherit" }}>{open?"Close":"Add"}</button>
      </div>
      {open&&(
        <>
          <textarea value={text} onChange={e=>{setText(e.target.value);setResult(null);setError(null);}}
            placeholder="Paste or type anything here..." rows={3} autoFocus
            style={{ width:"100%",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,padding:"8px 10px",fontSize:12,color:"rgba(255,255,255,0.70)",fontFamily:"inherit",resize:"vertical",marginBottom:6,outline:"none",lineHeight:1.5,boxSizing:"border-box" }} />
          <div style={{ display:"flex",alignItems:"center",gap:6 }}>
            <button onClick={handleIngest} disabled={!text.trim()||ingesting}
              style={{ padding:"6px 14px",borderRadius:7,fontSize:11,fontWeight:500,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.10)",color:"rgba(255,255,255,0.60)",cursor:(!text.trim()||ingesting)?"default":"pointer",fontFamily:"inherit",opacity:(!text.trim()||ingesting)?0.4:1 }}>
              {ingesting?"Saving...":"Save to memory"}
            </button>
            {result&&<span style={{ fontSize:10,color:"rgba(52,211,153,0.65)" }}>{result}</span>}
            {error&&<span style={{ fontSize:10,color:"rgba(248,113,113,0.60)" }}>{error}</span>}
          </div>
        </>
      )}
    </div>
  );
}

function DesktopFilePanel({ cloneId }:{ cloneId:string }){
  type FItem={id:string;name:string;status:"pending"|"uploading"|"done"|"error";result?:string};
  const [queue,setQueue]=useState<FItem[]>([]);
  const [open,setOpen]=useState(false);
  const [isDragging,setIsDragging]=useState(false);
  const fileInputRef=useRef<HTMLInputElement>(null);

  function addFiles(files:FileList|File[]){
    const items:FItem[]=Array.from(files).map(f=>({id:`${f.name}-${Date.now()}`,name:f.name,status:"pending"}));
    setQueue(prev=>[...prev,...items]);
    uploadFiles(Array.from(files),items);
  }

  async function uploadFiles(files:File[],items:FItem[]){
    for(let i=0;i<files.length;i++){
      const item=items[i];const file=files[i];
      setQueue(prev=>prev.map(f=>f.id===item.id?{...f,status:"uploading"}:f));
      try{
        const fd=new FormData();fd.append("clone_id",cloneId);fd.append("file",file);
        const res=await fetch(`${BACKEND}/ingestion/file`,{method:"POST",body:fd,headers:{"X-User-Id":_userId}});
        let data:Record<string,unknown>={};try{data=await res.json();}catch{data={error:res.statusText};}
        if(!res.ok)setQueue(prev=>prev.map(f=>f.id===item.id?{...f,status:"error",result:String(data.detail??data.error??`HTTP ${res.status}`)}:f));
        else setQueue(prev=>prev.map(f=>f.id===item.id?{...f,status:"done",result:`${data.chunks_stored} chunks`}:f));
      }catch(e){setQueue(prev=>prev.map(f=>f.id===item.id?{...f,status:"error",result:String(e)}:f));}
    }
  }

  return (
    <div style={{ borderRadius:12,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",padding:"14px 16px" }}>
      <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:open?10:0 }}>
        <div style={{ width:28,height:28,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.40)",flexShrink:0 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 16V6M12 6L8 10M12 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </div>
        <div style={{ flex:1 }}>
          <p style={{ fontSize:12,fontWeight:500,color:"rgba(255,255,255,0.70)",margin:0 }}>Upload files</p>
          <p style={{ fontSize:10,color:"rgba(255,255,255,0.25)",margin:0 }}>PDF, DOCX, TXT, CSV, MD</p>
        </div>
        <button onClick={()=>{setOpen(o=>!o);setQueue([]);}}
          style={{ fontSize:11,padding:"4px 10px",borderRadius:7,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.40)",cursor:"pointer",fontFamily:"inherit" }}>{open?"Close":"Upload"}</button>
      </div>
      {open&&(
        <>
          <div
            onDragOver={e=>{e.preventDefault();setIsDragging(true);}}
            onDragLeave={()=>setIsDragging(false)}
            onDrop={e=>{e.preventDefault();setIsDragging(false);if(e.dataTransfer.files.length)addFiles(e.dataTransfer.files);}}
            onClick={()=>fileInputRef.current?.click()}
            style={{ border:`1.5px dashed ${isDragging?"rgba(255,255,255,0.20)":"rgba(255,255,255,0.08)"}`,borderRadius:9,padding:"14px 14px",display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"pointer",background:isDragging?"rgba(255,255,255,0.02)":"transparent",marginBottom:6 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ color:"rgba(255,255,255,0.18)" }}><path d="M12 16V6M12 6L8 10M12 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            <p style={{ fontSize:11,color:"rgba(255,255,255,0.28)",margin:0 }}>Drop files or click to browse</p>
          </div>
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.md,.json,.html" style={{ display:"none" }} onChange={e=>{if(e.target.files?.length){addFiles(e.target.files);e.target.value="";}}} />
          {queue.length>0&&(
            <div style={{ display:"flex",flexDirection:"column",gap:4 }}>
              {queue.map(item=>(
                <div key={item.id} style={{ display:"flex",alignItems:"center",gap:6,fontSize:11 }}>
                  <span style={{ fontSize:9,color:"rgba(255,255,255,0.18)",fontFamily:"monospace",minWidth:26 }}>{item.name.split(".").pop()?.toUpperCase()}</span>
                  <span style={{ flex:1,color:"rgba(255,255,255,0.50)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{item.name}</span>
                  <span style={{ fontSize:10,flexShrink:0,color:item.status==="done"?"rgba(52,211,153,0.60)":item.status==="error"?"rgba(248,113,113,0.55)":"rgba(255,255,255,0.25)" }}>
                    {item.status==="uploading"?"...":item.status==="done"?item.result:item.status==="error"?"error":"queued"}
                  </span>
                  <button onClick={()=>setQueue(prev=>prev.filter(f=>f.id!==item.id))} style={{ color:"rgba(255,255,255,0.12)",background:"none",border:"none",cursor:"pointer",fontSize:14,lineHeight:1,padding:0 }}>{"\u00d7"}</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TrainingPanel({ cloneId, handle }: { cloneId: string; handle: string }) {
  const [sources, setSources] = useState<ObsSource[]>([]);
  const [activity, setActivity] = useState<ObsActivity[]>([]);
  const [insights, setInsights] = useState<PendingInsight[]>([]);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [swStatus, setSwStatus] = useState<{ enabled: boolean; running: boolean } | null>(null);
  const [suggestedTopic, setSuggestedTopic] = useState<string | undefined>();

  const doppel = (window as any).doppelDesktop;

  const load = useCallback(async () => {
    try {
      const [srcRes, actRes, insRes, toolsRes] = await Promise.all([
        api(`/observation/sources?clone_id=${cloneId}`),
        api(`/observation/activity?clone_id=${cloneId}&limit=20`),
        api(`/observation/insights?clone_id=${cloneId}&status=pending&limit=20`),
        api(`/clones/${cloneId}/tools`),
      ]);
      if (srcRes.ok) { const d = await srcRes.json(); setSources(d.sources || []); }
      if (actRes.ok) { const d = await actRes.json(); setActivity(d.activity || []); }
      if (insRes.ok) { const d = await insRes.json(); setInsights(d.insights || []); }
      if (toolsRes.ok) {
        const td = await toolsRes.json();
        const tools: { name: string }[] = Array.isArray(td) ? td : td.tools ?? [];
        const ids = new Set(tools.map(t => TOOL_NAME_TO_ID[t.name]).filter(Boolean));
        setConnectedIds(ids);
      }
    } catch {}
    setLoading(false);
  }, [cloneId]);

  useEffect(() => { load(); }, [load]);

  // Load screenwatch status from Electron
  useEffect(() => {
    if (doppel?.screenwatchStatus) {
      doppel.screenwatchStatus().then((s: any) => setSwStatus(s));
    }
  }, []);

  const toggleSource = async (sourceType: string, currentlyEnabled: boolean) => {
    // Screenwatch: also start/stop the desktop capture timer
    if (sourceType === "screenwatch" && doppel) {
      if (currentlyEnabled) {
        await doppel.stopScreenwatch();
        setSwStatus(prev => prev ? { ...prev, enabled: false, running: false } : null);
      } else {
        // Ensure backend source config exists
        const existing = sources.find(s => s.source_type === "screenwatch");
        if (!existing) {
          await api(`/observation/sources`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clone_id: cloneId, source_type: "screenwatch", enabled: true, mode: "push", frequency: "realtime" }) });
        } else {
          await api(`/observation/sources/screenwatch?clone_id=${cloneId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: true }) });
        }
        await doppel.startScreenwatch(cloneId);
        setSwStatus({ enabled: true, running: true });
        load();
        return;
      }
    }

    const existing = sources.find(s => s.source_type === sourceType);
    if (existing) {
      await api(`/observation/sources/${sourceType}?clone_id=${cloneId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !currentlyEnabled }) });
    } else {
      await api(`/observation/sources`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clone_id: cloneId, source_type: sourceType, enabled: true, frequency: "hourly" }) });
    }
    load();
  };

  const triggerSync = async (sourceType: string) => {
    await api(`/observation/trigger?clone_id=${cloneId}&source_type=${sourceType}`, { method: "POST" });
    load();
  };

  const reviewInsight = async (insightId: string, action: "approve" | "reject") => {
    await api(`/observation/insights/${insightId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    setInsights(prev => prev.filter(i => i.id !== insightId));
  };

  const timeAgo = (iso: string | null) => {
    if (!iso) return "—";
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* Training suggestions — knowledge gaps */}
        <TrainingSuggestions handle={handle} onTeach={(topic) => setSuggestedTopic(topic)} />

        {/* Manual training */}
        <DesktopInterviewPanel key={suggestedTopic ?? "default"} cloneId={cloneId} initialTopic={suggestedTopic} />
        <div style={{ marginTop: 10, marginBottom: 28 }}>
          <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.10em", color: "rgba(255,255,255,0.20)", margin: "0 0 10px" }}>Other ways to add context</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <DesktopTextPanel cloneId={cloneId} />
            <DesktopVoicePanel cloneId={cloneId} />
            <DesktopFilePanel cloneId={cloneId} />
          </div>
        </div>

        {/* Observations */}
        <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", margin: "0 0 12px" }}>Observations</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 28 }}>
          {OBS_SOURCE_LIST.map(stype => {
            const src = sources.find(s => s.source_type === stype);
            const enabled = stype === "screenwatch" ? (swStatus?.running ?? src?.enabled ?? false) : (src?.enabled ?? false);
            const status = src?.status ?? "idle";
            const isScreenwatch = stype === "screenwatch";
            const isConnected = isScreenwatch || connectedIds.has(stype);
            return (
              <div key={stype} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", opacity: isConnected ? 1 : 0.45 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: enabled && status !== "error" ? "rgba(52,211,153,0.70)" : "rgba(255,255,255,0.18)", flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", flex: 1, fontWeight: 500 }}>{OBS_SOURCE_LABELS[stype] || stype}</span>
                {src && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>{timeAgo(src.last_observed_at)}</span>}
                {src && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>{src.items_ingested.toLocaleString()} learned</span>}
                {!isConnected && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>Not connected</span>}
                {isConnected && enabled && !isScreenwatch && (
                  <button onClick={() => triggerSync(stype)} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.45)", cursor: "pointer", fontFamily: "inherit" }}>Sync</button>
                )}
                {isConnected && (
                  <button onClick={() => toggleSource(stype, enabled)} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 6, border: `1px solid ${enabled ? "rgba(52,211,153,0.25)" : "rgba(255,255,255,0.10)"}`, background: enabled ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.04)", color: enabled ? "rgba(52,211,153,0.75)" : "rgba(255,255,255,0.40)", cursor: "pointer", fontFamily: "inherit" }}>
                    {enabled ? "On" : "Off"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Pending insights */}
        {insights.length > 0 && (
          <>
            <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", margin: "0 0 12px" }}>
              Pending review <span style={{ color: "rgba(255,255,255,0.40)" }}>({insights.length})</span>
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 28 }}>
              {insights.map(insight => (
                <div key={insight.id} style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <p style={{ margin: "0 0 6px", fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>"{insight.content}"</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>from: {OBS_SOURCE_LABELS[insight.source_type] || insight.source_type}</span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>confidence: {(insight.confidence * 100).toFixed(0)}%</span>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)" }}>{insight.insight_type.replace(/_/g, " ")}</span>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                      <button onClick={() => reviewInsight(insight.id, "approve")} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 6, border: "1px solid rgba(52,211,153,0.25)", background: "rgba(52,211,153,0.08)", color: "rgba(52,211,153,0.75)", cursor: "pointer", fontFamily: "inherit" }}>Approve</button>
                      <button onClick={() => reviewInsight(insight.id, "reject")} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.40)", cursor: "pointer", fontFamily: "inherit" }}>Reject</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Activity feed */}
        <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", margin: "0 0 12px" }}>Activity</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {activity.length === 0 && !loading && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", textAlign: "center", padding: "20px 0" }}>No observation activity yet. Enable a source above to start.</p>
          )}
          {activity.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderRadius: 10, background: a.error_message ? "rgba(248,113,113,0.04)" : "rgba(255,255,255,0.02)", border: `1px solid ${a.error_message ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.05)"}` }}>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: a.error_message ? "rgba(248,113,113,0.60)" : "rgba(255,255,255,0.20)", flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", flex: 1 }}>
                {a.error_message
                  ? `Error observing ${OBS_SOURCE_LABELS[a.source_type] || a.source_type}`
                  : `Observed ${a.items_fetched} items from ${OBS_SOURCE_LABELS[a.source_type] || a.source_type}, ingested ${a.items_ingested}${a.insights_extracted > 0 ? `, ${a.insights_extracted} insights` : ""}`}
              </span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.20)", flexShrink: 0 }}>{timeAgo(a.started_at)}</span>
              {a.duration_ms != null && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.15)" }}>{(a.duration_ms / 1000).toFixed(1)}s</span>}
            </div>
          ))}
        </div>

        {loading && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", textAlign: "center", padding: "12px 0" }}>Loading...</p>}
      </div>
    </div>
  );
}

// ── KnowledgePanel — Memory Inspector + Omitter ─────────────────────────────

interface MemoryChunkD { id: string; content: string; source: string; topics: string[]; is_pinned: boolean; is_excluded: boolean; created_at: string | null; }
interface SemanticFactD { id: string; fact: string; domain: string | null; confidence: number; created_at: string | null; }
interface OmissionRuleD { pattern: string; created_at: string; affected: number; }

const MEM_SOURCE_LABEL: Record<string,string> = { gmail:"Gmail",upload:"Upload",voice:"Voice",interview:"Interview",seed_qa:"Q&A",chat:"Chat",slack:"Slack",notion:"Notion",gdrive:"Drive",github:"GitHub" };
const MEM_SOURCES = ["gmail","upload","voice","interview","chat","notion","gdrive","github"] as const;

function KnowledgePanel({ cloneId, handle }: { cloneId: string; handle: string }) {
  const [tab, setTab] = useState<"pinned"|"all"|"facts"|"omit">("pinned");
  const [memories, setMemories] = useState<MemoryChunkD[]>([]);
  const [total, setTotal] = useState(0);
  const [facts, setFacts] = useState<SemanticFactD[]>([]);
  const [factsTotal, setFactsTotal] = useState(0);
  const [rules, setRules] = useState<OmissionRuleD[]>([]);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [omitInput, setOmitInput] = useState("");
  const [omitAdding, setOmitAdding] = useState(false);
  const [omitResult, setOmitResult] = useState<string|null>(null);
  const LIMIT = 20;
  const debounceRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setDebouncedSearch(search); setPage(0); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const loadEpisodic = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ clone_id: cloneId, limit: String(LIMIT), offset: String(page * LIMIT) });
    if (tab === "pinned") params.set("pinned_only", "true");
    if (tab === "all") params.set("include_excluded", "true");
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (sourceFilter) params.set("source", sourceFilter);
    try {
      const res = await api(`/brain/memories?${params}`);
      if (res.ok) { const d = await res.json(); setMemories(d.memories ?? []); setTotal(d.total ?? 0); }
    } catch {}
    setLoading(false);
  }, [cloneId, tab, page, debouncedSearch, sourceFilter]);

  const loadFacts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ clone_id: cloneId, limit: String(LIMIT), offset: String(page * LIMIT) });
    if (debouncedSearch) params.set("search", debouncedSearch);
    try {
      const res = await api(`/brain/semantic?${params}`);
      if (res.ok) { const d = await res.json(); setFacts(d.facts ?? []); setFactsTotal(d.total ?? 0); }
    } catch {}
    setLoading(false);
  }, [cloneId, page, debouncedSearch]);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(`/clones/${handle}/omissions`);
      if (res.ok) { const d = await res.json(); setRules(d.rules ?? []); }
    } catch {}
    setLoading(false);
  }, [handle]);

  useEffect(() => {
    setPage(0); setSelected(new Set());
    if (tab === "facts") loadFacts();
    else if (tab === "omit") loadRules();
    else loadEpisodic();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === "facts") loadFacts();
    else if (tab !== "omit") loadEpisodic();
  }, [page, debouncedSearch, sourceFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function patchMem(id: string, patch: Record<string,unknown>) {
    await api(`/brain/memories/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clone_id: cloneId, ...patch }) });
    if (tab === "facts") loadFacts(); else loadEpisodic();
  }

  async function deleteMem(id: string) {
    await api(`/brain/memories/${id}?clone_id=${cloneId}`, { method: "DELETE" });
    loadEpisodic();
  }

  async function bulkDelete() {
    if (selected.size === 0 || bulkDeleting) return;
    setBulkDeleting(true);
    await Promise.all(Array.from(selected).map(id => api(`/brain/memories/${id}?clone_id=${cloneId}`, { method: "DELETE" })));
    setSelected(new Set()); loadEpisodic(); setBulkDeleting(false);
  }

  async function patchFact(id: string, fact: string) {
    await api(`/brain/semantic/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clone_id: cloneId, fact }) });
    loadFacts();
  }

  async function deleteFact(id: string) {
    await api(`/brain/semantic/${id}?clone_id=${cloneId}`, { method: "DELETE" });
    loadFacts();
  }

  async function addOmitRule() {
    if (!omitInput.trim() || omitAdding) return;
    setOmitAdding(true); setOmitResult(null);
    try {
      const res = await api(`/clones/${handle}/omissions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pattern: omitInput.trim() }) });
      if (res.ok) { const d = await res.json(); setOmitResult(`"${d.pattern}" blocked — ${d.affected} chunk${d.affected !== 1 ? "s" : ""} excluded`); setOmitInput(""); loadRules(); }
    } catch {} finally { setOmitAdding(false); }
  }

  async function removeOmitRule(pattern: string) {
    await api(`/clones/${handle}/omissions?pattern=${encodeURIComponent(pattern)}`, { method: "DELETE" });
    loadRules();
  }

  const totalPages = tab === "facts" ? Math.ceil(factsTotal / LIMIT) : Math.ceil(total / LIMIT);
  const allPageSelected = memories.length > 0 && memories.every(c => selected.has(c.id));

  return (
    <div style={{ flex:1,overflowY:"auto",padding:"20px 16px 80px",maxWidth:1080,margin:"0 auto",width:"100%" }}>
      {/* Omitter */}
      <div style={{ borderRadius:14,overflow:"hidden",background:"rgba(239,68,68,0.04)",border:"1px solid rgba(239,68,68,0.18)",marginBottom:14 }}>
        <div style={{ padding:"14px 18px",borderBottom:"1px solid rgba(239,68,68,0.10)",display:"flex",alignItems:"center",gap:10 }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color:"rgba(248,113,113,0.80)",flexShrink:0 }}><path d="M8 2L14.5 13.5H1.5L8 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M8 6v4M8 11.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          <div style={{ flex:1 }}>
            <p style={{ fontSize:13,fontWeight:500,color:"rgba(248,113,113,0.85)",margin:0 }}>Memory omitter</p>
            <p style={{ fontSize:11,color:"rgba(255,255,255,0.35)",margin:"2px 0 0" }}>Block topics or keywords permanently from memory.</p>
          </div>
        </div>
        <div style={{ padding:"12px 18px",borderBottom:"1px solid rgba(239,68,68,0.08)" }}>
          <div style={{ display:"flex",gap:8 }}>
            <input value={omitInput} onChange={e=>setOmitInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addOmitRule()}
              placeholder="e.g. salary, home address, medical history..."
              style={{ flex:1,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(239,68,68,0.16)",borderRadius:10,padding:"7px 12px",fontSize:12,color:"rgba(255,255,255,0.75)",fontFamily:"inherit",outline:"none" }} />
            <button onClick={addOmitRule} disabled={omitAdding||!omitInput.trim()}
              style={{ padding:"7px 14px",borderRadius:10,fontSize:12,fontWeight:500,background:omitInput.trim()?"rgba(239,68,68,0.12)":"rgba(239,68,68,0.05)",border:"1px solid rgba(239,68,68,0.22)",color:omitInput.trim()?"rgba(248,113,113,0.80)":"rgba(248,113,113,0.30)",cursor:omitInput.trim()?"pointer":"default",fontFamily:"inherit" }}>
              {omitAdding?"Blocking...":"Block"}
            </button>
          </div>
          {omitResult && <p style={{ fontSize:11,color:"rgba(248,113,113,0.60)",margin:"6px 0 0" }}>{omitResult}</p>}
        </div>
        {rules.length>0 && (
          <div>
            {rules.map((rule,idx)=>(
              <div key={rule.pattern} style={{ padding:"9px 18px",borderTop:idx===0?"none":"1px solid rgba(239,68,68,0.06)",display:"flex",alignItems:"center",gap:8 }}>
                <span style={{ flex:1,fontSize:12,color:"rgba(255,255,255,0.60)",fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{rule.pattern}</span>
                <span style={{ fontSize:10,color:rule.affected>0?"rgba(248,113,113,0.50)":"rgba(255,255,255,0.22)",flexShrink:0 }}>{rule.affected} chunk{rule.affected!==1?"s":""}</span>
                <button onClick={()=>removeOmitRule(rule.pattern)} style={{ fontSize:10,color:"rgba(255,255,255,0.25)",background:"none",border:"none",cursor:"pointer",padding:0,flexShrink:0 }}>remove</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inspector */}
      <div style={{ borderRadius:14,overflow:"hidden",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ padding:"14px 18px 12px",borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10 }}>
            <div>
              <p style={{ fontSize:14,fontWeight:500,color:"rgba(255,255,255,0.80)",margin:0 }}>Memory inspector</p>
              <p style={{ fontSize:11,color:"rgba(255,255,255,0.30)",margin:"3px 0 0" }}>
                {tab==="facts"?"Edit or delete extracted facts":"Pin, hide, edit, or delete memory chunks"}
              </p>
            </div>
            <div style={{ display:"flex",gap:2,background:"rgba(255,255,255,0.03)",borderRadius:10,padding:3 }}>
              {(["pinned","all","facts"] as const).map(t=>(
                <button key={t} onClick={()=>{setTab(t);setPage(0);setSearch("");setSelected(new Set());}}
                  style={{ padding:"4px 11px",borderRadius:8,fontSize:11,cursor:"pointer",border:"none",background:tab===t?"rgba(255,255,255,0.08)":"transparent",color:tab===t?"rgba(255,255,255,0.80)":"rgba(255,255,255,0.35)",fontFamily:"inherit" }}>
                  {t==="pinned"?"Pinned":t==="all"?"All":"Facts"}
                </button>
              ))}
            </div>
          </div>

          {/* Bulk actions */}
          {tab!=="facts"&&memories.length>0&&(
            <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8 }}>
              <label style={{ display:"flex",alignItems:"center",gap:5,cursor:"pointer" }}>
                <input type="checkbox" checked={allPageSelected} onChange={()=>{
                  if(allPageSelected) setSelected(s=>{const n=new Set(s);memories.forEach(c=>n.delete(c.id));return n;});
                  else setSelected(s=>{const n=new Set(s);memories.forEach(c=>n.add(c.id));return n;});
                }} style={{ cursor:"pointer",width:12,height:12,accentColor:"rgba(255,255,255,0.55)" }} />
                <span style={{ fontSize:10,color:"rgba(255,255,255,0.30)" }}>{selected.size>0?`${selected.size} selected`:"Select all"}</span>
              </label>
              {selected.size>0&&(
                <button onClick={bulkDelete} disabled={bulkDeleting}
                  style={{ marginLeft:"auto",fontSize:10,padding:"3px 10px",borderRadius:6,cursor:bulkDeleting?"not-allowed":"pointer",background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.20)",color:"rgba(248,113,113,0.70)",fontFamily:"inherit" }}>
                  {bulkDeleting?"Deleting...":(`Delete ${selected.size}`)}
                </button>
              )}
            </div>
          )}

          {/* Search + filter */}
          {tab!=="facts"&&(
            <div style={{ display:"flex",gap:8 }}>
              <div style={{ position:"relative",flex:1 }}>
                <svg style={{ position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"rgba(255,255,255,0.22)",pointerEvents:"none" }} width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3"/><path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search memories..."
                  style={{ width:"100%",paddingLeft:28,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,padding:"6px 10px 6px 28px",fontSize:11,color:"rgba(255,255,255,0.70)",fontFamily:"inherit",outline:"none" }} />
              </div>
              <select value={sourceFilter} onChange={e=>{setSourceFilter(e.target.value);setPage(0);setSelected(new Set());}}
                style={{ background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,padding:"6px 8px",fontSize:11,color:"rgba(255,255,255,0.60)",fontFamily:"inherit",outline:"none",cursor:"pointer" }}>
                <option value="">All sources</option>
                {MEM_SOURCES.map(s=><option key={s} value={s}>{MEM_SOURCE_LABEL[s]??s}</option>)}
              </select>
            </div>
          )}

          {tab==="facts"&&(
            <div style={{ position:"relative" }}>
              <svg style={{ position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"rgba(255,255,255,0.22)",pointerEvents:"none" }} width="11" height="11" viewBox="0 0 12 12" fill="none">
                <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3"/><path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search facts..."
                style={{ width:"100%",paddingLeft:28,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,padding:"6px 10px 6px 28px",fontSize:11,color:"rgba(255,255,255,0.70)",fontFamily:"inherit",outline:"none" }} />
            </div>
          )}
        </div>

        {loading && <p style={{ padding:"16px 18px",fontSize:12,color:"rgba(255,255,255,0.25)" }}>Loading...</p>}

        {/* Episodic rows */}
        {!loading && tab!=="facts" && (
          <>
            {memories.length===0 && (
              <p style={{ padding:"24px 18px",textAlign:"center",fontSize:12,color:"rgba(255,255,255,0.28)" }}>
                {debouncedSearch?`No memories matching "${debouncedSearch}".`:tab==="pinned"?"No pinned memories yet.":"No memories found."}
              </p>
            )}
            {memories.map((chunk,idx)=>(
              <MemoryRowD key={chunk.id} chunk={chunk} idx={idx} cloneId={cloneId}
                isSelected={selected.has(chunk.id)}
                onSelect={(id,checked)=>setSelected(s=>{const n=new Set(s);checked?n.add(id):n.delete(id);return n;})}
                onPatch={patchMem} onDelete={deleteMem} />
            ))}
          </>
        )}

        {/* Fact rows */}
        {!loading && tab==="facts" && (
          <>
            {facts.length===0 && (
              <p style={{ padding:"24px 18px",textAlign:"center",fontSize:12,color:"rgba(255,255,255,0.28)" }}>
                {debouncedSearch?`No facts matching "${debouncedSearch}".`:"No semantic facts yet."}
              </p>
            )}
            {facts.map((f,idx)=>(
              <FactRowD key={f.id} fact={f} idx={idx} onPatch={patchFact} onDelete={deleteFact} />
            ))}
          </>
        )}

        {/* Pagination */}
        {totalPages>1&&tab!=="omit"&&(
          <div style={{ padding:"8px 18px",borderTop:"1px solid rgba(255,255,255,0.05)",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
            <span style={{ fontSize:11,color:"rgba(255,255,255,0.22)" }}>
              {page*LIMIT+1}–{Math.min((page+1)*LIMIT, tab==="facts"?factsTotal:total)} of {tab==="facts"?factsTotal:total}
            </span>
            <div style={{ display:"flex",gap:6 }}>
              <button onClick={()=>setPage(p=>p-1)} disabled={page===0} style={{ fontSize:11,padding:"3px 10px",borderRadius:6,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:page===0?"rgba(255,255,255,0.15)":"rgba(255,255,255,0.45)",cursor:page===0?"default":"pointer",fontFamily:"inherit" }}>Prev</button>
              <button onClick={()=>setPage(p=>p+1)} disabled={page>=totalPages-1} style={{ fontSize:11,padding:"3px 10px",borderRadius:6,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:page>=totalPages-1?"rgba(255,255,255,0.15)":"rgba(255,255,255,0.45)",cursor:page>=totalPages-1?"default":"pointer",fontFamily:"inherit" }}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MemoryRowD({ chunk, idx, cloneId, isSelected, onSelect, onPatch, onDelete }: {
  chunk: MemoryChunkD; idx: number; cloneId: string; isSelected: boolean;
  onSelect: (id:string,checked:boolean)=>void;
  onPatch: (id:string,patch:Record<string,unknown>)=>void;
  onDelete: (id:string)=>void;
}) {
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(chunk.content);
  const [confirmDel, setConfirmDel] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  async function saveEdit() {
    if(!editVal.trim()||editVal===chunk.content){setEditing(false);return;}
    setSaving(true);
    await onPatch(chunk.id, { content: editVal.trim() });
    setEditing(false); setSaving(false);
  }

  return (
    <div onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>{setHovered(false);if(!editing&&!confirmDel)setConfirmDel(false);}}
      style={{ padding:"10px 18px",borderTop:idx===0?"none":"1px solid rgba(255,255,255,0.04)",opacity:chunk.is_excluded?0.40:1,background:hovered?"rgba(255,255,255,0.02)":"transparent" }}>
      {editing?(
        <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
          <textarea value={editVal} onChange={e=>setEditVal(e.target.value)} rows={3} autoFocus
            style={{ background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:8,padding:"8px 10px",fontSize:12,color:"rgba(255,255,255,0.75)",fontFamily:"inherit",resize:"vertical",outline:"none",width:"100%" }} />
          <div style={{ display:"flex",gap:6 }}>
            <button onClick={saveEdit} disabled={saving||!editVal.trim()} style={{ fontSize:11,padding:"4px 12px",borderRadius:6,background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.14)",color:"rgba(255,255,255,0.70)",cursor:"pointer",fontFamily:"inherit" }}>{saving?"Saving...":"Save"}</button>
            <button onClick={()=>{setEditing(false);setEditVal(chunk.content);}} style={{ fontSize:11,padding:"4px 12px",borderRadius:6,background:"none",border:"1px solid rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.35)",cursor:"pointer",fontFamily:"inherit" }}>Cancel</button>
          </div>
        </div>
      ):confirmDel?(
        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
          <p style={{ fontSize:11,color:"rgba(248,113,113,0.70)",margin:0,flex:1 }}>Permanently delete?</p>
          <button onClick={()=>{onDelete(chunk.id);setConfirmDel(false);}} style={{ fontSize:10,padding:"3px 10px",borderRadius:6,background:"rgba(239,68,68,0.10)",border:"1px solid rgba(239,68,68,0.22)",color:"rgba(248,113,113,0.80)",cursor:"pointer",fontFamily:"inherit" }}>Delete</button>
          <button onClick={()=>setConfirmDel(false)} style={{ fontSize:10,padding:"3px 10px",borderRadius:6,background:"none",border:"1px solid rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.35)",cursor:"pointer",fontFamily:"inherit" }}>Cancel</button>
        </div>
      ):(
        <div style={{ display:"flex",alignItems:"flex-start",gap:10 }}>
          <input type="checkbox" checked={isSelected} onChange={e=>onSelect(chunk.id,e.target.checked)}
            style={{ marginTop:3,flexShrink:0,cursor:"pointer",width:12,height:12,accentColor:"rgba(255,255,255,0.55)" }} />
          <button onClick={()=>onPatch(chunk.id,{is_pinned:!chunk.is_pinned})} title={chunk.is_pinned?"Unpin":"Pin"}
            style={{ marginTop:2,flexShrink:0,background:"none",border:"none",cursor:"pointer",padding:0,color:chunk.is_pinned?"rgba(255,255,255,0.55)":"rgba(255,255,255,0.12)" }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M5 1h2l.5 3.5L9 5v1H7.5L7 11H5l-.5-5H3V5l1.5-.5L5 1z" fill={chunk.is_pinned?"currentColor":"none"} stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
          </button>
          <div style={{ flex:1,minWidth:0 }}>
            <p onClick={()=>setExpanded(e=>!e)} style={{ fontSize:12,color:"rgba(255,255,255,0.65)",lineHeight:1.5,margin:0,cursor:"pointer",...(!expanded?{display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical" as const,overflow:"hidden"}:{}) }}>
              {chunk.content}
            </p>
            <div style={{ display:"flex",gap:6,marginTop:4,alignItems:"center" }}>
              <span style={{ fontSize:9,color:"rgba(255,255,255,0.22)",background:"rgba(255,255,255,0.04)",borderRadius:3,padding:"1px 5px" }}>{MEM_SOURCE_LABEL[chunk.source]??chunk.source}</span>
              {chunk.topics.slice(0,2).map(t=><span key={t} style={{ fontSize:9,color:"rgba(255,255,255,0.18)" }}>{t}</span>)}
              {chunk.created_at&&<span style={{ fontSize:9,color:"rgba(255,255,255,0.13)",marginLeft:"auto" }}>{new Date(chunk.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>}
            </div>
          </div>
          <div style={{ flexShrink:0,display:"flex",gap:6,opacity:hovered?1:0,transition:"opacity 0.15s" }}>
            <button onClick={()=>{setEditing(true);setEditVal(chunk.content);}} style={{ fontSize:9,color:"rgba(255,255,255,0.30)",background:"none",border:"none",cursor:"pointer",padding:0 }}>edit</button>
            {!chunk.is_excluded
              ?<button onClick={()=>onPatch(chunk.id,{is_excluded:true})} style={{ fontSize:9,color:"rgba(255,255,255,0.22)",background:"none",border:"none",cursor:"pointer",padding:0 }}>hide</button>
              :<button onClick={()=>onPatch(chunk.id,{is_excluded:false})} style={{ fontSize:9,color:"rgba(255,255,255,0.35)",background:"none",border:"none",cursor:"pointer",padding:0 }}>restore</button>
            }
            <button onClick={()=>setConfirmDel(true)} style={{ fontSize:9,color:"rgba(248,113,113,0.40)",background:"none",border:"none",cursor:"pointer",padding:0 }}>delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

function FactRowD({ fact, idx, onPatch, onDelete }: {
  fact: SemanticFactD; idx: number;
  onPatch: (id:string,fact:string)=>void;
  onDelete: (id:string)=>void;
}) {
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(fact.fact);
  const [confirmDel, setConfirmDel] = useState(false);
  const [saving, setSaving] = useState(false);

  const confColor = fact.confidence>=0.8?"rgba(52,211,153,0.60)":fact.confidence>=0.5?"rgba(255,255,255,0.35)":"rgba(251,191,36,0.55)";

  return (
    <div onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}
      style={{ padding:"9px 18px",borderTop:idx===0?"none":"1px solid rgba(255,255,255,0.04)",background:hovered?"rgba(255,255,255,0.02)":"transparent" }}>
      {editing?(
        <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
          <textarea value={editVal} onChange={e=>setEditVal(e.target.value)} rows={2} autoFocus
            style={{ background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.10)",borderRadius:8,padding:"8px 10px",fontSize:12,color:"rgba(255,255,255,0.75)",fontFamily:"inherit",resize:"vertical",outline:"none",width:"100%" }} />
          <div style={{ display:"flex",gap:6 }}>
            <button onClick={async()=>{if(!editVal.trim()||editVal===fact.fact){setEditing(false);return;}setSaving(true);await onPatch(fact.id,editVal.trim());setEditing(false);setSaving(false);}} disabled={saving} style={{ fontSize:11,padding:"4px 12px",borderRadius:6,background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.14)",color:"rgba(255,255,255,0.70)",cursor:"pointer",fontFamily:"inherit" }}>{saving?"Saving...":"Save"}</button>
            <button onClick={()=>{setEditing(false);setEditVal(fact.fact);}} style={{ fontSize:11,padding:"4px 12px",borderRadius:6,background:"none",border:"1px solid rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.35)",cursor:"pointer",fontFamily:"inherit" }}>Cancel</button>
          </div>
        </div>
      ):confirmDel?(
        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
          <p style={{ fontSize:11,color:"rgba(248,113,113,0.70)",margin:0,flex:1 }}>Delete this fact?</p>
          <button onClick={()=>{onDelete(fact.id);setConfirmDel(false);}} style={{ fontSize:10,padding:"3px 10px",borderRadius:6,background:"rgba(239,68,68,0.10)",border:"1px solid rgba(239,68,68,0.22)",color:"rgba(248,113,113,0.80)",cursor:"pointer",fontFamily:"inherit" }}>Delete</button>
          <button onClick={()=>setConfirmDel(false)} style={{ fontSize:10,padding:"3px 10px",borderRadius:6,background:"none",border:"1px solid rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.35)",cursor:"pointer",fontFamily:"inherit" }}>Cancel</button>
        </div>
      ):(
        <div style={{ display:"flex",alignItems:"flex-start",gap:8 }}>
          <div style={{ flex:1,minWidth:0 }}>
            <p style={{ fontSize:12,color:"rgba(255,255,255,0.62)",lineHeight:1.5,margin:0 }}>{fact.fact}</p>
            <div style={{ display:"flex",gap:6,marginTop:4 }}>
              {fact.domain&&<span style={{ fontSize:9,color:"rgba(255,255,255,0.22)",background:"rgba(255,255,255,0.04)",borderRadius:3,padding:"1px 5px" }}>{fact.domain}</span>}
              <span style={{ fontSize:9,color:confColor }}>{Math.round(fact.confidence*100)}% conf</span>
            </div>
          </div>
          <div style={{ flexShrink:0,display:"flex",gap:6,opacity:hovered?1:0,transition:"opacity 0.15s" }}>
            <button onClick={()=>{setEditing(true);setEditVal(fact.fact);}} style={{ fontSize:9,color:"rgba(255,255,255,0.30)",background:"none",border:"none",cursor:"pointer",padding:0 }}>edit</button>
            <button onClick={()=>setConfirmDel(true)} style={{ fontSize:9,color:"rgba(248,113,113,0.40)",background:"none",border:"none",cursor:"pointer",padding:0 }}>delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MyBrainPanel ──────────────────────────────────────────────────────────────

type BrainCategory = "role" | "background" | "expertise" | "goal" | "preference";
interface BrainMemory { id: string; content: string; category: BrainCategory; source: string; created_at: string; }

const BRAIN_CATEGORIES: { value: BrainCategory; label: string; description: string }[] = [
  { value: "role",       label: "Role",        description: "Your title, seniority, team" },
  { value: "background", label: "Background",  description: "Experience, career history, context" },
  { value: "expertise",  label: "Expertise",   description: "Domains you know deeply" },
  { value: "goal",       label: "Goals",       description: "What you're trying to achieve" },
  { value: "preference", label: "Preferences", description: "How you like information delivered" },
];

const BCAT_COLOR: Record<BrainCategory, string> = { role:"rgba(96,165,250,0.70)", background:"rgba(167,139,250,0.70)", expertise:"rgba(52,211,153,0.70)", goal:"rgba(251,191,36,0.70)", preference:"rgba(251,146,60,0.70)" };
const BCAT_BG: Record<BrainCategory, string>    = { role:"rgba(96,165,250,0.08)", background:"rgba(167,139,250,0.08)", expertise:"rgba(52,211,153,0.08)", goal:"rgba(251,191,36,0.08)", preference:"rgba(251,146,60,0.08)" };
const BCAT_BORDER: Record<BrainCategory, string> = { role:"rgba(96,165,250,0.18)", background:"rgba(167,139,250,0.18)", expertise:"rgba(52,211,153,0.18)", goal:"rgba(251,191,36,0.18)", preference:"rgba(251,146,60,0.18)" };

const ONBOARDING_PROMPTS: { category: BrainCategory; question: string; placeholder: string }[] = [
  { category: "role",       question: "What's your role?",                        placeholder: "e.g. Head of Product at a 50-person SaaS startup." },
  { category: "background", question: "What's your background?",                  placeholder: "e.g. 8 years in B2B software, started as a consultant." },
  { category: "expertise",  question: "What do you know deeply?",                 placeholder: "e.g. Go-to-market strategy, SQL, hiring for early-stage teams." },
  { category: "goal",       question: "What are you working toward right now?",   placeholder: "e.g. Closing Series A, scaling my team from 5 to 15." },
  { category: "preference", question: "How do you like information delivered?",    placeholder: "e.g. Short, direct answers. No bullet points unless I ask." },
];

function MyBrainPanel({ onBack }: { onBack: () => void }) {
  const [memories, setMemories] = useState<BrainMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [filter, setFilter] = useState<BrainCategory | "all">("all");
  const [addContent, setAddContent] = useState("");
  const [addCat, setAddCat] = useState<BrainCategory>("background");
  const [addSaving, setAddSaving] = useState(false);
  // Onboarding state
  const [obAnswers, setObAnswers] = useState<string[]>(ONBOARDING_PROMPTS.map(() => ""));
  const [obStep, setObStep] = useState(0);
  const [obSaving, setObSaving] = useState(false);

  function loadMemories() {
    api("/consumer/brain").then(r => r.ok ? r.json() : { memories: [] }).then(d => {
      const list: BrainMemory[] = d.memories ?? [];
      setMemories(list);
      if (list.length === 0) setShowOnboarding(true);
      setLoading(false);
    }).catch(() => setLoading(false));
  }
  useEffect(() => { loadMemories(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function deleteMemory(id: string) {
    setMemories(prev => prev.filter(m => m.id !== id));
    await api(`/consumer/brain/${id}`, { method: "DELETE" });
  }

  async function addMemory() {
    const trimmed = addContent.trim();
    if (!trimmed || addSaving) return;
    setAddSaving(true);
    try {
      const res = await api("/consumer/brain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: trimmed, category: addCat }) });
      if (res.ok) { const m = await res.json(); setMemories(prev => [{ id: m.id, content: trimmed, category: addCat, source: "manual", created_at: m.created_at }, ...prev]); setAddContent(""); }
    } finally { setAddSaving(false); }
  }

  async function finishOnboarding() {
    const filled = ONBOARDING_PROMPTS.map((p, i) => ({ ...p, answer: obAnswers[i].trim() })).filter(x => x.answer.length > 0);
    if (filled.length === 0) { setShowOnboarding(false); return; }
    setObSaving(true);
    try { await Promise.all(filled.map(x => api("/consumer/brain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: x.answer, category: x.category }) }))); } catch {}
    setObSaving(false); setShowOnboarding(false); loadMemories();
  }

  function obNext() { if (obStep < ONBOARDING_PROMPTS.length - 1) setObStep(obStep + 1); else finishOnboarding(); }

  const filtered = filter === "all" ? memories : memories.filter(m => m.category === filter);

  // Header component for reuse
  const header = (
    <header style={{ flexShrink:0, borderBottom:"1px solid rgba(255,255,255,0.07)", padding:"16px 20px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, maxWidth:560, margin:"0 auto" }}>
        <button onClick={onBack} style={{ display:"flex",alignItems:"center",gap:5,padding:"5px 10px",borderRadius:8,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.45)",cursor:"pointer",fontSize:11,fontFamily:"inherit",transition:"all 180ms" }}
          onMouseEnter={e=>{e.currentTarget.style.color="rgba(255,255,255,0.80)";e.currentTarget.style.background="rgba(255,255,255,0.08)"}}
          onMouseLeave={e=>{e.currentTarget.style.color="rgba(255,255,255,0.45)";e.currentTarget.style.background="rgba(255,255,255,0.04)"}}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Back
        </button>
        <h2 style={{ fontSize:15, fontWeight:500, color:"rgba(255,255,255,0.85)", margin:0, flex:1 }}>My Brain</h2>
        {memories.length > 0 && !showOnboarding && (
          <button onClick={() => { setShowOnboarding(true); setObStep(0); setObAnswers(ONBOARDING_PROMPTS.map(() => "")); }}
            style={{ fontSize:11, padding:"5px 12px", borderRadius:8, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.10)", color:"rgba(255,255,255,0.50)", cursor:"pointer", fontFamily:"inherit" }}>
            Re-run setup
          </button>
        )}
      </div>
    </header>
  );

  if (loading) return <div style={{ flex:1, display:"flex", flexDirection:"column" }}>{header}<div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center" }}><div style={{ width:18, height:18, borderRadius:"50%", border:"2px solid rgba(255,255,255,0.08)", borderTopColor:"rgba(255,255,255,0.40)", animation:"spin 0.8s linear infinite" }} /></div></div>;

  if (showOnboarding) {
    const prompt = ONBOARDING_PROMPTS[obStep];
    const isLast = obStep === ONBOARDING_PROMPTS.length - 1;
    const answer = obAnswers[obStep];
    return (
      <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
        {header}
        <div style={{ flex:1, overflowY:"auto", padding:"24px 20px 40px" }}>
          <div style={{ maxWidth:560, margin:"0 auto" }}>
            <p style={{ fontSize:13, color:"rgba(255,255,255,0.40)", lineHeight:1.6, marginBottom:24 }}>Tell your clones who they're talking to. This takes 2 minutes.</p>
            {/* Progress rail */}
            <div style={{ display:"flex", gap:5, marginBottom:32 }}>
              {ONBOARDING_PROMPTS.map((_, i) => <div key={i} style={{ flex:1, height:3, borderRadius:999, background:i <= obStep ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.09)", transition:"background 300ms" }} />)}
            </div>
            <p style={{ fontSize:10, textTransform:"uppercase", letterSpacing:"0.12em", color:BCAT_COLOR[prompt.category], marginBottom:10 }}>{BRAIN_CATEGORIES.find(c => c.value === prompt.category)?.label}</p>
            <h3 style={{ fontSize:20, fontWeight:300, color:"rgba(255,255,255,0.90)", margin:"0 0 8px" }}>{prompt.question}</h3>
            <p style={{ fontSize:12, color:"rgba(255,255,255,0.30)", marginBottom:20, lineHeight:1.5 }}>A CEO gets a different answer than a grad student — this is what makes that work.</p>
            <textarea value={answer} onChange={e => { const n = [...obAnswers]; n[obStep] = e.target.value; setObAnswers(n); }}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) obNext(); }}
              placeholder={prompt.placeholder} rows={4}
              style={{ width:"100%", boxSizing:"border-box", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.10)", borderRadius:14, padding:"14px 16px", fontSize:13, color:"rgba(255,255,255,0.82)", fontFamily:"inherit", outline:"none", resize:"none", lineHeight:1.65 }}
              onFocus={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)"} onBlur={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)"} />
            <div style={{ display:"flex", gap:10, marginTop:14, alignItems:"center" }}>
              <button onClick={obNext} disabled={obSaving} style={{ padding:"9px 22px", borderRadius:10, fontSize:12, fontWeight:500, background:answer.trim()?"rgba(255,255,255,0.10)":"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.14)", color:answer.trim()?"rgba(255,255,255,0.85)":"rgba(255,255,255,0.35)", cursor:"pointer", fontFamily:"inherit" }}>
                {obSaving ? "Saving..." : isLast ? "Done →" : "Next →"}
              </button>
              <button onClick={obNext} style={{ padding:"9px 14px", borderRadius:10, fontSize:12, background:"none", border:"none", color:"rgba(255,255,255,0.25)", cursor:"pointer", fontFamily:"inherit" }}>Skip</button>
              {obStep > 0 && <button onClick={() => setObStep(obStep - 1)} style={{ marginLeft:"auto", padding:"9px 14px", fontSize:11, background:"none", border:"none", color:"rgba(255,255,255,0.22)", cursor:"pointer", fontFamily:"inherit" }}>← Back</button>}
            </div>
            <p style={{ fontSize:10, color:"rgba(255,255,255,0.18)", marginTop:12 }}>Ctrl+Enter to continue · All fields optional</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column" }}>
      {header}
      <div style={{ flex:1, overflowY:"auto", padding:"24px 20px 40px" }}>
        <div style={{ maxWidth:560, margin:"0 auto", display:"flex", flexDirection:"column", gap:16 }}>
          {/* Info card */}
          <div style={{ padding:"14px 18px", borderRadius:13, background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", display:"flex", gap:12, alignItems:"flex-start" }}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ flexShrink:0, marginTop:2, color:"rgba(255,255,255,0.30)" }}><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/><path d="M8 7v5M8 5h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            <div>
              <p style={{ margin:"0 0 3px", fontSize:13, fontWeight:500, color:"rgba(255,255,255,0.65)" }}>Your profile shapes how every clone responds to you</p>
              <p style={{ margin:0, fontSize:12, color:"rgba(255,255,255,0.35)", lineHeight:1.55 }}>When you chat with any clone, they see your role, background and expertise — so a CEO gets a boardroom-ready answer and a junior dev gets an explanation with code examples.</p>
            </div>
          </div>

          {/* Filter pills */}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {[{ label:"all", count:memories.length }, ...BRAIN_CATEGORIES.map(c => ({ label:c.label, count:memories.filter(m => m.category === c.value).length, value:c.value }))].map(s => {
              const val = s.label === "all" ? "all" : (s as { value?: BrainCategory }).value ?? "all";
              const active = filter === val;
              return <button key={s.label} onClick={() => setFilter(val as BrainCategory | "all")} style={{ padding:"5px 14px", borderRadius:999, fontSize:11, background:active?"rgba(255,255,255,0.10)":"rgba(255,255,255,0.03)", border:`1px solid ${active?"rgba(255,255,255,0.18)":"rgba(255,255,255,0.07)"}`, color:active?"rgba(255,255,255,0.85)":"rgba(255,255,255,0.38)", cursor:"pointer", fontFamily:"inherit", transition:"all 130ms" }}>
                {s.label.charAt(0).toUpperCase() + s.label.slice(1)} · {s.count}
              </button>;
            })}
          </div>

          {/* Memory list */}
          {filtered.length > 0 ? (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {filtered.map(m => {
                const cat = m.category as BrainCategory;
                const color = BCAT_COLOR[cat] ?? "rgba(255,255,255,0.50)";
                const bg = BCAT_BG[cat] ?? "rgba(255,255,255,0.04)";
                const border = BCAT_BORDER[cat] ?? "rgba(255,255,255,0.09)";
                return (
                  <div key={m.id} style={{ display:"flex", gap:12, alignItems:"flex-start", padding:"14px 16px", borderRadius:13, background:bg, border:`1px solid ${border}` }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:6 }}>
                        <span style={{ fontSize:10, padding:"2px 7px", borderRadius:999, background:bg, border:`1px solid ${border}`, color, fontWeight:500, textTransform:"uppercase", letterSpacing:"0.06em" }}>
                          {BRAIN_CATEGORIES.find(c => c.value === cat)?.label ?? cat}
                        </span>
                      </div>
                      <p style={{ margin:0, fontSize:13, color:"rgba(255,255,255,0.78)", lineHeight:1.6 }}>{m.content}</p>
                    </div>
                    <button onClick={() => deleteMemory(m.id)} style={{ flexShrink:0, background:"none", border:"none", color:"rgba(255,255,255,0.20)", cursor:"pointer", fontSize:16, lineHeight:1, padding:"2px 4px" }}
                      onMouseEnter={e=>{e.currentTarget.style.color="rgba(248,113,113,0.60)"}} onMouseLeave={e=>{e.currentTarget.style.color="rgba(255,255,255,0.20)"}}>×</button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding:"32px 20px", textAlign:"center", border:"1px dashed rgba(255,255,255,0.08)", borderRadius:14, color:"rgba(255,255,255,0.25)", fontSize:13 }}>
              No {filter === "all" ? "" : filter + " "}entries yet — add one below.
            </div>
          )}

          {/* Add form */}
          <div style={{ padding:"18px 20px", borderRadius:14, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)" }}>
            <p style={{ fontSize:10, textTransform:"uppercase", letterSpacing:"0.10em", color:"rgba(255,255,255,0.28)", marginBottom:12 }}>Add entry</p>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12 }}>
              {BRAIN_CATEGORIES.map(c => {
                const active = addCat === c.value;
                return <button key={c.value} onClick={() => setAddCat(c.value)} style={{ padding:"5px 12px", borderRadius:999, fontSize:11, fontWeight:500, background:active?BCAT_BG[c.value]:"rgba(255,255,255,0.03)", border:`1px solid ${active?BCAT_BORDER[c.value]:"rgba(255,255,255,0.08)"}`, color:active?BCAT_COLOR[c.value]:"rgba(255,255,255,0.38)", cursor:"pointer", fontFamily:"inherit" }}>{c.label}</button>;
              })}
            </div>
            <textarea value={addContent} onChange={e => setAddContent(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addMemory(); }}
              placeholder={BRAIN_CATEGORIES.find(c => c.value === addCat)?.description + "..."} rows={3}
              style={{ width:"100%", boxSizing:"border-box", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:11, padding:"11px 13px", fontSize:13, color:"rgba(255,255,255,0.82)", fontFamily:"inherit", outline:"none", resize:"none", lineHeight:1.6, marginBottom:10 }}
              onFocus={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.20)"} onBlur={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"} />
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <button onClick={addMemory} disabled={!addContent.trim() || addSaving} style={{ padding:"8px 20px", borderRadius:10, fontSize:12, fontWeight:500, background:addContent.trim()?"rgba(255,255,255,0.09)":"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.12)", color:addContent.trim()?"rgba(255,255,255,0.80)":"rgba(255,255,255,0.25)", cursor:addContent.trim()?"pointer":"not-allowed", fontFamily:"inherit" }}>
                {addSaving ? "Saving..." : "Add →"}
              </button>
              <span style={{ fontSize:10, color:"rgba(255,255,255,0.18)", marginLeft:"auto" }}>Ctrl+Enter</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── OrgPanel ──────────────────────────────────────────────────────────────────

interface OrgCloneDetail { clone_id: string; display_name: string; handle: string; avatar_url: string | null; category: string | null; description: string; total_queries: number; is_verified: boolean; member_role: "admin" | "member"; }

const ORG_CAT_COLOR: Record<string, string> = { business:"#1A73E8", engineering:"#7B1FA2", design:"#E91E63", marketing:"#F57C00", finance:"#2E7D32", legal:"#546E7A", healthcare:"#C2185B", education:"#F9A825", science:"#00838F", other:"#8E24AA" };
function orgCatColor(c: string | null) { return ORG_CAT_COLOR[c ?? "other"] ?? "#8E24AA"; }
function orgHexToRgba(hex: string, alpha: number) { const r = parseInt(hex.slice(1, 3), 16); const g = parseInt(hex.slice(3, 5), 16); const b = parseInt(hex.slice(5, 7), 16); return `rgba(${r},${g},${b},${alpha})`; }

function OrgPanel({ onBack, onChatClone }: { onBack: () => void; onChatClone: (cloneId: string) => void }) {
  const [clones, setClones] = useState<OrgCloneDetail[]>([]);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api("/org/clones").then(r => r.ok ? r.json() : { clones: [] }).then(d => { setClones(d.clones ?? []); setOrgName(d.org_name ?? null); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const filtered = clones.filter(c => !search || c.display_name.toLowerCase().includes(search.toLowerCase()) || (c.category ?? "").toLowerCase().includes(search.toLowerCase()) || c.description.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      {/* Header */}
      <header style={{ flexShrink:0, borderBottom:"1px solid rgba(255,255,255,0.07)", padding:"16px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <button onClick={onBack} style={{ display:"flex",alignItems:"center",gap:5,padding:"5px 10px",borderRadius:8,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.45)",cursor:"pointer",fontSize:11,fontFamily:"inherit",transition:"all 180ms" }}
            onMouseEnter={e=>{e.currentTarget.style.color="rgba(255,255,255,0.80)";e.currentTarget.style.background="rgba(255,255,255,0.08)"}}
            onMouseLeave={e=>{e.currentTarget.style.color="rgba(255,255,255,0.45)";e.currentTarget.style.background="rgba(255,255,255,0.04)"}}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Back
          </button>
          <h2 style={{ fontSize:15, fontWeight:500, color:"rgba(255,255,255,0.85)", margin:0, flex:1 }}>{orgName ?? "My Organisation"}</h2>
          {/* Search */}
          <div style={{ position:"relative" }}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"rgba(255,255,255,0.25)", pointerEvents:"none" }}><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/><path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clones..." style={{ width:180, padding:"7px 12px 7px 30px", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:10, fontSize:12, color:"rgba(255,255,255,0.70)", outline:"none", fontFamily:"inherit" }} />
          </div>
        </div>
      </header>

      <div style={{ flex:1, overflowY:"auto", padding:"24px 20px 40px" }}>
        {loading ? (
          <div style={{ display:"flex", justifyContent:"center", padding:48 }}><div style={{ width:18, height:18, borderRadius:"50%", border:"2px solid rgba(255,255,255,0.08)", borderTopColor:"rgba(255,255,255,0.40)", animation:"spin 0.8s linear infinite" }} /></div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:"center", padding:"80px 40px" }}>
            <div style={{ width:64, height:64, borderRadius:20, margin:"0 auto 20px", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="7" r="4" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"/><path d="M3 21c0-3.3 2.7-6 6-6h6c3.3 0 6 2.7 6 6" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round"/><circle cx="17" cy="7" r="3" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/></svg>
            </div>
            <p style={{ fontSize:15, color:"rgba(255,255,255,0.50)", fontWeight:500, marginBottom:8 }}>No org clones yet</p>
            <p style={{ fontSize:13, color:"rgba(255,255,255,0.25)", lineHeight:1.6, maxWidth:320, margin:"0 auto" }}>Your org admin hasn't shared any clones yet, or you're not part of an org.</p>
          </div>
        ) : (
          <>
            <p style={{ fontSize:12, color:"rgba(255,255,255,0.25)", marginBottom:20 }}>{filtered.length} clone{filtered.length !== 1 ? "s" : ""} available to your team</p>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))", gap:16 }}>
              {filtered.map(clone => {
                const color = orgCatColor(clone.category);
                const initial = clone.display_name[0]?.toUpperCase() ?? "?";
                return (
                  <div key={clone.clone_id} style={{ borderRadius:18, overflow:"hidden", background:"rgba(255,255,255,0.035)", border:"1px solid rgba(255,255,255,0.08)", transition:"border-color 200ms, box-shadow 200ms" }}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=orgHexToRgba(color,0.35);e.currentTarget.style.boxShadow=`0 12px 40px rgba(0,0,0,0.4), 0 0 30px ${orgHexToRgba(color,0.12)}`}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.08)";e.currentTarget.style.boxShadow="none"}}>
                    {/* Color strip */}
                    <div style={{ height:3, background:`linear-gradient(90deg, ${orgHexToRgba(color,0.9)}, ${orgHexToRgba(color,0.3)})` }} />
                    <div style={{ padding:"20px 20px 18px" }}>
                      {/* Header */}
                      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:14 }}>
                        <div style={{ width:48, height:48, borderRadius:14, flexShrink:0, background:clone.avatar_url?"transparent":orgHexToRgba(color,0.2), border:`1.5px solid ${orgHexToRgba(color,0.4)}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:500, color:"#fff", overflow:"hidden", boxShadow:`0 4px 16px ${orgHexToRgba(color,0.25)}` }}>
                          {clone.avatar_url ? <img src={clone.avatar_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : initial}
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                          {clone.is_verified && <span style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:10, fontWeight:500, padding:"3px 8px", borderRadius:999, background:"rgba(52,211,153,0.10)", border:"1px solid rgba(52,211,153,0.25)", color:"rgba(52,211,153,0.85)" }}>
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4l2 2 3-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>Verified</span>}
                          {clone.member_role === "admin" && <span style={{ fontSize:10, fontWeight:500, padding:"3px 8px", borderRadius:999, background:"rgba(167,139,250,0.10)", border:"1px solid rgba(167,139,250,0.25)", color:"rgba(167,139,250,0.80)" }}>Admin</span>}
                          {clone.category && <span style={{ fontSize:10, padding:"3px 8px", borderRadius:999, background:orgHexToRgba(color,0.10), border:`1px solid ${orgHexToRgba(color,0.22)}`, color:orgHexToRgba(color,0.80), textTransform:"capitalize" }}>{clone.category}</span>}
                        </div>
                      </div>
                      {/* Name */}
                      <p style={{ fontSize:14, fontWeight:500, color:"rgba(255,255,255,0.90)", margin:"0 0 2px" }}>{clone.display_name}</p>
                      <p style={{ fontSize:11, color:"rgba(255,255,255,0.35)", margin:"0 0 10px" }}>@{clone.handle}</p>
                      {/* Description */}
                      <p style={{ fontSize:12, color:"rgba(255,255,255,0.45)", lineHeight:1.6, margin:"0 0 14px", minHeight:32, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" } as React.CSSProperties}>{clone.description || "No description."}</p>
                      {/* Stats */}
                      <p style={{ fontSize:11, color:"rgba(255,255,255,0.30)", margin:"0 0 14px" }}>{clone.total_queries.toLocaleString()} queries</p>
                      {/* Chat CTA */}
                      <button onClick={() => onChatClone(clone.clone_id)}
                        style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, width:"100%", padding:"9px 0", borderRadius:12, fontSize:12, fontWeight:500, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.09)", color:"rgba(255,255,255,0.60)", cursor:"pointer", fontFamily:"inherit", transition:"all 200ms" }}
                        onMouseEnter={e=>{e.currentTarget.style.background=orgHexToRgba(color,0.18);e.currentTarget.style.borderColor=orgHexToRgba(color,0.40);e.currentTarget.style.color=orgHexToRgba(color,0.95)}}
                        onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.06)";e.currentTarget.style.borderColor="rgba(255,255,255,0.09)";e.currentTarget.style.color="rgba(255,255,255,0.60)"}}>
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        Chat
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── SynthesisPanel ─────────────────────────────────────────────────────────────

interface SynthClone { id: string; handle: string; name: string; avatar_url?: string; }
interface SynthTurn { id: string; cloneId: string; cloneName: string; color: string; text: string; posIdx: number; isConclusion: boolean; }

const SYNTH_PALETTE = ["#7C3AED","#2563EB","#0891B2","#059669","#D97706","#BE185D","#0E7490","#DC2626"];
function synthColor(idx: number): string { return SYNTH_PALETTE[idx % SYNTH_PALETTE.length]; }

const SYNTH_MAX_ROUNDS = 8;
const SYNTH_MIN_TURNS_CONCLUDE = 5;

function buildSynthPrompt(clone: SynthClone, allClones: SynthClone[], topic: string, turns: SynthTurn[]): string {
  const others = allClones.filter(c => c.id !== clone.id);
  const othersStr = others.length === 1 ? others[0].name : others.map(c => c.name).slice(0, -1).join(", ") + " and " + others[others.length - 1].name;
  const isOpening = turns.length === 0;
  const canConclude = turns.length >= SYNTH_MIN_TURNS_CONCLUDE;
  const history = turns.map(t => `${t.cloneName}: ${t.text.replace(/\[CONCLUDED:[^\]]*\]/gi, "").trim()}`).join("\n\n");

  if (isOpening) return `You are opening a multi-expert synthesis discussion.\nThe other participants are: ${othersStr}.\nTopic: "${topic}"\n\nState your position on this topic clearly and specifically.\nLead with your strongest point — the thing only you would say given your background and values.\nDo not summarise the topic or ask questions back. Just stake your view.\n2–4 sentences. Be direct.`;

  let prompt = `You are in a multi-expert synthesis discussion.\nParticipants: you (${clone.name}), ${othersStr}.\nTopic: "${topic}"\n\nDiscussion so far:\n${history}\n\nYour turn.\n\n`;
  const lastTurn = turns[turns.length - 1];
  if (lastTurn) prompt += `Respond directly to ${lastTurn.cloneName}'s last message.\nDon't restate what they said. Engage with the substance — challenge it, sharpen it, or add a dimension they missed.\nIf they made an error or overlooked something important, call it out precisely.\nIf you agree on something, say so briefly and push the question further.\n`;
  prompt += `\nSpeak in your own voice, applying your actual reasoning frameworks and values to this specific question.\n2–4 sentences. Dense thinking — not padding, not filler phrases.\nNo "That's a great point." No "Building on what was said." Just respond.\n`;
  if (canConclude) prompt += `\nIf the group has genuinely reached a conclusion — a real insight or resolution — end your message with:\n[CONCLUDED: one sentence capturing what this discussion established]\nOnly add CONCLUDED if it's actually warranted. Don't use it to end the discussion prematurely.`;
  return prompt;
}

const SYNTH_PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i, left: `${5 + (i * 17 + 7) % 90}%`, top: `${10 + (i * 23 + 3) % 80}%`,
  size: 1.5 + (i % 3) * 1, dur: 4 + (i % 5) * 1.4, delay: (i * 0.37) % 4,
  dx: ((i % 5) - 2) * 6, dy: -12 - (i % 4) * 7,
}));

function SynthesisPanel({ clones, onBack }: { clones: Clone[]; onBack: () => void }) {
  const allClones: SynthClone[] = clones.map(c => ({ id: c.clone_id, handle: c.handle, name: c.listing_title ?? c.display_name ?? c.handle, avatar_url: c.avatar_url }));

  const [phase, setPhase] = useState<"setup"|"running"|"done">("setup");
  const [selected, setSelected] = useState<SynthClone[]>(allClones.length >= 2 ? [allClones[0], allClones[1]] : allClones.slice(0, 1));
  const [topic, setTopic] = useState("");
  const [turns, setTurns] = useState<SynthTurn[]>([]);
  const [streaming, setStreaming] = useState<{ cloneId: string; cloneName: string; color: string; text: string; posIdx: number } | null>(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [conclusion, setConclusion] = useState("");
  const [sessionId] = useState(uuid);

  const stopRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const turnsRef = useRef<SynthTurn[]>([]);
  useEffect(() => { turnsRef.current = turns; }, [turns]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [turns, streaming]);

  function toggleClone(c: SynthClone) {
    setSelected(prev => {
      if (prev.find(x => x.id === c.id)) return prev.filter(x => x.id !== c.id);
      if (prev.length >= 5) return prev;
      return [...prev, c];
    });
  }

  async function streamOneTurn(clone: SynthClone, message: string, posIdx: number, color: string): Promise<string> {
    setActiveIdx(posIdx);
    setStreaming({ cloneId: clone.id, cloneName: clone.name, color, text: "", posIdx });

    const res = await api("/brain/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clone_id: clone.id, session_id: sessionId + "_" + clone.id, message, context_type: "chat", response_mode: "fast", owner_mode: true }),
    });

    if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", acc = "";

    outer: while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop() ?? "";
      for (const line of lines) {
        if (stopRef.current) { reader.cancel(); break outer; }
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;
        try {
          const evt = JSON.parse(raw);
          if (evt.event === "token") { acc += evt.text as string; setStreaming(s => s ? { ...s, text: acc } : s); }
          else if (evt.event === "done") { acc = (evt.corrected_response as string) ?? acc; setStreaming(s => s ? { ...s, text: acc } : s); }
        } catch { continue; }
      }
    }

    const match = acc.match(/\[CONCLUDED:\s*([^\]]+)\]/i);
    const isConc = !!match;
    const displayText = acc.replace(/\[CONCLUDED:[^\]]*\]/gi, "").trim();
    const concText = match ? match[1].trim() : "";

    setStreaming(null);
    const turn: SynthTurn = { id: uuid(), cloneId: clone.id, cloneName: clone.name, color, text: displayText, posIdx, isConclusion: isConc };
    setTurns(prev => [...prev, turn]);
    if (isConc) setConclusion(concText);
    return isConc ? `\0CONCLUDED\0${concText}` : displayText;
  }

  async function startSynthesis() {
    if (selected.length < 2 || !topic.trim()) return;
    stopRef.current = false;
    setPhase("running"); setTurns([]); setStreaming(null); setConclusion(""); setActiveIdx(-1);
    const colors = selected.map((_, i) => synthColor(i));
    let cloneIdx = 0, totalTurns = 0;
    try {
      while (!stopRef.current) {
        const clone = selected[cloneIdx];
        const color = colors[cloneIdx];
        const prompt = buildSynthPrompt(clone, selected, topic, turnsRef.current);
        const result = await streamOneTurn(clone, prompt, cloneIdx, color);
        totalTurns++;
        if (result.startsWith("\0CONCLUDED\0") || stopRef.current) break;
        if (Math.floor(totalTurns / selected.length) >= SYNTH_MAX_ROUNDS) break;
        cloneIdx = (cloneIdx + 1) % selected.length;
        await new Promise<void>(r => setTimeout(r, 500));
      }
    } catch (e) { console.error("[synthesis]", e); }
    setActiveIdx(-1); setPhase("done");
  }

  function reset() { stopRef.current = true; setPhase("setup"); setTurns([]); setStreaming(null); setConclusion(""); setActiveIdx(-1); }

  const canStart = selected.length >= 2 && !!topic.trim() && phase === "setup";
  const isRunning = phase === "running";
  const ambientColor = activeIdx >= 0 && selected[activeIdx] ? synthColor(activeIdx) : "#ffffff";

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden", fontFamily:"var(--font-sans, 'Plus Jakarta Sans', system-ui, sans-serif)", background:"#080808", color:"rgba(255,255,255,0.82)", position:"relative" }}>
      <style>{`
        @keyframes synth-pulse-ring { 0%{transform:scale(1);opacity:0.7;} 100%{transform:scale(1.9);opacity:0;} }
        @keyframes synth-msg-in { from{opacity:0;transform:perspective(600px) rotateX(-10deg) translateY(14px);} to{opacity:1;transform:perspective(600px) rotateX(0deg) translateY(0);} }
        @keyframes synth-orbit { 0%{transform:rotate(0deg) translateX(30px) rotate(0deg);} 100%{transform:rotate(360deg) translateX(30px) rotate(-360deg);} }
        @keyframes synth-particle-drift { 0%,100%{opacity:0.25;transform:translate(0,0);} 50%{opacity:0.55;transform:var(--synth-drift);} }
        @keyframes synth-spin { to{transform:rotate(360deg);} }
        @keyframes synth-blink { 0%,100%{opacity:1;} 50%{opacity:0.15;} }
        @keyframes synth-conclusion-in { from{opacity:0;transform:scale(0.94) translateY(8px);} to{opacity:1;transform:scale(1) translateY(0);} }
        .synth-scroll { scrollbar-width:thin; scrollbar-color:rgba(255,255,255,0.07) transparent; }
        .synth-scroll::-webkit-scrollbar { width:3px; }
        .synth-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.07); border-radius:2px; }
      `}</style>

      {/* Ambient background */}
      <div style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:0, background:`radial-gradient(ellipse 70% 55% at 50% 0%, ${ambientColor}18 0%, transparent 65%)`, transition:"background 700ms ease" }} />

      {/* Particles */}
      <div style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:0, overflow:"hidden" }}>
        {SYNTH_PARTICLES.map(p => (
          <div key={p.id} style={{ position:"absolute", left:p.left, top:p.top, width:p.size, height:p.size, borderRadius:"50%", background:isRunning ? ambientColor : "rgba(255,255,255,0.4)", animation:`synth-particle-drift ${p.dur}s ${p.delay}s ease-in-out infinite`, "--synth-drift":`translateX(${p.dx}px) translateY(${p.dy}px)`, transition:"background 700ms" } as React.CSSProperties} />
        ))}
      </div>

      {/* Content */}
      <div style={{ position:"relative", zIndex:1, display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>

        {/* Header */}
        <div style={{ height:46, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 18px", borderBottom:"1px solid rgba(255,255,255,0.07)", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(255,255,255,0.35)", padding:0, display:"flex", alignItems:"center" }}
              onMouseEnter={e=>{e.currentTarget.style.color="rgba(255,255,255,0.70)"}} onMouseLeave={e=>{e.currentTarget.style.color="rgba(255,255,255,0.35)"}}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <span style={{ fontSize:13, fontWeight:500, color:"rgba(255,255,255,0.85)" }}>Synthesis</span>
            <span style={{ fontSize:10, color:"rgba(255,255,255,0.22)", letterSpacing:"0.10em", textTransform:"uppercase" }}>multi-clone discussion</span>
            {isRunning && <span style={{ fontSize:9, color:"rgba(52,211,153,0.65)", background:"rgba(52,211,153,0.08)", border:"1px solid rgba(52,211,153,0.18)", borderRadius:4, padding:"2px 7px", letterSpacing:"0.06em", textTransform:"uppercase", animation:"synth-blink 1.6s ease-in-out infinite" }}>Live</span>}
          </div>
          {phase !== "setup" && (
            <button onClick={reset} style={{ fontSize:11, color:"rgba(255,255,255,0.30)", background:"none", border:"1px solid rgba(255,255,255,0.09)", borderRadius:7, padding:"3px 10px", cursor:"pointer", fontFamily:"inherit", transition:"all 120ms" }}
              onMouseEnter={e=>{e.currentTarget.style.color="rgba(255,255,255,0.60)";e.currentTarget.style.borderColor="rgba(255,255,255,0.20)"}}
              onMouseLeave={e=>{e.currentTarget.style.color="rgba(255,255,255,0.30)";e.currentTarget.style.borderColor="rgba(255,255,255,0.09)"}}>
              {isRunning ? "Stop" : "New"}
            </button>
          )}
        </div>

        {/* Setup */}
        {phase === "setup" && (
          <div style={{ flex:1, overflowY:"auto", padding:"20px 18px" }} className="synth-scroll">
            <p style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.12em", color:"rgba(255,255,255,0.22)", marginBottom:16 }}>Select clones</p>
            {allClones.length === 0 && <p style={{ fontSize:12, color:"rgba(255,255,255,0.30)", textAlign:"center", marginBottom:20 }}>Create at least two clones to use synthesis.</p>}
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:20 }}>
              {allClones.map(c => {
                const isSel = !!selected.find(x => x.id === c.id);
                const selIdx = selected.findIndex(x => x.id === c.id);
                const col = isSel ? synthColor(selIdx) : "rgba(255,255,255,0.35)";
                return (
                  <button key={c.id} onClick={() => toggleClone(c)} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 12px 7px 8px", borderRadius:10, cursor:"pointer", fontFamily:"inherit", border:`1.5px solid ${isSel ? col+"55" : "rgba(255,255,255,0.09)"}`, background:isSel ? col+"18" : "rgba(255,255,255,0.03)", color:isSel ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.50)", transition:"all 150ms" }}
                    onMouseEnter={e=>{if(!isSel){e.currentTarget.style.background="rgba(255,255,255,0.06)";e.currentTarget.style.borderColor="rgba(255,255,255,0.16)"}}}
                    onMouseLeave={e=>{if(!isSel){e.currentTarget.style.background="rgba(255,255,255,0.03)";e.currentTarget.style.borderColor="rgba(255,255,255,0.09)"}}}>
                    <div style={{ width:24, height:24, borderRadius:6, flexShrink:0, background:isSel ? col : "rgba(255,255,255,0.10)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:600, color:"#fff", overflow:"hidden" }}>
                      {c.avatar_url ? <img src={c.avatar_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : c.name[0]?.toUpperCase()}
                    </div>
                    <span style={{ fontSize:12, fontWeight:isSel ? 500 : 400 }}>{c.name}</span>
                    {isSel && <span style={{ fontSize:9, color:col, fontWeight:600, marginLeft:2 }}>#{selIdx + 1}</span>}
                  </button>
                );
              })}
            </div>
            {selected.length > 0 && (
              <p style={{ fontSize:11, color:"rgba(255,255,255,0.28)", marginBottom:20, lineHeight:1.6 }}>
                {selected.length < 2 ? "Select at least one more clone to start." : `${selected.map(c => c.name).join(" · ")} — in turn, responding to each other.`}
              </p>
            )}
            <p style={{ fontSize:11, textTransform:"uppercase", letterSpacing:"0.12em", color:"rgba(255,255,255,0.22)", marginBottom:10 }}>Topic or question</p>
            <textarea value={topic} onChange={e => setTopic(e.target.value)} placeholder='e.g. "What is the single most important thing a first-time founder gets wrong?"' rows={3}
              style={{ width:"100%", boxSizing:"border-box", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:12, padding:"11px 13px", fontSize:13, color:"rgba(255,255,255,0.85)", fontFamily:"inherit", outline:"none", resize:"none", lineHeight:1.6, marginBottom:14, transition:"border-color 150ms" }}
              onFocus={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)"} onBlur={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canStart) startSynthesis(); }} />
            <button onClick={startSynthesis} disabled={!canStart} style={{ width:"100%", padding:"11px", borderRadius:11, border:`1px solid ${canStart ? "rgba(167,139,250,0.30)" : "rgba(255,255,255,0.07)"}`, background:canStart ? "rgba(167,139,250,0.12)" : "rgba(255,255,255,0.03)", color:canStart ? "rgba(167,139,250,0.90)" : "rgba(255,255,255,0.20)", fontSize:13, fontWeight:500, cursor:canStart ? "pointer" : "not-allowed", fontFamily:"inherit", transition:"all 150ms" }}
              onMouseEnter={e=>{if(canStart){e.currentTarget.style.background="rgba(167,139,250,0.18)";e.currentTarget.style.borderColor="rgba(167,139,250,0.45)"}}}
              onMouseLeave={e=>{if(canStart){e.currentTarget.style.background="rgba(167,139,250,0.12)";e.currentTarget.style.borderColor="rgba(167,139,250,0.30)"}}}>
              Start synthesis →
            </button>
            <p style={{ fontSize:11, color:"rgba(255,255,255,0.20)", textAlign:"center", marginTop:10 }}>Clones discuss until they reach a conclusion. You see everything.</p>
          </div>
        )}

        {/* Running / done */}
        {phase !== "setup" && (
          <>
            {/* Clone stage */}
            <div style={{ flexShrink:0, padding:"16px 18px 10px", borderBottom:"1px solid rgba(255,255,255,0.06)", perspective:"900px", perspectiveOrigin:"50% 200%" }}>
              <div style={{ display:"flex", justifyContent:"center", gap:12, alignItems:"flex-end" }}>
                {selected.map((c, i) => {
                  const isActive = i === activeIdx;
                  const col = synthColor(i);
                  return (
                    <div key={c.id} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, transform:isActive ? "perspective(900px) rotateX(0deg) translateZ(22px) translateY(-6px) scale(1.05)" : "perspective(900px) rotateX(5deg) translateZ(-12px) translateY(4px) scale(0.88)", opacity:isActive ? 1 : activeIdx >= 0 ? 0.40 : 0.75, transition:"transform 400ms cubic-bezier(.4,0,.2,1), opacity 400ms", position:"relative" }}>
                      {isActive && <>
                        <div style={{ position:"absolute", top:-4, left:-4, right:-4, bottom:-4, borderRadius:"50%", border:`2px solid ${col}`, animation:"synth-pulse-ring 1.8s ease-out infinite", pointerEvents:"none" }} />
                        <div style={{ position:"absolute", top:-4, left:-4, right:-4, bottom:-4, borderRadius:"50%", border:`2px solid ${col}`, animation:"synth-pulse-ring 1.8s 0.6s ease-out infinite", pointerEvents:"none" }} />
                        <div style={{ position:"absolute", top:"50%", left:"50%", width:0, height:0, zIndex:2, pointerEvents:"none" }}>
                          <div style={{ position:"absolute", width:5, height:5, borderRadius:"50%", background:col, marginLeft:-2.5, marginTop:-2.5, boxShadow:`0 0 6px ${col}`, animation:"synth-orbit 2.2s linear infinite" }} />
                        </div>
                      </>}
                      <div style={{ width:44, height:44, borderRadius:"50%", overflow:"hidden", background:isActive ? col : col+"60", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:600, color:"#fff", boxShadow:isActive ? `0 0 0 2px ${col}60, 0 6px 28px ${col}40, 0 0 0 6px ${col}15` : `0 0 0 1.5px ${col}30`, transition:"box-shadow 400ms", position:"relative", zIndex:1 }}>
                        {c.avatar_url ? <img src={c.avatar_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none"}} /> : c.name[0]?.toUpperCase()}
                      </div>
                      <span style={{ fontSize:10, fontWeight:isActive ? 500 : 400, color:isActive ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.30)", whiteSpace:"nowrap", maxWidth:72, overflow:"hidden", textOverflow:"ellipsis", transition:"color 400ms" }}>{c.name.split(" ")[0]}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Messages feed */}
            <div ref={scrollRef} className="synth-scroll" style={{ flex:1, overflowY:"auto", padding:"12px 18px", display:"flex", flexDirection:"column", gap:10 }}>
              {turns.map(t => (
                <div key={t.id} style={{ display:"flex", flexDirection:t.posIdx % 2 !== 0 ? "row-reverse" : "row", gap:9, animation:"synth-msg-in 260ms cubic-bezier(.4,0,.2,1) both" }}>
                  <div style={{ width:26, height:26, borderRadius:"50%", flexShrink:0, background:t.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:600, color:"#fff", marginTop:2, boxShadow:`0 0 0 2px ${t.color}30` }}>{t.cloneName[0]?.toUpperCase()}</div>
                  <div style={{ maxWidth:"78%", display:"flex", flexDirection:"column", gap:3, alignItems:t.posIdx % 2 !== 0 ? "flex-end" : "flex-start" }}>
                    <span style={{ fontSize:9, color:"rgba(255,255,255,0.28)", letterSpacing:"0.04em" }}>{t.cloneName}</span>
                    <div style={{ background:t.posIdx % 2 !== 0 ? `${t.color}16` : "rgba(255,255,255,0.05)", border:`1px solid ${t.posIdx % 2 !== 0 ? t.color+"28" : "rgba(255,255,255,0.09)"}`, borderRadius:t.posIdx % 2 !== 0 ? "12px 3px 12px 12px" : "3px 12px 12px 12px", padding:"9px 12px", fontSize:13, color:"rgba(255,255,255,0.85)", lineHeight:1.58 }}>{t.text}</div>
                  </div>
                </div>
              ))}

              {streaming && (
                <div style={{ display:"flex", flexDirection:streaming.posIdx % 2 !== 0 ? "row-reverse" : "row", gap:9 }}>
                  <div style={{ width:26, height:26, borderRadius:"50%", flexShrink:0, background:streaming.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:600, color:"#fff", marginTop:2, boxShadow:`0 0 0 2px ${streaming.color}30` }}>{streaming.cloneName[0]?.toUpperCase()}</div>
                  <div style={{ maxWidth:"78%", display:"flex", flexDirection:"column", gap:3, alignItems:streaming.posIdx % 2 !== 0 ? "flex-end" : "flex-start" }}>
                    <span style={{ fontSize:9, color:"rgba(255,255,255,0.28)", letterSpacing:"0.04em" }}>{streaming.cloneName} <span style={{ animation:"synth-blink 0.9s ease-in-out infinite" }}>●</span></span>
                    <div style={{ background:streaming.posIdx % 2 !== 0 ? `${streaming.color}16` : "rgba(255,255,255,0.05)", border:`1px solid ${streaming.posIdx % 2 !== 0 ? streaming.color+"28" : "rgba(255,255,255,0.09)"}`, borderRadius:streaming.posIdx % 2 !== 0 ? "12px 3px 12px 12px" : "3px 12px 12px 12px", padding:"9px 12px", fontSize:13, color:"rgba(255,255,255,0.85)", lineHeight:1.58, minWidth:48 }}>
                      {streaming.text ? <>{streaming.text}<span style={{ display:"inline-block", width:2, height:13, background:"rgba(255,255,255,0.50)", marginLeft:2, verticalAlign:"middle", animation:"synth-blink 0.65s ease-in-out infinite" }} /></> : <span style={{ display:"flex", gap:3 }}>{[0,1,2].map(i => <span key={i} style={{ width:4, height:4, borderRadius:"50%", background:"rgba(255,255,255,0.35)", display:"inline-block", animation:`synth-blink 1.1s ease-in-out ${i*0.18}s infinite` }} />)}</span>}
                    </div>
                  </div>
                </div>
              )}

              {phase === "done" && !conclusion && turns.length > 0 && !streaming && (
                <div style={{ textAlign:"center", padding:"16px 0 8px", fontSize:11, color:"rgba(255,255,255,0.22)", letterSpacing:"0.06em" }}>— discussion complete —</div>
              )}

              {phase === "done" && conclusion && (
                <div style={{ padding:"16px 18px", borderRadius:14, marginTop:8, background:"rgba(52,211,153,0.06)", border:"1px solid rgba(52,211,153,0.20)", animation:"synth-conclusion-in 350ms cubic-bezier(.4,0,.2,1) both" }}>
                  <p style={{ margin:"0 0 6px", fontSize:9, textTransform:"uppercase", letterSpacing:"0.12em", color:"rgba(52,211,153,0.55)" }}>Conclusion reached</p>
                  <p style={{ margin:0, fontSize:13, color:"rgba(255,255,255,0.82)", lineHeight:1.6 }}>{conclusion}</p>
                </div>
              )}
            </div>

            {phase === "done" && (
              <div style={{ padding:"12px 18px 14px", borderTop:"1px solid rgba(255,255,255,0.07)", flexShrink:0, display:"flex", gap:8 }}>
                <button onClick={reset} style={{ flex:1, padding:"9px", borderRadius:10, border:"1px solid rgba(255,255,255,0.12)", background:"rgba(255,255,255,0.06)", color:"rgba(255,255,255,0.72)", fontSize:13, fontWeight:500, cursor:"pointer", fontFamily:"inherit", transition:"all 120ms" }}
                  onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.10)"}} onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.06)"}}>
                  New synthesis →
                </button>
              </div>
            )}
          </>
        )}
      </div>
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

  // Credits state
  const [credits, setCredits] = useState<{ plan_credits: number; bought_credits: number; weekly_allowance: number; total: number } | null>(null);
  const [packs, setPacks] = useState<{ id: string; credits: number; label: string; price_cents: number }[]>([]);

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

  // Load credits
  useEffect(() => {
    api("/credits/balance").then(r => r.ok ? r.json() : null).then(d => { if (d) setCredits(d); }).catch(() => {});
    api("/credits/packs").then(r => r.ok ? r.json() : null).then(d => { if (d?.packs) setPacks(d.packs); }).catch(() => {});
  }, []);

  async function buyPack(packId: string) {
    const res = await api("/credits/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pack_id: packId }) });
    if (res.ok) { const d = await res.json(); if (d.checkout_url) window.open(d.checkout_url, "_blank"); }
  }

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

          {/* ── Credits ───────────────────────────────────────── */}
          <p style={{ ...eyebrowStyle, marginBottom:12 }}>Credits</p>

          {credits && (
            <div style={{ ...cardStyle, marginBottom:20 }}>
              {/* Balance */}
              <div style={{ display:"flex",alignItems:"baseline",gap:8,marginBottom:4 }}>
                <span style={{ fontSize:36,fontWeight:300,color:"rgba(255,255,255,0.85)",lineHeight:1 }}>{credits.total.toLocaleString()}</span>
                <span style={{ fontSize:12,color:"rgba(255,255,255,0.30)" }}>credits remaining</span>
              </div>

              {/* Plan vs top-up breakdown */}
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:8 }}>
                <div style={{ padding:"12px 14px",borderRadius:12,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)" }}>
                  <p style={{ fontSize:10,color:"rgba(255,255,255,0.25)",textTransform:"uppercase",letterSpacing:"0.08em",margin:"0 0 6px" }}>Weekly plan</p>
                  <p style={{ fontSize:16,fontWeight:400,color:"rgba(255,255,255,0.75)",margin:"0 0 6px" }}>{credits.plan_credits} <span style={{ fontSize:11,color:"rgba(255,255,255,0.25)" }}>/ {credits.weekly_allowance}</span></p>
                  <div style={{ height:3,borderRadius:2,background:"rgba(255,255,255,0.06)",overflow:"hidden" }}>
                    <div style={{ height:"100%",borderRadius:2,background:"rgba(255,255,255,0.35)",width:`${credits.weekly_allowance > 0 ? Math.round((credits.plan_credits / credits.weekly_allowance) * 100) : 0}%`,transition:"width 400ms" }} />
                  </div>
                </div>
                <div style={{ padding:"12px 14px",borderRadius:12,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)" }}>
                  <p style={{ fontSize:10,color:"rgba(255,255,255,0.25)",textTransform:"uppercase",letterSpacing:"0.08em",margin:"0 0 6px" }}>Top-up</p>
                  <p style={{ fontSize:16,fontWeight:400,color:"rgba(255,255,255,0.75)",margin:"0 0 6px" }}>{credits.bought_credits}</p>
                  <p style={{ fontSize:10,color:"rgba(255,255,255,0.18)",margin:0 }}>no expiry</p>
                </div>
              </div>

              <p style={{ fontSize:10,color:"rgba(255,255,255,0.18)",margin:"10px 0 0",lineHeight:1.5 }}>1 credit ≈ 1 query. Plan credits reset weekly. Top-up credits never expire.</p>
            </div>
          )}

          {/* Top-up packs */}
          {packs.length > 0 && (
            <div style={{ ...cardStyle, marginBottom:32 }}>
              <p style={eyebrowStyle}>Top up</p>
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                {packs.map(pack => (
                  <div key={pack.id} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderRadius:10,background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)" }}>
                    <div>
                      <span style={{ fontSize:14,fontWeight:500,color:"rgba(255,255,255,0.75)" }}>{pack.credits.toLocaleString()} credits</span>
                      <span style={{ fontSize:11,color:"rgba(255,255,255,0.25)",marginLeft:8 }}>{pack.label}</span>
                    </div>
                    <button onClick={() => buyPack(pack.id)} style={{ padding:"5px 14px",borderRadius:8,fontSize:11,fontWeight:500,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.10)",color:"rgba(255,255,255,0.55)",cursor:"pointer",fontFamily:"inherit",transition:"all 150ms" }}
                      onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.10)";e.currentTarget.style.color="rgba(255,255,255,0.80)"}}
                      onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.06)";e.currentTarget.style.color="rgba(255,255,255,0.55)"}}>
                      ${(pack.price_cents / 100).toFixed(0)}
                    </button>
                  </div>
                ))}
              </div>
            </div>
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

function Sidebar({ open, clones, orgClones, active, userName, userInitial, onSelect, onToggle, onOpenSettings, onOpenSynthesis, onOpenMyBrain, onOpenOrg }: {
  open: boolean;
  clones: Clone[];
  orgClones: OrgClone[];
  active: Clone | null;
  userName: string;
  userInitial: string;
  onSelect: (c: Clone) => void;
  onToggle: () => void;
  onOpenSettings: () => void;
  onOpenSynthesis: () => void;
  onOpenMyBrain: () => void;
  onOpenOrg: () => void;
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
            onClick={onOpenMyBrain}
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
            onClick={onOpenOrg}
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
            onClick={onOpenSynthesis}
            title="Synthesis"
            style={{ width: 30, height: 30, borderRadius: 8, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)", color:"rgba(255,255,255,0.40)", cursor:"pointer", transition:"all 180ms" }}
            onMouseEnter={e=>{e.currentTarget.style.color="rgba(255,255,255,0.75)";e.currentTarget.style.background="rgba(255,255,255,0.09)"}}
            onMouseLeave={e=>{e.currentTarget.style.color="rgba(255,255,255,0.40)";e.currentTarget.style.background="rgba(255,255,255,0.05)"}}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="4" cy="8" r="2" fill="currentColor" opacity="0.7"/><circle cx="12" cy="5" r="1.6" fill="currentColor" opacity="0.5"/><circle cx="12" cy="11" r="1.6" fill="currentColor" opacity="0.5"/><path d="M6 7.5L10.3 5.5M6 8.5L10.3 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.45"/></svg>
          </button>
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

// ── Quick Capture Window ─────────────────────────────────────────────────────

export function CaptureWindow() {
  const [text, setText] = useState("");
  const [cloneId, setCloneId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const doppel = (window as any).doppelDesktop;

  useEffect(() => {
    doppel?.captureGetClone?.().then((c: any) => {
      if (c) setCloneId(c.clone_id);
    });
    // Auto-focus the input
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  const submit = async () => {
    const t = text.trim();
    if (!t || !cloneId || status === "sending") return;
    setStatus("sending");
    try {
      const res = await doppel.captureSubmit(cloneId, t);
      if (res?.ok) {
        setStatus("done");
        setTimeout(() => doppel.captureClose(), 600);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  const close = () => doppel?.captureClose();

  return (
    <div
      style={{
        width: "100%", height: "100%",
        background: "rgba(10,10,10,0.92)", backdropFilter: "blur(24px)",
        borderRadius: 16, border: "1px solid rgba(255,255,255,0.10)",
        display: "flex", flexDirection: "column",
        fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
        overflow: "hidden", WebkitAppRegion: "drag",
      } as React.CSSProperties}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px 6px", WebkitAppRegion: "drag",
      } as React.CSSProperties}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)" }}>
          Quick capture
        </span>
        <button
          onClick={close}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "rgba(255,255,255,0.25)", fontSize: 14, padding: "0 2px",
            lineHeight: 1, fontFamily: "inherit", WebkitAppRegion: "no-drag",
          } as React.CSSProperties}
        >
          ×
        </button>
      </div>

      {/* Input */}
      <div style={{ flex: 1, padding: "0 14px 10px", display: "flex", flexDirection: "column", gap: 8, WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
            if (e.key === "Escape") close();
          }}
          placeholder="Type a thought, fact, or context... (Enter to save)"
          disabled={status === "sending" || status === "done"}
          style={{
            flex: 1, background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10,
            padding: "10px 12px", fontSize: 13, color: "rgba(255,255,255,0.75)",
            fontFamily: "inherit", resize: "none", outline: "none", lineHeight: 1.5,
          }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.18)" }}>
            {status === "done" ? "✓ Saved" : status === "error" ? "Failed — try again" : status === "sending" ? "Saving..." : "Esc to close"}
          </span>
          <button
            onClick={submit}
            disabled={!text.trim() || !cloneId || status === "sending" || status === "done"}
            style={{
              fontSize: 11, fontWeight: 500, padding: "5px 14px", borderRadius: 8,
              background: text.trim() && status === "idle" ? "rgba(52,211,153,0.10)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${text.trim() && status === "idle" ? "rgba(52,211,153,0.22)" : "rgba(255,255,255,0.07)"}`,
              color: text.trim() && status === "idle" ? "rgba(52,211,153,0.80)" : "rgba(255,255,255,0.20)",
              cursor: text.trim() && status === "idle" ? "pointer" : "default",
              fontFamily: "inherit",
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Desktop App ─────────────────────────────────────────────────────────

export default function Desktop() {
  const [clones,       setClones]       = useState<Clone[]>([]);
  const [orgClones,    setOrgClones]    = useState<OrgClone[]>([]);
  const [active,       setActive]       = useState<Clone | null>(null);
  const [sidebarOpen,  setSidebarOpen]  = useState(true);
  const [showSettings,  setShowSettings]  = useState(false);
  const [showSynthesis, setShowSynthesis] = useState(false);
  const [showMyBrain,   setShowMyBrain]   = useState(false);
  const [showOrg,       setShowOrg]       = useState(false);
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
        onSelect={c=>{if(c.clone_id!==active?.clone_id){setActive(c);setShowSettings(false);setShowSynthesis(false);setShowMyBrain(false);setShowOrg(false)}}}
        onToggle={()=>setSidebarOpen(o=>!o)}
        onOpenSettings={()=>{setShowSettings(true);setShowSynthesis(false);setShowMyBrain(false);setShowOrg(false)}}
        onOpenSynthesis={()=>{setShowSynthesis(true);setShowSettings(false);setShowMyBrain(false);setShowOrg(false)}}
        onOpenMyBrain={()=>{setShowMyBrain(true);setShowSettings(false);setShowSynthesis(false);setShowOrg(false)}}
        onOpenOrg={()=>{setShowOrg(true);setShowSettings(false);setShowSynthesis(false);setShowMyBrain(false)}}
      />
      <div style={{ flex:1,overflow:"hidden",display:"flex",flexDirection:"column",minWidth:0 }}>
        {showMyBrain
          ? <MyBrainPanel onBack={()=>setShowMyBrain(false)} />
          : showOrg
          ? <OrgPanel onBack={()=>setShowOrg(false)} onChatClone={(id)=>{const c=[...clones,...orgClones.map(o=>o as Clone)].find(x=>x.clone_id===id);if(c){setActive(c);setShowOrg(false)}}} />
          : showSynthesis
          ? <SynthesisPanel clones={clones} onBack={()=>setShowSynthesis(false)} />
          : showSettings && active
          ? <SettingsPanel key={`settings-${active.clone_id}`} clone={active} onBack={()=>setShowSettings(false)} />
          : active
          ? <CloneChat key={active.clone_id} clone={active} userId={userId} />
          : <div style={{ flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(255,255,255,0.22)",fontSize:13 }}>Select a clone to start.</div>}
      </div>
    </div>
  );
}

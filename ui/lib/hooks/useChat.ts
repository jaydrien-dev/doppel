"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { ChatMessage, ContextType, MemorySource, WorkflowDraft } from "../types";

// Words that mean "yes, do it" when the previous clone message contained a workflow draft
const CONFIRMATION_PHRASES = [
  "yes", "yep", "yeah", "yup", "sure", "ok", "okay", "do it", "activate",
  "go ahead", "confirm", "proceed", "let's do it", "let's go", "sounds good",
  "perfect", "great", "go", "run it", "start it", "create it", "make it",
  "activate it", "set it up", "do that", "do this", "yes please", "please do",
  "go for it", "absolutely", "definitely", "of course", "please", "yes do it",
];

function isPendingConfirmation(content: string, lastCloneMsg?: ChatMessage): boolean {
  if (!lastCloneMsg?.workflowDraft) return false;
  const lower = content.trim().toLowerCase().replace(/[!.,?]/g, "");
  return CONFIRMATION_PHRASES.some(p => lower === p || lower.startsWith(p + " ") || lower.endsWith(" " + p));
}

interface UseChatOptions {
  cloneId: string;
  contextType?: ContextType;
  sessionId?: string; // if provided, continue this session and load its history
  ownerMode?: boolean; // true = skip credits for owner (training); false = charge owner too (consumer test)
}

// One storage slot per clone — no session ID in key, eliminates all session-mismatch bugs.
// Session IDs are still used for the API (conversation continuity) but not for storage.
function storageKey(cloneId: string) {
  return `doppel_chat:${cloneId}`;
}

export function useChat({ cloneId, contextType = "chat", sessionId: initialSessionId, ownerMode = true }: UseChatOptions) {
  const resolvedSessionId = useRef(initialSessionId ?? uuidv4());

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  // historyLoading = true when we need to do a DB fetch (on mount with a session)
  const [historyLoading, setHistoryLoading] = useState(!!initialSessionId);
  const [error, setError] = useState<string | null>(null);

  // Load from localStorage on mount — runs only on client (useEffect never runs on server)
  useEffect(() => {
    if (!cloneId) return;
    try {
      const stored = localStorage.getItem(storageKey(cloneId));
      console.log("[useChat] init cloneId=%s stored=%s", cloneId, stored ? `${JSON.parse(stored).length} msgs` : "null");
      if (stored) {
        const parsed = JSON.parse(stored) as ChatMessage[];
        const valid = parsed
          .filter((m) => !m.isStreaming)
          .map((m) => ({ ...m, timestamp: new Date(m.timestamp as unknown as string), isHistory: true }));
        if (valid.length > 0) setMessages(valid);
      }
    } catch { /* ignore */ }
  }, [cloneId]); // re-runs if cloneId changes (e.g. switching clones on home page)

  // Persist messages to localStorage whenever they change (excluding streaming placeholder)
  useEffect(() => {
    if (!cloneId) return;
    const toStore = messages.filter((m) => !m.isStreaming);
    if (toStore.length === 0) return;
    try {
      localStorage.setItem(storageKey(cloneId), JSON.stringify(toStore));
      console.log("[useChat] saved %d msgs key=%s", toStore.length, storageKey(cloneId));
    } catch { /* storage full — non-fatal */ }
  }, [messages, cloneId]);

  // Load DB history on mount — DB is authoritative; merges with live (non-history) messages
  useEffect(() => {
    if (!initialSessionId) {
      setHistoryLoading(false);
      return;
    }
    setHistoryLoading(true);
    fetch(`/api/brain/sessions/${initialSessionId}/messages`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.messages?.length) {
          const dbMessages: ChatMessage[] = data.messages.map((m: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
            id: uuidv4(),
            role: m.role as "user" | "clone",
            content: m.content ?? "",
            timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
            path_taken: m.path_taken,
            confidence: m.confidence ?? undefined,
            isHistory: true,
          }));
          // DB wins — replace history messages, keep any live (non-history) messages appended after
          setMessages((prev) => {
            const live = prev.filter((m) => !m.isHistory);
            return [...dbMessages, ...live];
          });
        }
      })
      .catch(() => {/* non-fatal — localStorage still covers it */})
      .finally(() => setHistoryLoading(false));
  }, [initialSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = useCallback(
    async (content: string, responseMode: "fast" | "pro" | "extended" | "agent" = "fast", metadata?: Record<string, unknown>) => {
      if (!content.trim() || isLoading) return;

      // If user is confirming a pending workflow, auto-deploy it
      const lastCloneMsg = [...messages].reverse().find(m => m.role === "clone");
      if (ownerMode && isPendingConfirmation(content, lastCloneMsg)) {
        const draft = lastCloneMsg!.workflowDraft!;
        const userMsg: ChatMessage = { id: uuidv4(), role: "user", content: content.trim(), timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setIsLoading(true);
        try {
          const res = await fetch("/api/skills/deploy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clone_id: cloneId, workflow_draft: draft }),
          });
          const data = await res.json().catch(() => ({}));
          const confirmMsg: ChatMessage = {
            id: uuidv4(), role: "clone", timestamp: new Date(),
            content: res.ok
              ? `Done. **${draft.name}** is now running in the background. Check the Activity tab to track it.`
              : `Couldn't activate the workflow: ${data.detail ?? "unknown error"}`,
            isStreaming: false,
          };
          setMessages(prev => [...prev, confirmMsg]);
        } catch {
          setMessages(prev => [...prev, { id: uuidv4(), role: "clone" as const, content: "Network error — couldn't activate workflow.", timestamp: new Date(), isStreaming: false }]);
        } finally {
          setIsLoading(false);
        }
        return;
      }

      const userMsg: ChatMessage = {
        id: uuidv4(),
        role: "user",
        content: content.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      setIsThinking(false);
      setError(null);

      // Placeholder clone message shown while streaming
      const cloneMsgId = uuidv4();
      const placeholderMsg: ChatMessage = {
        id: cloneMsgId,
        role: "clone",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
      };
      setMessages((prev) => [...prev, placeholderMsg]);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stream: true,
            clone_id: cloneId,
            session_id: resolvedSessionId.current,
            message: content.trim(),
            context_type: contextType,
            response_mode: responseMode === "agent" ? "fast" : responseMode,
            owner_mode: ownerMode,
            agent_mode: responseMode === "agent",
            ...(metadata ? { metadata } : {}),
          }),
        });

        if (!res.ok) {
          let detail = `Request failed (${res.status})`;
          try {
            const errBody = await res.clone().json();
            detail = errBody.detail ?? errBody.error ?? detail;
          } catch { /* body wasn't JSON */ }
          throw new Error(detail);
        }
        if (!res.body) throw new Error("No response body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;

            let evt: Record<string, unknown>;
            try {
              evt = JSON.parse(raw);
            } catch {
              continue;
            }

            if (evt.event === "thinking") {
              setIsThinking(true);
            } else if (evt.event === "token") {
              setIsThinking(false);
              accText += evt.text as string;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === cloneMsgId ? { ...m, content: accText } : m
                )
              );
            } else if (evt.event === "workflow_draft") {
              const draft = evt.draft as WorkflowDraft | undefined;
              if (draft?.name) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === cloneMsgId ? { ...m, workflowDraft: draft } : m
                  )
                );
              }
            } else if (evt.event === "done") {
              setIsThinking(false);
              const finalText =
                (evt.corrected_response as string | null) ?? accText;
              // Also pick up workflow_draft from done event as a fallback
              const draft = evt.workflow_draft as WorkflowDraft | undefined;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === cloneMsgId
                    ? {
                        ...m,
                        content: finalText,
                        isStreaming: false,
                        path_taken: evt.path_taken as "fast" | "slow",
                        confidence: evt.confidence as number,
                        needs_escalation: evt.needs_escalation as boolean,
                        sources: evt.sources as MemorySource[],
                        trace_id: evt.trace_id as string,
                        ...(draft?.name ? { workflowDraft: draft } : {}),
                      }
                    : m
                )
              );
            } else if (evt.event === "error") {
              throw new Error(evt.message as string);
            }
          }
        }
      } catch (err) {
        setIsThinking(false);
        const msg = err instanceof Error ? err.message : "Something went wrong";
        setError(msg);
        // Remove the empty placeholder on error
        setMessages((prev) => prev.filter((m) => m.id !== cloneMsgId));
      } finally {
        setIsLoading(false);
        setIsThinking(false);
      }
    },
    [cloneId, contextType, ownerMode, isLoading, messages] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const clearMessages = useCallback(() => {
    try { localStorage.removeItem(storageKey(cloneId)); } catch { /* non-fatal */ }
    setMessages([]);
    resolvedSessionId.current = uuidv4();
  }, [cloneId]);

  return { messages, isLoading, isThinking, historyLoading, error, sendMessage, clearMessages, sessionId: resolvedSessionId.current };
}

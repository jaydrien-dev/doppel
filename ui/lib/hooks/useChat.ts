"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { ChatMessage, ContextType, MemorySource } from "../types";

interface UseChatOptions {
  cloneId: string;
  contextType?: ContextType;
  sessionId?: string; // if provided, continue this session and load its history
  ownerMode?: boolean; // true = skip credits for owner (training); false = charge owner too (consumer test)
}

export function useChat({ cloneId, contextType = "chat", sessionId: initialSessionId, ownerMode = true }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(!!initialSessionId);
  const [error, setError] = useState<string | null>(null);
  const sessionId = useRef(initialSessionId ?? uuidv4());

  // Load previous messages when a session ID is provided
  useEffect(() => {
    if (!initialSessionId) return;
    setHistoryLoading(true);
    fetch(`/api/brain/sessions/${initialSessionId}/messages`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.messages?.length) {
          setMessages(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data.messages.map((m: any) => ({
              id: uuidv4(),
              role: m.role as "user" | "clone",
              content: m.content ?? "",
              timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
              path_taken: m.path_taken,
              confidence: m.confidence ?? undefined,
              isHistory: true,
            }))
          );
        }
      })
      .catch(() => {/* non-fatal */})
      .finally(() => setHistoryLoading(false));
  }, [initialSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = useCallback(
    async (content: string, responseMode: "fast" | "pro" | "extended" = "fast", metadata?: Record<string, unknown>) => {
      if (!content.trim() || isLoading) return;

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
            session_id: sessionId.current,
            message: content.trim(),
            context_type: contextType,
            response_mode: responseMode,
            owner_mode: ownerMode,
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
            } else if (evt.event === "done") {
              setIsThinking(false);
              const finalText =
                (evt.corrected_response as string | null) ?? accText;
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
    [cloneId, contextType, ownerMode, isLoading] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    sessionId.current = uuidv4();
  }, []);

  return { messages, isLoading, isThinking, historyLoading, error, sendMessage, clearMessages, sessionId: sessionId.current };
}

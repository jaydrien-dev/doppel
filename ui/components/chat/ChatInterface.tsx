"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@/lib/hooks/useChat";
import type { ContextType } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";

interface ChatInterfaceProps {
  cloneId: string;
  cloneName?: string;
  contextType?: ContextType;
  ownerMode?: boolean;
  suggestedQuestions?: string[];
  placeholder?: string;
  onFirstMessage?: () => void;
}

export function ChatInterface({
  cloneId,
  cloneName = "Clone",
  contextType = "chat",
  ownerMode = false,
  suggestedQuestions,
  placeholder = "Ask anything…",
  onFirstMessage,
}: ChatInterfaceProps) {
  const { messages, isLoading, isThinking, error, sendMessage } = useChat({ cloneId, contextType });
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const firstMessageFired = useRef(false);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  function handleSend() {
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    if (!firstMessageFired.current) {
      firstMessageFired.current = true;
      onFirstMessage?.();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto py-4 space-y-0.5">
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full gap-6 px-4 pb-8">
            <div className="text-center">
              <p className="text-2xl font-light text-white/80 mb-1">{cloneName}</p>
              <p className="text-sm text-white/35">Your digital consciousness is ready</p>
            </div>

            {suggestedQuestions && suggestedQuestions.length > 0 && (
              <div className="flex flex-col gap-2 w-full max-w-sm">
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      sendMessage(q);
                      if (!firstMessageFired.current) {
                        firstMessageFired.current = true;
                        onFirstMessage?.();
                      }
                    }}
                    className="glass rounded-xl px-4 py-3 text-sm text-white/50 hover:text-white/80 text-left transition-colors hover:bg-white/5"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg) => {
          // Don't render an empty streaming placeholder — show indicator instead
          if (msg.isStreaming && !msg.content) return null;
          return (
            <MessageBubble
              key={msg.id}
              message={msg}
              cloneId={ownerMode ? cloneId : undefined}
              ownerMode={ownerMode}
            />
          );
        })}

        {/* Pre-stream: waiting for first token or thinking (slow path scratchpad) */}
        {isLoading && messages.every((m) => !m.isStreaming || !m.content) && (
          isThinking ? (
            <div className="flex items-center gap-2 px-4 py-3">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
              <span className="text-xs text-white/30">Thinking…</span>
            </div>
          ) : (
            <TypingIndicator />
          )
        )}

        {error && (
          <div className="px-4 py-2">
            <p className="text-xs text-white/30 text-center">{error}</p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="p-3 pt-0">
        <div className="glass-md rounded-2xl flex items-end gap-2 px-4 py-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className="flex-1 bg-transparent resize-none text-sm text-white/85 placeholder:text-white/25 outline-none leading-relaxed py-0.5"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all glass hover:glass-hi disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              className="text-white/60"
            >
              <path
                d="M7 12V2M7 2L2 7M7 2L12 7"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <p className="text-center text-[10px] text-white/15 mt-2">
          Shift+Enter for new line · Enter to send
        </p>
      </div>
    </div>
  );
}

"use client";

import { useClone } from "@/lib/hooks/useClone";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export default function TestPage() {
  const { clone, isLoading } = useClone();

  if (isLoading) return <LoadingSpinner />;
  if (!clone) {
    return (
      <div className="p-8">
        <p className="text-sm text-white/40">
          No clone yet.{" "}
          <a href="/dashboard" className="text-white/60 hover:text-white/80 underline underline-offset-2">
            Create one →
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-5 border-b border-white/[0.06]">
        <h1 className="text-xl font-light text-white/85">Test clone</h1>
        <p className="text-xs text-white/30 mt-0.5">
          Owner mode — approve, edit, or reject each response to improve your clone.
        </p>
      </div>
      <div className="flex-1 overflow-hidden">
        <ChatInterface
          cloneId={clone.clone_id}
          cloneName={clone.display_name}
          contextType="chat"
          ownerMode={true}
          placeholder="Test your clone — ask it anything…"
        />
      </div>
    </div>
  );
}

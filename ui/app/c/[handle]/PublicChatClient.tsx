"use client";

import { ChatInterface } from "@/components/chat/ChatInterface";
import type { ClonePublicInfo } from "@/lib/types";

const SUGGESTED: string[] = [
  "What are you working on right now?",
  "How do you make decisions under pressure?",
  "What's your biggest priority this quarter?",
];

export function PublicChatClient({ clone }: { clone: ClonePublicInfo }) {
  return (
    <ChatInterface
      cloneId={clone.clone_id}
      cloneName={clone.display_name}
      contextType="chat"
      ownerMode={false}
      suggestedQuestions={SUGGESTED}
      placeholder={`Ask ${clone.display_name} anything…`}
    />
  );
}

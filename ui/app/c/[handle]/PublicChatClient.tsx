"use client";

import { ChatInterface } from "@/components/chat/ChatInterface";
import type { ClonePublicInfo } from "@/lib/types";

const SUGGESTED_DEFAULT: string[] = [
  "What are you working on right now?",
  "How do you make decisions under pressure?",
  "What's your biggest priority this quarter?",
];

const SUGGESTED_ONBOARDING: string[] = [
  "What's the most important thing I should know about your domain?",
  "How do decisions get made on your team?",
  "What trips up new people most often?",
];

export function PublicChatClient({
  clone,
  isOnboardingResource,
}: {
  clone: ClonePublicInfo;
  isOnboardingResource?: boolean;
}) {
  const suggested = isOnboardingResource ? SUGGESTED_ONBOARDING : SUGGESTED_DEFAULT;
  return (
    <ChatInterface
      cloneId={clone.clone_id}
      cloneName={clone.display_name}
      contextType="chat"
      ownerMode={false}
      suggestedQuestions={suggested}
      placeholder={`Ask ${clone.display_name} anything…`}
    />
  );
}

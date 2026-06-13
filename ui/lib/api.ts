/**
 * Typed fetch wrappers for all Next.js API routes.
 * These call /api/* routes — NOT FastAPI directly.
 * FastAPI calls happen server-side inside the /api/* handlers.
 */

import type {
  BrainInput,
  BrainOutput,
  CloneOwnerInfo,
  FeedbackSignal,
  StyleFingerprint,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

// ---------------------------------------------------------------------------
// Clone management
// ---------------------------------------------------------------------------

export async function createClone(params: {
  handle: string;
  display_name: string;
  template_slug?: string;
}): Promise<{ clone_id: string; handle: string }> {
  return apiFetch("/api/clones", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function updateClone(
  handle: string,
  updates: Partial<Pick<CloneOwnerInfo, "access_mode" | "display_name" | "allowed_emails">>
): Promise<{ status: string }> {
  return apiFetch(`/api/clones/${handle}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export async function patchMemory(
  id: string,
  updates: { clone_id: string; is_pinned?: boolean; is_excluded?: boolean; content?: string }
): Promise<{ status: string }> {
  return apiFetch(`/api/brain/memories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export async function chat(
  input: Omit<BrainInput, "session_id"> & { session_id?: string }
): Promise<BrainOutput> {
  return apiFetch("/api/chat", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function submitFeedback(signal: FeedbackSignal): Promise<void> {
  await apiFetch("/api/feedback", {
    method: "POST",
    body: JSON.stringify(signal),
  });
}

// ---------------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------------

export async function getGmailAuthUrl(cloneId: string, returnPath = "/dashboard"): Promise<string> {
  const data = await apiFetch<{ url: string }>(
    `/api/ingestion/gmail-auth?clone_id=${cloneId}&return_path=${encodeURIComponent(returnPath)}`
  );
  return data.url;
}

export async function triggerGmailSync(
  cloneId: string,
  cloneName: string
): Promise<{ job_id: string }> {
  return apiFetch("/api/ingestion/gmail-sync", {
    method: "POST",
    body: JSON.stringify({ clone_id: cloneId, clone_name: cloneName }),
  });
}

export async function ingestText(params: {
  clone_id: string;
  text: string;
  source?: string;
  is_pinned?: boolean;
}): Promise<{ chunks_stored: number }> {
  return apiFetch("/api/ingestion/text", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function extractStyle(
  cloneId: string,
  cloneName: string
): Promise<{ fingerprint: StyleFingerprint; samples_used: number }> {
  return apiFetch("/api/ingestion/extract-style", {
    method: "POST",
    body: JSON.stringify({ clone_id: cloneId, clone_name: cloneName }),
  });
}

export async function getGithubAuthUrl(cloneId: string): Promise<string> {
  const data = await apiFetch<{ url: string }>(
    `/api/ingestion/github-auth?clone_id=${cloneId}`
  );
  return data.url;
}

export async function triggerGithubSync(cloneId: string): Promise<{ job_id: string }> {
  return apiFetch("/api/ingestion/github-sync", {
    method: "POST",
    body: JSON.stringify({ clone_id: cloneId }),
  });
}

export async function getNotionAuthUrl(cloneId: string): Promise<string> {
  const data = await apiFetch<{ url: string }>(
    `/api/ingestion/notion-auth?clone_id=${cloneId}`
  );
  return data.url;
}

export async function triggerNotionSync(cloneId: string): Promise<{ job_id: string }> {
  return apiFetch("/api/ingestion/notion-sync", {
    method: "POST",
    body: JSON.stringify({ clone_id: cloneId }),
  });
}

// ---------------------------------------------------------------------------
// Meeting Bot
// ---------------------------------------------------------------------------

export async function joinMeeting(
  cloneId: string,
  meetingUrl: string
): Promise<{ bot_id: string; status: string; platform: string }> {
  return apiFetch("/api/meetings/join", {
    method: "POST",
    body: JSON.stringify({ clone_id: cloneId, meeting_url: meetingUrl }),
  });
}

export async function leaveMeeting(botId: string): Promise<{ status: string }> {
  return apiFetch(`/api/meetings/${botId}/leave`, { method: "POST" });
}

// ---------------------------------------------------------------------------
// Slack
// ---------------------------------------------------------------------------

export async function getSlackInstallUrl(cloneId: string): Promise<string> {
  const data = await apiFetch<{ url: string }>(`/api/slack/install-url?clone_id=${cloneId}`);
  return data.url;
}

export async function getSlackStatus(cloneId: string): Promise<{
  connected: boolean;
  team_name?: string;
  team_id?: string;
}> {
  return apiFetch(`/api/slack/status?clone_id=${cloneId}`);
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useClone } from "@/lib/hooks/useClone";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DevKey {
  id: string;
  name: string;
  key_preview: string;
  created_at: string | null;
  last_used_at: string | null;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] text-white/40 glass hover:glass-md transition-all"
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function CodeBlock({ code, lang = "" }: { code: string; lang?: string }) {
  return (
    <div className="relative group">
      <pre className={`text-[11px] text-white/50 font-mono leading-relaxed overflow-x-auto bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 language-${lang}`}>
        {code}
      </pre>
      <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton text={code} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Keys tab
// ---------------------------------------------------------------------------

function NewKeyRow({ rawKey, name, onDone }: { rawKey: string; name: string; onDone: () => void }) {
  return (
    <div className="glass rounded-2xl p-5 border border-emerald-400/20">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/70" />
        <p className="text-sm font-medium text-white/80">{name}</p>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/[0.08] border border-emerald-400/15 text-emerald-300/70">just created</span>
      </div>
      <p className="text-[11px] text-amber-300/70 mb-3">Copy this key now — it won&apos;t be shown again.</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white/70 font-mono truncate">{rawKey}</code>
        <CopyButton text={rawKey} label="Copy key" />
      </div>
      <button onClick={onDone} className="mt-3 text-[11px] text-white/30 hover:text-white/50 transition-colors">
        I&apos;ve saved it →
      </button>
    </div>
  );
}

function KeyRow({ k, onRevoke }: { k: DevKey; onRevoke: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [revoking, setRevoking] = useState(false);

  async function revoke() {
    setRevoking(true);
    await fetch(`/api/developer/keys/${k.id}`, { method: "DELETE" });
    onRevoke(k.id);
  }

  return (
    <div className="glass rounded-2xl p-4 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/75">{k.name}</p>
        <p className="text-xs text-white/30 font-mono mt-0.5">{k.key_preview}</p>
      </div>
      <div className="text-right shrink-0">
        {k.last_used_at ? (
          <p className="text-[11px] text-white/30">last used {new Date(k.last_used_at).toLocaleDateString()}</p>
        ) : (
          <p className="text-[11px] text-white/20">never used</p>
        )}
        <p className="text-[11px] text-white/20">created {k.created_at ? new Date(k.created_at).toLocaleDateString() : "—"}</p>
      </div>
      <div className="shrink-0">
        {confirming ? (
          <div className="flex items-center gap-2">
            <button onClick={revoke} disabled={revoking} className="text-xs text-red-400/70 hover:text-red-400 transition-colors disabled:opacity-40">
              {revoking ? "…" : "Confirm revoke"}
            </button>
            <button onClick={() => setConfirming(false)} className="text-xs text-white/25 hover:text-white/50 transition-colors">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)} className="text-xs text-white/25 hover:text-white/50 transition-colors">Revoke</button>
        )}
      </div>
    </div>
  );
}

function KeysTab() {
  const [keys, setKeys] = useState<DevKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState<{ raw: string; name: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/developer/keys")
      .then((r) => r.json())
      .then((d) => setKeys(d.keys ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function createKey() {
    const name = nameRef.current?.value.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/developer/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      setNewKey({ raw: data.key, name: data.name });
      setKeys((prev) => [{ id: data.id, name: data.name, key_preview: data.key_preview, created_at: data.created_at, last_used_at: null }, ...prev]);
      if (nameRef.current) nameRef.current.value = "";
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="glass rounded-2xl p-5">
        <p className="text-xs text-white/50 font-medium mb-3">New key</p>
        <div className="flex gap-2">
          <input
            ref={nameRef}
            type="text"
            placeholder="Key name (e.g. my-app, zapier)"
            onKeyDown={(e) => e.key === "Enter" && createKey()}
            className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white/70 placeholder:text-white/25 outline-none focus:border-white/20 transition-colors"
          />
          <button
            onClick={createKey}
            disabled={creating}
            className="shrink-0 px-4 py-2 rounded-xl text-xs text-white/60 glass hover:glass-md transition-all disabled:opacity-40"
          >
            {creating ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>

      {newKey && (
        <NewKeyRow rawKey={newKey.raw} name={newKey.name} onDone={() => setNewKey(null)} />
      )}

      <p className="text-[11px] uppercase tracking-widest text-white/25 px-1">Active keys ({keys.length})</p>

      {loading ? (
        <div className="flex items-center gap-2 py-4">
          <div className="w-1.5 h-1.5 rounded-full bg-white/20 animate-pulse" />
          <span className="text-sm text-white/30">Loading…</span>
        </div>
      ) : keys.length === 0 ? (
        <div className="glass rounded-2xl p-6 text-center">
          <p className="text-sm text-white/30">No keys yet — generate one above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <KeyRow key={k.id} k={k} onRevoke={(id) => setKeys((prev) => prev.filter((x) => x.id !== id))} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-white/20 leading-relaxed px-1">
        Keys have full access to your clone. Keep them secret. Revoke immediately if compromised.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Docs tab
// ---------------------------------------------------------------------------

const ENDPOINTS = [
  {
    method: "POST",
    path: "/v1/clones/{handle}/chat",
    description: "Send a message and get a response from the clone.",
    body: `{
  "message": "What should I prioritize this week?",
  "session_id": "optional-uuid-for-session-continuity",
  "context_type": "chat"
}`,
    response: `{
  "response": "Based on what I know about our roadmap...",
  "confidence": 0.87,
  "path_taken": "slow",
  "needs_escalation": false,
  "sources": [{ "content": "...", "source": "gmail", "similarity": 0.91 }],
  "trace_id": "uuid",
  "latency_ms": 1240
}`,
  },
  {
    method: "POST",
    path: "/v1/clones/{handle}/draft",
    description: "Generate any text output in the clone's voice — emails, docs, replies.",
    body: `{
  "prompt": "Write a follow-up email to an investor who ghosted us",
  "context": "We met at YC last month. They seemed excited but haven't replied.",
  "context_type": "email_compose"
}`,
    response: `{
  "draft": "Hey Sarah, hope the week is treating you well...",
  "confidence": 0.82,
  "trace_id": "uuid"
}`,
  },
  {
    method: "GET",
    path: "/v1/clones/{handle}/eval",
    description: "Retrieve quality scores and stats for this clone.",
    body: null,
    response: `{
  "clone_handle": "jay",
  "memory_chunks": 4218,
  "total_responses": 891,
  "approval_rate": 73.4,
  "correction_rate": 12.1,
  "avg_confidence": 81.2,
  "quality_grade": "B"
}`,
  },
];

function DocsTab({ handle }: { handle: string }) {
  const BASE = "https://api.doppel.ai";

  const pythonSnippet = `import anthropic

# Doppel uses the same request shape as Anthropic's API
import httpx

client = httpx.Client(
    base_url="${BASE}",
    headers={"Authorization": "Bearer dak_YOUR_KEY_HERE"},
)

response = client.post(
    "/v1/clones/${handle || "your-handle"}/chat",
    json={
        "message": "What are your top priorities this quarter?",
        "context_type": "chat",
    },
).json()

print(response["response"])
print(f"Confidence: {response['confidence']:.0%}")`;

  const tsSnippet = `const BASE = "${BASE}";
const KEY = "dak_YOUR_KEY_HERE";
const HANDLE = "${handle || "your-handle"}";

async function askClone(message: string) {
  const res = await fetch(\`\${BASE}/v1/clones/\${HANDLE}/chat\`, {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${KEY}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, context_type: "chat" }),
  });
  return res.json();
}

const reply = await askClone("What would you do in my situation?");
console.log(reply.response);`;

  const webhookNote = `// Webhook events (coming soon):
// POST {your_url}/doppel-events
//
// {
//   "event": "clone.response",
//   "clone_handle": "${handle || "your-handle"}",
//   "trace_id": "uuid",
//   "response": "...",
//   "confidence": 0.85,
//   "needs_escalation": false
// }`;

  return (
    <div className="space-y-8">
      {/* Auth */}
      <div>
        <p className="text-[11px] uppercase tracking-widest text-white/25 mb-3">Authentication</p>
        <div className="glass rounded-2xl p-4 space-y-2">
          <p className="text-xs text-white/50">All requests require an API key in the Authorization header:</p>
          <CodeBlock code={`Authorization: Bearer dak_your_key_here`} />
          <p className="text-[11px] text-white/25">Generate keys in the Keys tab. Keys are hashed at rest and shown only once.</p>
        </div>
      </div>

      {/* Base URL */}
      <div>
        <p className="text-[11px] uppercase tracking-widest text-white/25 mb-3">Base URL</p>
        <CodeBlock code={BASE} />
      </div>

      {/* Endpoints */}
      <div>
        <p className="text-[11px] uppercase tracking-widest text-white/25 mb-3">Endpoints</p>
        <div className="space-y-4">
          {ENDPOINTS.map((ep) => (
            <div key={ep.path} className="glass rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-3">
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                  ep.method === "GET"
                    ? "bg-emerald-400/10 text-emerald-300/70"
                    : "bg-blue-400/10 text-blue-300/70"
                }`}>
                  {ep.method}
                </span>
                <code className="text-xs text-white/60 font-mono">{ep.path}</code>
              </div>
              <p className="text-xs text-white/40">{ep.description}</p>
              {ep.body && (
                <div>
                  <p className="text-[10px] text-white/25 mb-1.5">Request body</p>
                  <CodeBlock code={ep.body} lang="json" />
                </div>
              )}
              <div>
                <p className="text-[10px] text-white/25 mb-1.5">Response</p>
                <CodeBlock code={ep.response} lang="json" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SDK examples */}
      <div>
        <p className="text-[11px] uppercase tracking-widest text-white/25 mb-3">SDK examples</p>
        <div className="space-y-4">
          <div>
            <p className="text-[10px] text-white/25 mb-2">Python</p>
            <CodeBlock code={pythonSnippet} lang="python" />
          </div>
          <div>
            <p className="text-[10px] text-white/25 mb-2">TypeScript</p>
            <CodeBlock code={tsSnippet} lang="typescript" />
          </div>
        </div>
      </div>

      {/* Webhooks */}
      <div>
        <p className="text-[11px] uppercase tracking-widest text-white/25 mb-3">Webhooks</p>
        <CodeBlock code={webhookNote} lang="javascript" />
      </div>

      {/* Rate limits */}
      <div className="glass rounded-2xl p-4">
        <p className="text-xs text-white/50 font-medium mb-3">Rate limits</p>
        <div className="space-y-1.5">
          {[
            ["Free", "100 requests/day"],
            ["Pro", "1,000 requests/day"],
            ["Creator", "5,000 requests/day"],
            ["Enterprise", "Unlimited + SLA"],
          ].map(([tier, limit]) => (
            <div key={tier} className="flex items-center justify-between">
              <span className="text-xs text-white/40">{tier}</span>
              <span className="text-xs text-white/30 font-mono">{limit}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DeveloperApiPage() {
  const { clone } = useClone();
  const [tab, setTab] = useState<"keys" | "docs">("keys");

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-light text-white/85">Developer API</h1>
        <p className="text-sm text-white/35 mt-1">
          Programmatic access to your clone from any app, script, or workflow.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white/[0.03] rounded-xl p-1 w-fit">
        {(["keys", "docs"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-xs transition-all capitalize ${
              tab === t ? "glass-md text-white/75" : "text-white/35 hover:text-white/55"
            }`}
          >
            {t === "keys" ? "API Keys" : "Documentation"}
          </button>
        ))}
      </div>

      {tab === "keys" && <KeysTab />}
      {tab === "docs" && <DocsTab handle={clone?.handle ?? ""} />}
    </div>
  );
}

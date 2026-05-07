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
// Test tab
// ---------------------------------------------------------------------------

function TestTab({ handle }: { handle: string }) {
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("What are your top priorities right now?");
  const [result, setResult] = useState<object | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function runTest() {
    if (!apiKey.trim() || !message.trim() || !handle) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/v1/clones/${handle}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({ message, context_type: "chat" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail ?? JSON.stringify(data));
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="glass rounded-2xl p-5 space-y-3">
        <div>
          <label className="text-[11px] text-white/30 block mb-1">API key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="dak_..."
            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white/70 placeholder:text-white/25 outline-none focus:border-white/20 font-mono"
          />
        </div>
        <div>
          <label className="text-[11px] text-white/30 block mb-1">
            Message → <code className="text-white/25 font-mono">POST /v1/clones/{handle || "{handle}"}/chat</code>
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white/70 outline-none focus:border-white/20 resize-none"
          />
        </div>
        <button
          onClick={runTest}
          disabled={loading || !apiKey.trim() || !handle}
          className="glass-md hover:glass-hi rounded-xl px-5 py-2.5 text-sm text-white/60 hover:text-white/80 transition-all disabled:opacity-40"
        >
          {loading ? "Sending…" : "Send request"}
        </button>
        {!handle && (
          <p className="text-[11px] text-amber-400/50">Set a handle in Identity settings first.</p>
        )}
      </div>

      {error && (
        <div className="glass rounded-xl px-4 py-3 border border-red-400/15">
          <p className="text-xs text-red-400/60">{error}</p>
        </div>
      )}

      {result && (
        <div className="glass rounded-2xl p-5 space-y-3">
          {(result as Record<string, unknown>).response != null && (
            <div>
              <p className="text-[11px] text-white/25 mb-1">Response</p>
              <p className="text-sm text-white/75 leading-relaxed">{String((result as Record<string, unknown>).response)}</p>
            </div>
          )}
          <div>
            <p className="text-[11px] text-white/25 mb-1">Full JSON</p>
            <pre className="text-[10px] text-white/40 font-mono bg-white/[0.03] rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Docs tab
// ---------------------------------------------------------------------------

function DocsTab({ handle }: { handle: string }) {
  const h = handle || "your-handle";
  const BASE = process.env.NEXT_PUBLIC_APP_URL ?? (typeof window !== "undefined" ? window.location.origin : "https://doppel-pi.vercel.app");

  const curlChat = `curl -X POST ${BASE}/v1/clones/${h}/chat \\
  -H "Authorization: Bearer dak_YOUR_KEY_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "What are your top priorities right now?"}'`;

  const curlDraft = `curl -X POST ${BASE}/v1/clones/${h}/draft \\
  -H "Authorization: Bearer dak_YOUR_KEY_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "Write a follow-up email to an investor who went quiet",
    "context": "Met at YC last month. They seemed excited but haven'\''t replied."
  }'`;

  const chatResponse = `{
  "response": "My top priorities right now are...",
  "confidence": 0.87,
  "needs_escalation": false,
  "path_taken": "fast",
  "sources": [
    { "content": "...", "source": "gmail", "similarity": 0.91 }
  ],
  "trace_id": "3f8a...",
  "latency_ms": 1240
}`;

  const pythonSnippet = `import httpx

client = httpx.Client(
    base_url="${BASE}",
    headers={"Authorization": "Bearer dak_YOUR_KEY_HERE"},
)

# Ask the clone a question
res = client.post(
    "/v1/clones/${h}/chat",
    json={"message": "What are your top priorities right now?"},
)
data = res.json()
print(data["response"])

# Generate a draft in the clone's voice
res = client.post(
    "/v1/clones/${h}/draft",
    json={
        "prompt": "Write a follow-up email to an investor who went quiet",
        "context": "Met at YC last month, they seemed excited.",
    },
)
print(res.json()["draft"])`;

  const tsSnippet = `const BASE = "${BASE}";
const KEY  = "dak_YOUR_KEY_HERE";

async function askClone(message: string) {
  const res = await fetch(\`\${BASE}/v1/clones/${h}/chat\`, {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${KEY}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message }),
  });
  const data = await res.json();
  // data.response  — the clone's reply
  // data.confidence — 0.0–1.0
  // data.needs_escalation — true if clone is unsure
  return data;
}

const reply = await askClone("What would you prioritize this week?");
console.log(reply.response);`;

  return (
    <div className="space-y-8 max-w-3xl">

      {/* Quick start */}
      <div className="glass rounded-2xl p-6 space-y-4">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-white/25 mb-1">Quick start</p>
          <p className="text-sm text-white/50 leading-relaxed">
            Three steps: generate a key → get your handle → make a request.
          </p>
        </div>
        <div className="space-y-3">
          <div className="flex gap-3">
            <span className="text-[11px] text-white/20 w-5 shrink-0 pt-0.5">1.</span>
            <div className="flex-1">
              <p className="text-xs text-white/50 mb-1.5">Generate an API key in the <a href="#" onClick={() => {}} className="text-white/60 underline underline-offset-2">Keys tab</a>. Copy it — shown only once.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-[11px] text-white/20 w-5 shrink-0 pt-0.5">2.</span>
            <div className="flex-1">
              <p className="text-xs text-white/50 mb-1.5">Your clone handle is <code className="text-white/70 bg-white/[0.06] px-1.5 py-0.5 rounded-md font-mono text-[11px]">{h}</code> — used in every endpoint URL.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-[11px] text-white/20 w-5 shrink-0 pt-0.5">3.</span>
            <div className="flex-1">
              <p className="text-xs text-white/50 mb-1.5">Make a request:</p>
              <CodeBlock code={curlChat} />
            </div>
          </div>
        </div>
      </div>

      {/* Auth */}
      <div>
        <p className="text-[11px] uppercase tracking-widest text-white/25 mb-3">Authentication</p>
        <div className="glass rounded-2xl p-5 space-y-3">
          <p className="text-xs text-white/45 leading-relaxed">
            Every request must include your API key as a Bearer token. Keys are prefixed with <code className="text-white/60 font-mono">dak_</code>.
          </p>
          <CodeBlock code={`Authorization: Bearer dak_YOUR_KEY_HERE`} />
          <div className="pt-1 space-y-1.5">
            {[
              ["Base URL", BASE],
              ["Your handle", h],
            ].map(([label, val]) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-[11px] text-white/25 w-24 shrink-0">{label}</span>
                <code className="text-[11px] text-white/55 font-mono">{val}</code>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Endpoints */}
      <div>
        <p className="text-[11px] uppercase tracking-widest text-white/25 mb-3">Endpoints</p>
        <div className="space-y-4">

          {/* Chat */}
          <div className="glass rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-400/10 text-blue-300/70">POST</span>
              <code className="text-xs text-white/70 font-mono">/v1/clones/{h}/chat</code>
            </div>
            <p className="text-xs text-white/40">
              Ask the clone a question or give it a task. Returns a response grounded in its memory — emails, decisions, domain knowledge.
              Use <code className="text-white/55 font-mono">session_id</code> to maintain conversation context across calls.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-white/25 mb-1.5">Request</p>
                <CodeBlock code={`{
  "message": "string (required)",
  "session_id": "uuid (optional)",
  "context_type": "chat"
}`} />
              </div>
              <div>
                <p className="text-[10px] text-white/25 mb-1.5">Response</p>
                <CodeBlock code={chatResponse} />
              </div>
            </div>
            <div>
              <p className="text-[10px] text-white/25 mb-1.5">Example</p>
              <CodeBlock code={curlChat} />
            </div>
          </div>

          {/* Draft */}
          <div className="glass rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-400/10 text-blue-300/70">POST</span>
              <code className="text-xs text-white/70 font-mono">/v1/clones/{h}/draft</code>
            </div>
            <p className="text-xs text-white/40">
              Generate any text output in the clone's voice — emails, docs, replies, summaries.
              Provide <code className="text-white/55 font-mono">context</code> for better grounding.
            </p>
            <div>
              <p className="text-[10px] text-white/25 mb-1.5">Example</p>
              <CodeBlock code={curlDraft} />
            </div>
          </div>

          {/* Eval */}
          <div className="glass rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-400/10 text-emerald-300/70">GET</span>
              <code className="text-xs text-white/70 font-mono">/v1/clones/{h}/eval</code>
            </div>
            <p className="text-xs text-white/40">
              Returns quality metrics: memory size, response approval rate, avg confidence, quality grade.
            </p>
          </div>

        </div>
      </div>

      {/* SDK examples */}
      <div>
        <p className="text-[11px] uppercase tracking-widest text-white/25 mb-3">Code examples</p>
        <div className="space-y-4">
          <div>
            <p className="text-[10px] text-white/25 mb-2">Python (httpx)</p>
            <CodeBlock code={pythonSnippet} />
          </div>
          <div>
            <p className="text-[10px] text-white/25 mb-2">TypeScript / JavaScript</p>
            <CodeBlock code={tsSnippet} />
          </div>
        </div>
      </div>

      {/* Response fields */}
      <div>
        <p className="text-[11px] uppercase tracking-widest text-white/25 mb-3">Response fields</p>
        <div className="glass rounded-2xl overflow-hidden">
          {[
            ["response", "string", "The clone's reply"],
            ["confidence", "float 0–1", "How confident the clone is. Below 0.6 = consider escalating"],
            ["needs_escalation", "bool", "True if the clone thinks a human should handle this"],
            ["path_taken", "fast | slow", "fast = pattern match; slow = full reasoning chain"],
            ["sources", "array", "Memory chunks that informed the response"],
            ["trace_id", "uuid", "Use this for feedback — approve/reject to improve the clone"],
            ["latency_ms", "int", "Total response time in milliseconds"],
          ].map(([field, type, desc], i) => (
            <div key={field} className={`flex gap-4 px-4 py-3 ${i % 2 === 0 ? "" : "bg-white/[0.02]"}`}>
              <code className="text-[11px] text-white/60 font-mono w-36 shrink-0">{field}</code>
              <span className="text-[11px] text-white/25 w-24 shrink-0">{type}</span>
              <span className="text-[11px] text-white/40">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Rate limits */}
      <div className="glass rounded-2xl p-5">
        <p className="text-xs text-white/50 font-medium mb-3">Rate limits</p>
        <div className="space-y-2">
          {[
            ["Free", "100 req/day"],
            ["Pro", "1,000 req/day"],
            ["Creator", "5,000 req/day"],
            ["Enterprise", "Unlimited"],
          ].map(([tier, limit]) => (
            <div key={tier} className="flex items-center justify-between">
              <span className="text-xs text-white/40">{tier}</span>
              <span className="text-xs text-white/30 font-mono">{limit}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-white/20 mt-3">Rate limit exceeded → HTTP 429. Upgrade in Settings.</p>
      </div>

    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DeveloperApiPage() {
  const { clone } = useClone();
  const [tab, setTab] = useState<"keys" | "test" | "docs">("keys");

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-light text-white/85">Developer API</h1>
        <p className="text-sm text-white/35 mt-1">
          Programmatic access to your clone from any app, script, or workflow.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white/[0.03] rounded-xl p-1 w-fit">
        {(["keys", "test", "docs"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-xs transition-all capitalize ${
              tab === t ? "glass-md text-white/75" : "text-white/35 hover:text-white/55"
            }`}
          >
            {t === "keys" ? "API Keys" : t === "test" ? "Test" : "Documentation"}
          </button>
        ))}
      </div>

      {tab === "keys" && <KeysTab />}
      {tab === "test" && <TestTab handle={clone?.handle ?? ""} />}
      {tab === "docs" && <DocsTab handle={clone?.handle ?? ""} />}
    </div>
  );
}

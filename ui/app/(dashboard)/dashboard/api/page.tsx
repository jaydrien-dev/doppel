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
      className="btn btn--sm btn--ghost"
      style={{ flexShrink: 0 }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div style={{ position: "relative" }}>
      <pre style={{
        fontSize: 11, color: "rgba(255,255,255,0.50)", fontFamily: "ui-monospace, Menlo, monospace",
        lineHeight: 1.6, overflowX: "auto",
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 10, padding: "12px 14px", margin: 0,
      }}>
        {code}
      </pre>
      <div style={{ position: "absolute", top: 8, right: 8 }}>
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
    <div style={{
      background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.18)",
      borderRadius: 16, padding: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(52,211,153,0.70)" }} />
        <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.80)", margin: 0 }}>{name}</p>
        <span className="badge badge--pos">just created</span>
      </div>
      <p style={{ fontSize: 11, color: "rgba(251,191,36,0.70)", marginBottom: 12 }}>
        Copy this key now — it won&apos;t be shown again.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <code className="input" style={{ flex: 1, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {rawKey}
        </code>
        <CopyButton text={rawKey} label="Copy key" />
      </div>
      <button onClick={onDone} className="btn btn--ghost btn--sm" style={{ marginTop: 10 }}>
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
    <div className="act-row">
      <span className="act-row__dot" style={{ background: "rgba(255,255,255,0.25)" }} />
      <span className="act-row__text" style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>
        <span style={{ color: "rgba(255,255,255,0.75)" }}>{k.name}</span>
        <span style={{ marginLeft: 8, color: "rgba(255,255,255,0.30)", fontSize: 11 }}>{k.key_preview}</span>
      </span>
      <span className="act-row__meta">
        {k.last_used_at ? (
          <span style={{ color: "rgba(255,255,255,0.30)" }}>used {new Date(k.last_used_at).toLocaleDateString()}</span>
        ) : (
          <span style={{ color: "rgba(255,255,255,0.20)" }}>never used</span>
        )}
        <span style={{ color: "rgba(255,255,255,0.20)" }}>created {k.created_at ? new Date(k.created_at).toLocaleDateString() : "—"}</span>
        {confirming ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <button onClick={revoke} disabled={revoking} className="btn btn--sm"
              style={{ color: "rgba(248,113,113,0.70)", borderColor: "rgba(248,113,113,0.15)" }}>
              {revoking ? "…" : "Confirm revoke"}
            </button>
            <button onClick={() => setConfirming(false)} className="btn btn--ghost btn--sm">Cancel</button>
          </span>
        ) : (
          <button onClick={() => setConfirming(true)} className="btn btn--ghost btn--sm">Revoke</button>
        )}
      </span>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card">
        <p className="card-title">New key</p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            ref={nameRef}
            type="text"
            placeholder="Key name (e.g. my-app, zapier)"
            onKeyDown={(e) => e.key === "Enter" && createKey()}
            className="input"
            style={{ flex: 1 }}
          />
          <button
            onClick={createKey}
            disabled={creating}
            className="btn btn--primary"
            style={{ flexShrink: 0 }}
          >
            {creating ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>

      {newKey && (
        <NewKeyRow rawKey={newKey.raw} name={newKey.name} onDone={() => setNewKey(null)} />
      )}

      <p className="db-eyebrow" style={{ paddingLeft: 4 }}>Active keys ({keys.length})</p>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 4px" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.20)" }} />
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.30)" }}>Loading…</span>
        </div>
      ) : keys.length === 0 ? (
        <div className="card" style={{ textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.30)", margin: 0 }}>No keys yet — generate one above.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {keys.map((k) => (
            <KeyRow key={k.id} k={k} onRevoke={(id) => setKeys((prev) => prev.filter((x) => x.id !== id))} />
          ))}
        </div>
      )}

      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.20)", lineHeight: 1.6, paddingLeft: 4 }}>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 640 }}>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.40)", marginBottom: 6 }}>
            API key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="dak_..."
            className="input"
            style={{ fontFamily: "ui-monospace, Menlo, monospace" }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.40)", marginBottom: 6 }}>
            Message → <code style={{ fontFamily: "ui-monospace, Menlo, monospace", color: "rgba(255,255,255,0.30)", fontSize: 11 }}>POST /v1/clones/{handle || "{handle}"}/chat</code>
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            className="input"
            style={{ resize: "none" }}
          />
        </div>
        <div>
          <button
            onClick={runTest}
            disabled={loading || !apiKey.trim() || !handle}
            className="btn btn--primary"
          >
            {loading ? "Sending…" : "Send request"}
          </button>
          {!handle && (
            <p style={{ fontSize: 11, color: "rgba(251,191,36,0.50)", marginTop: 8 }}>
              Set a handle in Identity settings first.
            </p>
          )}
        </div>
      </div>

      {error && (
        <div style={{ borderRadius: 12, padding: "10px 14px", border: "1px solid rgba(248,113,113,0.15)", background: "rgba(248,113,113,0.05)" }}>
          <p style={{ fontSize: 12, color: "rgba(248,113,113,0.60)", margin: 0 }}>{error}</p>
        </div>
      )}

      {result && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(result as Record<string, unknown>).response != null && (
            <div>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginBottom: 6 }}>Response</p>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.6, margin: 0 }}>
                {String((result as Record<string, unknown>).response)}
              </p>
            </div>
          )}
          <div>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginBottom: 6 }}>Full JSON</p>
            <pre style={{
              fontSize: 10, color: "rgba(255,255,255,0.40)", fontFamily: "ui-monospace, Menlo, monospace",
              background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 12, overflowX: "auto",
              whiteSpace: "pre-wrap", margin: 0,
            }}>
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
  const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://doppel-pi.vercel.app";

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
  return data;
}

const reply = await askClone("What would you prioritize this week?");
console.log(reply.response);`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 780 }}>

      {/* Quick start */}
      <div className="card">
        <p className="card-title">Quick start</p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 16, lineHeight: 1.5 }}>
          Three steps: generate a key → get your handle → make a request.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            { n: "1", text: "Generate an API key in the Keys tab. Copy it — shown only once." },
            { n: "2", text: `Your clone handle is ${h} — used in every endpoint URL.` },
          ].map(({ n, text }) => (
            <div key={n} style={{ display: "flex", gap: 12 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.20)", width: 16, flexShrink: 0, paddingTop: 2 }}>{n}.</span>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", margin: 0, lineHeight: 1.5 }}>{text}</p>
            </div>
          ))}
          <div style={{ display: "flex", gap: 12 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.20)", width: 16, flexShrink: 0, paddingTop: 2 }}>3.</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", margin: "0 0 8px", lineHeight: 1.5 }}>Make a request:</p>
              <CodeBlock code={curlChat} />
            </div>
          </div>
        </div>
      </div>

      {/* Auth */}
      <div>
        <p className="db-eyebrow" style={{ marginBottom: 12 }}>Authentication</p>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, margin: 0 }}>
            Every request must include your API key as a Bearer token. Keys are prefixed with{" "}
            <code style={{ fontFamily: "ui-monospace, Menlo, monospace", color: "rgba(255,255,255,0.60)", fontSize: 11 }}>dak_</code>.
          </p>
          <CodeBlock code={`Authorization: Bearer dak_YOUR_KEY_HERE`} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 4 }}>
            {[
              ["Base URL", BASE],
              ["Your handle", h],
            ].map(([label, val]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", width: 80, flexShrink: 0 }}>{label}</span>
                <code style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontFamily: "ui-monospace, Menlo, monospace" }}>{val}</code>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Endpoints */}
      <div>
        <p className="db-eyebrow" style={{ marginBottom: 12 }}>Endpoints</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Chat */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{
                fontSize: 10, fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 600,
                padding: "2px 8px", borderRadius: 6,
                background: "rgba(96,165,250,0.10)", color: "rgba(147,197,253,0.70)",
              }}>POST</span>
              <code style={{ fontSize: 12, color: "rgba(255,255,255,0.70)", fontFamily: "ui-monospace, Menlo, monospace" }}>
                /v1/clones/{h}/chat
              </code>
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", margin: 0, lineHeight: 1.6 }}>
              Ask the clone a question or give it a task. Returns a response grounded in its memory.
              Use <code style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11 }}>session_id</code> to maintain conversation context.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginBottom: 8 }}>Request</p>
                <CodeBlock code={`{\n  "message": "string (required)",\n  "session_id": "uuid (optional)",\n  "context_type": "chat"\n}`} />
              </div>
              <div>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginBottom: 8 }}>Response</p>
                <CodeBlock code={chatResponse} />
              </div>
            </div>
            <div>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginBottom: 8 }}>Example</p>
              <CodeBlock code={curlChat} />
            </div>
          </div>

          {/* Draft */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{
                fontSize: 10, fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 600,
                padding: "2px 8px", borderRadius: 6,
                background: "rgba(96,165,250,0.10)", color: "rgba(147,197,253,0.70)",
              }}>POST</span>
              <code style={{ fontSize: 12, color: "rgba(255,255,255,0.70)", fontFamily: "ui-monospace, Menlo, monospace" }}>
                /v1/clones/{h}/draft
              </code>
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", margin: 0, lineHeight: 1.6 }}>
              Generate any text output in the clone&apos;s voice — emails, docs, replies, summaries.
            </p>
            <div>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginBottom: 8 }}>Example</p>
              <CodeBlock code={curlDraft} />
            </div>
          </div>

          {/* Eval */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{
                fontSize: 10, fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 600,
                padding: "2px 8px", borderRadius: 6,
                background: "rgba(52,211,153,0.10)", color: "rgba(52,211,153,0.70)",
              }}>GET</span>
              <code style={{ fontSize: 12, color: "rgba(255,255,255,0.70)", fontFamily: "ui-monospace, Menlo, monospace" }}>
                /v1/clones/{h}/eval
              </code>
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", margin: 0, lineHeight: 1.6 }}>
              Returns quality metrics: memory size, response approval rate, avg confidence, quality grade.
            </p>
          </div>
        </div>
      </div>

      {/* Code examples */}
      <div>
        <p className="db-eyebrow" style={{ marginBottom: 12 }}>Code examples</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginBottom: 8 }}>Python (httpx)</p>
            <CodeBlock code={pythonSnippet} />
          </div>
          <div>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginBottom: 8 }}>TypeScript / JavaScript</p>
            <CodeBlock code={tsSnippet} />
          </div>
        </div>
      </div>

      {/* Response fields */}
      <div>
        <p className="db-eyebrow" style={{ marginBottom: 12 }}>Response fields</p>
        <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
          {[
            ["response", "string", "The clone's reply"],
            ["confidence", "float 0–1", "How confident the clone is. Below 0.6 = consider escalating"],
            ["needs_escalation", "bool", "True if the clone thinks a human should handle this"],
            ["path_taken", "fast | slow", "fast = pattern match; slow = full reasoning chain"],
            ["sources", "array", "Memory chunks that informed the response"],
            ["trace_id", "uuid", "Use this for feedback — approve/reject to improve the clone"],
            ["latency_ms", "int", "Total response time in milliseconds"],
          ].map(([field, type, desc], i) => (
            <div key={field} style={{
              display: "flex", gap: 16, padding: "10px 16px",
              background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
            }}>
              <code style={{ fontSize: 11, color: "rgba(255,255,255,0.60)", fontFamily: "ui-monospace, Menlo, monospace", width: 140, flexShrink: 0 }}>{field}</code>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", width: 90, flexShrink: 0 }}>{type}</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.40)" }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Rate limits */}
      <div className="card">
        <p className="card-title">Rate limits</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            ["Free", "100 req/day"],
            ["Pro", "1,000 req/day"],
            ["Creator", "5,000 req/day"],
            ["Enterprise", "Unlimited"],
          ].map(([tier, limit]) => (
            <div key={tier} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.40)" }}>{tier}</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", fontFamily: "ui-monospace, Menlo, monospace" }}>{limit}</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.20)", marginTop: 12 }}>
          Rate limit exceeded → HTTP 429. Upgrade in Billing.
        </p>
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
    <div className="db-page">
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Integration</p>
          <h1 className="db-h1">Developer API</h1>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: "inline-flex", gap: 4, marginBottom: 24,
        padding: 4, borderRadius: 12,
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
      }}>
        {(["keys", "test", "docs"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "6px 16px", borderRadius: 9, fontSize: 12, fontWeight: 500,
              cursor: "pointer", border: "none", fontFamily: "inherit",
              background: tab === t ? "rgba(255,255,255,0.09)" : "transparent",
              color: tab === t ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.40)",
              transition: "all 180ms",
            }}
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

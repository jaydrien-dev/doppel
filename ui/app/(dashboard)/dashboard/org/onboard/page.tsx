"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";

interface ParsedRow {
  email: string;
  display_name: string;
  role: string;
  valid: boolean;
  error?: string;
}

interface PendingInvite {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  invite_token: string | null;
  invited_at: string | null;
  status: "pending" | "activated";
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split("\n").filter((l) => l.trim());
  const rows: ParsedRow[] = [];

  for (const line of lines) {
    // Skip header row
    if (/^email/i.test(line.trim())) continue;

    const parts = line.split(",").map((p) => p.trim().replace(/^["']|["']$/g, ""));
    const email = (parts[0] || "").toLowerCase();
    const display_name = parts[1] || email.split("@")[0];
    const role = parts[2] || "member";

    if (!email || !email.includes("@")) {
      rows.push({ email: parts[0] || "", display_name, role, valid: false, error: "Invalid email" });
    } else {
      rows.push({ email, display_name, role, valid: true });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return rows.map((r) => {
    if (seen.has(r.email)) return { ...r, valid: false, error: "Duplicate" };
    seen.add(r.email);
    return r;
  });
}

export default function BulkOnboardPage() {
  const { user } = useUser();
  const [org, setOrg] = useState<{ id: string; name: string } | null>(null);
  const [csvText, setCsvText] = useState("");
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [inviting, setInviting] = useState(false);
  const [result, setResult] = useState<{ invited: number; skipped: number; errors: { email: string; reason: string }[] } | null>(null);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load org info + existing invites
  useEffect(() => {
    Promise.all([
      fetch("/api/org").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/org/pending-invites").then((r) => (r.ok ? r.json() : null)),
    ]).then(([orgData, invData]) => {
      if (orgData?.id) setOrg({ id: orgData.id, name: orgData.name });
      if (invData?.invites) setPendingInvites(invData.invites);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleCSVChange = useCallback((text: string) => {
    setCsvText(text);
    setParsed(parseCSV(text));
    setResult(null);
  }, []);

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => handleCSVChange(reader.result as string);
    reader.readAsText(file);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => handleCSVChange(reader.result as string);
    reader.readAsText(file);
  }

  async function handleInviteAll() {
    if (!org) return;
    const valid = parsed.filter((r) => r.valid);
    if (valid.length === 0) return;

    setInviting(true);
    try {
      const res = await fetch("/api/org/bulk-onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: org.id,
          employees: valid.map((r) => ({ email: r.email, display_name: r.display_name, role: r.role })),
        }),
      });
      const data = await res.json();
      setResult(data);
      // Reload invites
      const invRes = await fetch("/api/org/pending-invites");
      if (invRes.ok) {
        const invData = await invRes.json();
        setPendingInvites(invData.invites || []);
      }
    } catch {
      setResult({ invited: 0, skipped: 0, errors: [{ email: "", reason: "Network error" }] });
    }
    setInviting(false);
  }

  if (loading) {
    return (
      <div className="db-page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
        <div style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.15)", borderTopColor: "rgba(255,255,255,0.60)", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="db-page" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="db-page-head">
          <div>
            <p className="db-eyebrow">Organisation</p>
            <h1 className="db-h1">Bulk onboard</h1>
          </div>
        </div>
        <div className="card" style={{ padding: 24 }}>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", margin: 0 }}>
            You need to{" "}
            <Link href="/dashboard/org" style={{ color: "rgba(255,255,255,0.60)", textDecoration: "underline", textUnderlineOffset: 2 }}>
              create an organisation
            </Link>{" "}
            first.
          </p>
        </div>
      </div>
    );
  }

  const validCount = parsed.filter((r) => r.valid).length;
  const invalidCount = parsed.filter((r) => !r.valid).length;

  return (
    <div className="db-page" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div className="db-page-head">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <p className="db-eyebrow">Organisation</p>
            <h1 className="db-h1">Bulk onboard</h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", margin: "6px 0 0", lineHeight: 1.5 }}>
              Upload a CSV of employees to invite them all at once. Each employee gets a personal invite link.
            </p>
          </div>
          <Link
            href="/dashboard/org"
            style={{
              fontSize: 12, padding: "6px 14px", borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.50)", textDecoration: "none",
            }}
          >
            Back to org
          </Link>
        </div>
      </div>

      {/* CSV Upload Zone */}
      <div
        className="card"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleFileDrop}
        style={{
          padding: 24, textAlign: "center", cursor: "pointer",
          border: "1px dashed rgba(255,255,255,0.12)",
          transition: "border-color 200ms",
        }}
        onClick={() => fileRef.current?.click()}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.25)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.12)"; }}
      >
        <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileSelect} style={{ display: "none" }} />
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ margin: "0 auto 12px", opacity: 0.3 }}>
          <path d="M12 16V4M12 4L8 8M12 4l4 4M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: "0 0 4px" }}>
          Drop a CSV file here, or click to browse
        </p>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.22)", margin: 0 }}>
          Format: email, display_name, role (role is optional, defaults to &quot;member&quot;)
        </p>
      </div>

      {/* Or paste directly */}
      <div className="card" style={{ padding: "16px 20px" }}>
        <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", margin: "0 0 10px" }}>
          Or paste CSV data
        </p>
        <textarea
          value={csvText}
          onChange={(e) => handleCSVChange(e.target.value)}
          placeholder={"alice@company.com, Alice Smith, member\nbob@company.com, Bob Jones\ncharlie@company.com, Charlie Brown, admin"}
          rows={5}
          style={{
            width: "100%", padding: "10px 12px", borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.70)", fontSize: 12, fontFamily: "ui-monospace, Menlo, monospace",
            outline: "none", resize: "vertical", lineHeight: 1.7,
          }}
        />
      </div>

      {/* Preview table */}
      {parsed.length > 0 && (
        <div className="card" style={{ padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", margin: 0 }}>
              Preview <span style={{ color: "rgba(255,255,255,0.40)" }}>({validCount} valid{invalidCount > 0 ? `, ${invalidCount} invalid` : ""})</span>
            </p>
            <button
              onClick={handleInviteAll}
              disabled={validCount === 0 || inviting}
              style={{
                fontSize: 12, fontWeight: 500, padding: "7px 20px", borderRadius: 10,
                border: "none", cursor: validCount === 0 || inviting ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                background: validCount > 0 ? "rgba(255,255,255,0.11)" : "rgba(255,255,255,0.04)",
                color: validCount > 0 ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.30)",
                opacity: inviting ? 0.6 : 1,
              }}
            >
              {inviting ? "Inviting..." : `Invite all (${validCount})`}
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["Email", "Name", "Role", "Status"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.22)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "8px 10px", color: row.valid ? "rgba(255,255,255,0.65)" : "rgba(248,113,113,0.65)" }}>{row.email}</td>
                    <td style={{ padding: "8px 10px", color: "rgba(255,255,255,0.45)" }}>{row.display_name}</td>
                    <td style={{ padding: "8px 10px", color: "rgba(255,255,255,0.35)" }}>{row.role}</td>
                    <td style={{ padding: "8px 10px" }}>
                      {row.valid ? (
                        <span style={{ fontSize: 10, color: "rgba(52,211,153,0.70)" }}>Ready</span>
                      ) : (
                        <span style={{ fontSize: 10, color: "rgba(248,113,113,0.70)" }}>{row.error}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="card" style={{ padding: "16px 20px" }}>
          <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", margin: "0 0 10px" }}>
            Result
          </p>
          <div style={{ display: "flex", gap: 20, fontSize: 13 }}>
            <span style={{ color: "rgba(52,211,153,0.75)" }}>{result.invited} invited</span>
            {result.skipped > 0 && <span style={{ color: "rgba(255,255,255,0.35)" }}>{result.skipped} skipped (already invited)</span>}
            {result.errors.length > 0 && <span style={{ color: "rgba(248,113,113,0.70)" }}>{result.errors.length} errors</span>}
          </div>
          {result.errors.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 11, color: "rgba(248,113,113,0.55)" }}>
              {result.errors.map((e, i) => (
                <p key={i} style={{ margin: "2px 0" }}>{e.email}: {e.reason}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Existing pending invites */}
      {pendingInvites.length > 0 && (
        <div className="card" style={{ padding: "16px 20px" }}>
          <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)", margin: "0 0 14px" }}>
            Pending invites <span style={{ color: "rgba(255,255,255,0.40)" }}>({pendingInvites.length})</span>
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {pendingInvites.map((inv) => (
              <div
                key={inv.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px", borderRadius: 10,
                  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: inv.status === "activated" ? "rgba(52,211,153,0.70)" : "rgba(255,255,255,0.20)",
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", flex: 1 }}>
                  {inv.display_name || inv.email}
                </span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>{inv.email}</span>
                <span style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 999,
                  background: inv.status === "activated" ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${inv.status === "activated" ? "rgba(52,211,153,0.20)" : "rgba(255,255,255,0.08)"}`,
                  color: inv.status === "activated" ? "rgba(52,211,153,0.70)" : "rgba(255,255,255,0.35)",
                }}>
                  {inv.status === "activated" ? "Activated" : "Pending"}
                </span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.20)" }}>{inv.role}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

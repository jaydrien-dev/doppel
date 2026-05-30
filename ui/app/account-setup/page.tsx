"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

// ─── Icons ───────────────────────────────────────────────────────────────────

const ArrowIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const CheckIcon = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M2.5 7l3 3 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ─── Field ───────────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <label style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.50)" }}>
          {label}
        </label>
        {hint && (
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.22)" }}>{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AccountSetupPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();

  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // Pre-fill name from Clerk
  useEffect(() => {
    if (!user) return;
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
    if (name) setFullName(name);
  }, [user]);

  // If profile already complete, skip to dashboard
  useEffect(() => {
    fetch("/api/user/profile")
      .then((r) => r.json())
      .then((d) => { if (d.profile_complete) router.replace("/dashboard"); })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return;
    setSaving(true);
    try {
      // Save profile to our DB
      await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim() || null,
          bio: bio.trim() || null,
          location: location.trim() || null,
          website: website.trim() || null,
        }),
      });

      // Sync name back to Clerk
      if (user && fullName.trim()) {
        const parts = fullName.trim().split(" ");
        await user.update({
          firstName: parts[0],
          lastName: parts.slice(1).join(" ") || undefined,
        });
      }

      setDone(true);
      setTimeout(() => router.push("/onboarding"), 700);
    } catch {
      setSaving(false);
    }
  }

  if (!isLoaded) return null;

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 20px",
        background: "#080808",
      }}
    >
      {/* Ambient dots */}
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
          backgroundImage: "radial-gradient(rgba(255,255,255,0.055) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, #000 30%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, #000 30%, transparent 80%)",
        }}
      />

      {/* Ambient glow */}
      <div
        style={{
          position: "fixed", top: "10%", left: "50%", transform: "translateX(-50%)",
          width: 600, height: 300, borderRadius: "50%",
          background: "rgba(26,115,232,0.07)", filter: "blur(80px)",
          pointerEvents: "none", zIndex: 0,
        }}
      />

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 480 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <span style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.5px", color: "rgba(255,255,255,0.90)" }}>
            doppel
          </span>
        </div>

        {/* Card */}
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 20,
            padding: "36px 32px",
            backdropFilter: "blur(20px)",
          }}
        >
          <div style={{ marginBottom: 28 }}>
            <p
              style={{
                fontSize: 11, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase",
                color: "rgba(255,255,255,0.25)", marginBottom: 8,
              }}
            >
              Welcome
            </p>
            <h1 style={{ fontSize: 24, fontWeight: 300, color: "rgba(255,255,255,0.88)", margin: 0, lineHeight: 1.3 }}>
              Set up your profile
            </h1>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", marginTop: 8, marginBottom: 0, lineHeight: 1.6 }}>
              This is how people and your clones will know you.
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <Field label="Full name" hint="required">
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Smith"
                required
                autoFocus
                className="input"
                style={{ fontSize: 15 }}
              />
            </Field>

            <Field label="Bio" hint="optional">
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="A sentence or two about what you do."
                rows={3}
                className="input"
                style={{ resize: "none", lineHeight: 1.6 }}
              />
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Location" hint="optional">
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="San Francisco"
                  className="input"
                />
              </Field>
              <Field label="Website" hint="optional">
                <input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://…"
                  type="url"
                  className="input"
                />
              </Field>
            </div>

            <div style={{ marginTop: 8 }}>
              <button
                type="submit"
                disabled={saving || done || !fullName.trim()}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "12px 24px", borderRadius: 12, fontSize: 14, fontWeight: 500,
                  fontFamily: "inherit", cursor: saving || done || !fullName.trim() ? "not-allowed" : "pointer",
                  background: done ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.10)",
                  border: done ? "1px solid rgba(52,211,153,0.25)" : "1px solid rgba(255,255,255,0.14)",
                  color: done ? "rgba(52,211,153,0.85)" : "rgba(255,255,255,0.80)",
                  opacity: saving || !fullName.trim() ? 0.5 : 1,
                  transition: "all 200ms ease",
                }}
              >
                {done ? (
                  <>{CheckIcon} Profile saved — continuing…</>
                ) : saving ? (
                  "Saving…"
                ) : (
                  <>Continue {ArrowIcon}</>
                )}
              </button>
            </div>
          </form>
        </div>

        <p style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.22)", marginTop: 20 }}>
          You can update this any time from your profile page.
        </p>
      </div>
    </div>
  );
}

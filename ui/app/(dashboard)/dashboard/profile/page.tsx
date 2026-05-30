"use client";

import { useEffect, useState } from "react";
import { useUser, UserButton } from "@clerk/nextjs";

// ─── Delete account modal ─────────────────────────────────────────────────────

function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const { user } = useUser();
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!user || confirm !== "DELETE") return;
    setDeleting(true);
    try {
      await user.delete();
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          borderRadius: 16, padding: 28, width: "100%", maxWidth: 440,
          background: "rgba(14,14,14,0.98)", border: "1px solid rgba(248,113,113,0.20)",
          display: "flex", flexDirection: "column", gap: 16,
        }}
      >
        <p style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.85)", margin: 0 }}>
          Delete account
        </p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", lineHeight: 1.6, margin: 0 }}>
          This permanently deletes your account, all clones, training data, and earnings history. There is no recovery.
        </p>
        <label style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", display: "block" }}>
          Type{" "}
          <span style={{ fontFamily: "ui-monospace, Menlo, monospace", color: "rgba(255,255,255,0.60)" }}>
            DELETE
          </span>{" "}
          to confirm
        </label>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="DELETE"
          className="input"
          style={{ fontFamily: "ui-monospace, Menlo, monospace" }}
          autoFocus
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleDelete}
            disabled={confirm !== "DELETE" || deleting}
            style={{
              flex: 1, borderRadius: 12, padding: "10px 0", fontSize: 13, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
              background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.25)",
              color: "rgba(248,113,113,0.80)",
              opacity: (confirm !== "DELETE" || deleting) ? 0.4 : 1,
            }}
          >
            {deleting ? "Deleting…" : "Delete my account"}
          </button>
          <button
            onClick={onClose}
            className="btn btn--ghost"
            style={{ padding: "10px 20px" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Profile page ─────────────────────────────────────────────────────────────

interface UserProfile {
  full_name?: string;
  bio?: string;
  location?: string;
  website?: string;
  dob?: string;
  phone?: string;
  profile_complete?: boolean;
}

export default function ProfilePage() {
  const { user, isLoaded } = useUser();

  const [profile, setProfile] = useState<UserProfile>({});
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Load profile from DB
  useEffect(() => {
    fetch("/api/user/profile")
      .then((r) => r.json())
      .then((data: UserProfile) => {
        setProfile(data);
        setFullName(data.full_name ?? "");
        setBio(data.bio ?? "");
        setLocation(data.location ?? "");
        setWebsite(data.website ?? "");
        setDob(data.dob ?? "");
        setPhone(data.phone ?? "");
      })
      .catch(() => {});
  }, []);

  // Pre-fill name from Clerk if DB has nothing
  useEffect(() => {
    if (!user || fullName) return;
    const clerkName = [user.firstName, user.lastName].filter(Boolean).join(" ");
    if (clerkName) setFullName(clerkName);
  }, [user, fullName]);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim() || null,
          bio: bio.trim() || null,
          location: location.trim() || null,
          website: website.trim() || null,
          dob: dob.trim() || null,
          phone: phone.trim() || null,
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

      setProfile((p) => ({ ...p, full_name: fullName, bio, location, website, dob, phone }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  if (!isLoaded) return null;

  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  return (
    <div className="db-page">
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">Account</p>
          <h1 className="db-h1">Profile</h1>
        </div>
      </div>

      <div style={{ maxWidth: 560 }}>

        {/* Avatar + name header */}
        <div
          className="card"
          style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, padding: "20px 24px" }}
        >
          <UserButton
            appearance={{
              elements: { avatarBox: "w-14 h-14 rounded-full shrink-0" },
            }}
          />
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 16, fontWeight: 500, color: "rgba(255,255,255,0.85)", margin: 0, lineHeight: 1.3 }}>
              {fullName || user?.username || "—"}
            </p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", margin: "2px 0 0" }}>
              {email}
            </p>
          </div>
          <div style={{ marginLeft: "auto", flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.22)" }}>
              Click avatar to change photo
            </span>
          </div>
        </div>

        {/* Personal info */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
          <p className="db-eyebrow" style={{ margin: 0 }}>Personal</p>

          <div>
            <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>
              Full name
            </label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Smith"
              className="input"
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>
              Email address
            </label>
            <input
              value={email}
              readOnly
              className="input"
              style={{ color: "rgba(255,255,255,0.30)", cursor: "not-allowed" }}
            />
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.20)", marginTop: 4, marginBottom: 0 }}>
              Email changes are managed through account security settings.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>
                Date of birth
              </label>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="input"
                style={{ colorScheme: "dark" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>
                Phone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="input"
              />
            </div>
          </div>
        </div>

        {/* Presence */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
          <p className="db-eyebrow" style={{ margin: 0 }}>Presence</p>

          <div>
            <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A sentence or two about what you do."
              rows={3}
              className="input"
              style={{ resize: "none", lineHeight: 1.6 }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>
                Location
              </label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="San Francisco"
                className="input"
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>
                Website
              </label>
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://…"
                type="url"
                className="input"
              />
            </div>
          </div>
        </div>

        {/* Save */}
        <div style={{ marginBottom: 32 }}>
          <button onClick={handleSave} disabled={saving} className="btn btn--primary">
            {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
          </button>
        </div>

        {/* Danger zone */}
        <div
          style={{
            borderRadius: 16, padding: 24, marginBottom: 16,
            background: "rgba(248,113,113,0.04)", border: "1px solid rgba(248,113,113,0.12)",
          }}
        >
          <p
            style={{
              fontSize: 10, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase",
              color: "rgba(248,113,113,0.50)", marginBottom: 4,
            }}
          >
            Danger zone
          </p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", marginBottom: 16 }}>
            Permanently delete your account, all clones, and associated data. This cannot be undone.
          </p>
          <button
            onClick={() => setShowDeleteModal(true)}
            style={{
              borderRadius: 12, padding: "8px 16px", fontSize: 13, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit",
              background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.20)",
              color: "rgba(248,113,113,0.70)",
            }}
          >
            Delete account
          </button>
        </div>

        {showDeleteModal && (
          <DeleteAccountModal onClose={() => setShowDeleteModal(false)} />
        )}
      </div>
    </div>
  );
}

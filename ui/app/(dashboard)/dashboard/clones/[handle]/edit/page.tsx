"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ImageUpload } from "@/components/ui/ImageUpload";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CATEGORIES = [
  { value: "business",    label: "Business" },
  { value: "engineering", label: "Engineering" },
  { value: "design",      label: "Design" },
  { value: "marketing",   label: "Marketing" },
  { value: "finance",     label: "Finance" },
  { value: "legal",       label: "Legal" },
  { value: "healthcare",  label: "Healthcare" },
  { value: "education",   label: "Education" },
  { value: "science",     label: "Science" },
  { value: "other",       label: "Other" },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CloneDetail {
  clone_id: string;
  handle: string;
  display_name: string;
  listing_title?: string;
  listing_description?: string;
  price_per_query: number;
  category?: string;
  access_mode: "private" | "public" | "org_scoped" | "restricted";
  is_listed: boolean;
  subscription_tier: string;
  is_verified: boolean;
  avatar_url?: string;
  listing_banner_url?: string;
}

// ---------------------------------------------------------------------------
// Field label helper
// ---------------------------------------------------------------------------
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.50)", marginBottom: 6 }}>
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function CloneEditPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = use(params);
  const router = useRouter();

  const [clone, setClone] = useState<CloneDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Form state
  const [displayName, setDisplayName]   = useState("");
  const [listingTitle, setListingTitle] = useState("");
  const [description, setDescription]   = useState("");
  const [price, setPrice]               = useState("0.00");
  const [category, setCategory]         = useState("other");
  const [accessMode, setAccessMode]     = useState<"private" | "org_scoped" | "public">("private");
  const [showPublicWarning, setShowPublicWarning] = useState(false);
  const [isListed, setIsListed]         = useState(false);

  const [avatarUrl, setAvatarUrl]         = useState("");
  const [bannerUrl, setBannerUrl]         = useState("");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // Load clone
  useEffect(() => {
    fetch(`/api/clones/${handle}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        setClone(d);
        setDisplayName(d.display_name ?? "");
        setListingTitle(d.listing_title ?? d.display_name ?? "");
        setDescription(d.listing_description ?? "");
        setPrice(String(Math.round((d.price_per_query ?? 0) as number)));
        setCategory(d.category ?? "other");
        setAccessMode(d.access_mode === "public" ? "public" : d.access_mode === "org_scoped" ? "org_scoped" : "private");
        setIsListed(d.is_listed ?? false);
        setAvatarUrl(d.avatar_url ?? "");
        setBannerUrl(d.listing_banner_url ?? "");
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [handle]);

  async function handleSave() {
    if (!clone) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/clones/${handle}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name:        displayName.trim() || clone.display_name,
          listing_title:       listingTitle.trim() || displayName.trim() || clone.display_name,
          listing_description: description,
          price_per_query:     parseInt(price) || 0,
          category,
          access_mode:         accessMode,
          is_listed:           isListed,
          avatar_url:          avatarUrl,
          listing_banner_url:  bannerUrl,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.detail ?? "Failed to save");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      const updated = await res.json();
      setClone(updated);
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Loading / not found
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="db-page">
        <div style={{ height: 40, width: 200, borderRadius: 8, background: "rgba(255,255,255,0.05)", animation: "pulse 2s infinite", marginBottom: 24 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24 }}>
          {[180, 280, 200].map((h, i) => (
            <div key={i} className="card" style={{ height: h, animation: "pulse 2s infinite" }} />
          ))}
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="db-page">
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)" }}>
          Clone not found.{" "}
          <Link href="/dashboard/clones" style={{ color: "rgba(255,255,255,0.60)", textDecoration: "underline", textUnderlineOffset: 2 }}>
            Back to clones
          </Link>
        </p>
      </div>
    );
  }

  const isFree = parseInt(price) === 0;

  return (
    <div className="db-page">
      {/* Page header */}
      <div className="db-page-head">
        <div>
          <p className="db-eyebrow">
            <Link href="/dashboard/clones" style={{ color: "inherit", textDecoration: "none" }}>
              My Clones
            </Link>
            {" "}·{" "}
            {clone?.display_name ?? handle}
          </p>
          <h1 className="db-h1">Edit clone</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {clone?.is_verified && (
            <span style={{
              display: "flex", alignItems: "center", gap: 5,
              fontSize: 11, padding: "4px 10px", borderRadius: 9999,
              color: "rgba(52,211,153,0.80)", background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.20)",
            }}>
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="6" fill="currentColor" opacity="0.15"/>
                <path d="M4.5 7l2 2 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Verified
            </span>
          )}
          <Link href={`/c/${handle}`} className="btn btn--sm">
            Preview chat ↗
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24, alignItems: "flex-start" }}>

        {/* ------------------------------------------------------------------ */}
        {/* Left column: form cards                                             */}
        {/* ------------------------------------------------------------------ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Images */}
          <div className="card">
            <p className="card-title">Images</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <ImageUpload
                value={avatarUrl}
                onChange={setAvatarUrl}
                label="Clone icon"
                hint="Shown on your dashboard clone card. Square. Max 8 MB — compressed automatically."
                aspectRatio="square"
              />
              <ImageUpload
                value={bannerUrl}
                onChange={setBannerUrl}
                label="Marketplace thumbnail"
                hint="Wide banner shown on marketplace listing cards. 2:1 ratio. Max 8 MB."
                aspectRatio="banner"
              />
            </div>
          </div>

          {/* Identity */}
          <div className="card">
            <p className="card-title">Identity</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <FieldLabel>Display name</FieldLabel>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="input"
                  placeholder="e.g. Elan Brightwater"
                />
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 5 }}>
                  How this clone refers to itself in conversation.
                </p>
              </div>
            </div>
          </div>

          {/* Marketplace listing */}
          <div className="card">
            <p className="card-title">Marketplace listing</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <FieldLabel>Listing title</FieldLabel>
                <input
                  type="text"
                  value={listingTitle}
                  onChange={(e) => setListingTitle(e.target.value)}
                  className="input"
                  placeholder={displayName || "e.g. Startup Fundraising Expert"}
                />
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 5 }}>
                  Shown on the marketplace — can differ from the display name.
                </p>
              </div>

              <div>
                <FieldLabel>Category</FieldLabel>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="input"
                  style={{ appearance: "none" }}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value} style={{ background: "#141414", color: "rgba(255,255,255,0.70)" }}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <FieldLabel>Description</FieldLabel>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="What does this clone know? What can people ask it? Be specific — this is your pitch."
                  className="input"
                  style={{ resize: "none" }}
                />
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="card">
            <p className="card-title">Pricing</p>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              {(["free", "paid"] as const).map((p) => {
                const active = p === "free" ? isFree : !isFree;
                return (
                  <button
                    key={p}
                    onClick={() => {
                      if (p === "free") setPrice("0");
                      else if (isFree) setPrice("1");
                    }}
                    style={{
                      flex: 1, padding: 14, borderRadius: 12, cursor: "pointer",
                      fontFamily: "inherit", textAlign: "left",
                      background: active ? "rgba(26,115,232,0.10)" : "rgba(255,255,255,0.04)",
                      border: `1.5px solid ${active ? "rgba(26,115,232,0.5)" : "rgba(255,255,255,0.06)"}`,
                    }}
                  >
                    <p style={{ fontSize: 13, fontWeight: 500, color: active ? "rgba(107,174,255,0.90)" : "rgba(255,255,255,0.60)", marginBottom: 2 }}>
                      {p === "free" ? "Free" : "Paid"}
                    </p>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>
                      {p === "free" ? "Anyone can query at no cost" : "Charge per query"}
                    </p>
                  </button>
                );
              })}
            </div>
            {!isFree && (
              <div>
                <FieldLabel>Credits per query</FieldLabel>
                <div style={{ display: "flex", alignItems: "center", gap: 8, maxWidth: 160 }}>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="1"
                    className="input"
                  />
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.30)", flexShrink: 0 }}>cr</span>
                </div>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 5 }}>
                  Standard clones charge 1 credit. Premium clones can charge more.
                </p>
              </div>
            )}
          </div>

          {/* Access */}
          <div className="card">
            <p className="card-title">Access</p>

            {/* Access mode */}
            <div style={{ display: "flex", gap: 10, marginBottom: accessMode === "public" ? 12 : 20 }}>
              {([
                { mode: "private",    label: "Private",      hint: "Only you can access this clone" },
                { mode: "org_scoped", label: "Organisation",  hint: "Visible to all members of your org" },
                { mode: "public",     label: "Public",        hint: "Anyone with the link can chat" },
              ] as const).map(({ mode, label, hint }) => {
                const active = accessMode === mode;
                const isOrg = mode === "org_scoped";
                const isPub = mode === "public";
                const borderColor = active
                  ? isOrg ? "rgba(107,174,255,0.40)" : isPub ? "rgba(52,211,153,0.35)" : "rgba(255,255,255,0.22)"
                  : "rgba(255,255,255,0.06)";
                const textColor = active
                  ? isOrg ? "rgba(107,174,255,0.90)" : isPub ? "rgba(52,211,153,0.90)" : "rgba(255,255,255,0.85)"
                  : "rgba(255,255,255,0.40)";
                return (
                  <button
                    key={mode}
                    onClick={() => {
                      if (mode === "public" && accessMode !== "public") setShowPublicWarning(true);
                      else if (mode !== "public") setShowPublicWarning(false);
                      setAccessMode(mode);
                    }}
                    style={{
                      flex: 1, padding: 14, borderRadius: 12, cursor: "pointer",
                      fontFamily: "inherit", textAlign: "left",
                      background: active
                        ? isOrg ? "rgba(107,174,255,0.07)" : isPub ? "rgba(52,211,153,0.06)" : "rgba(255,255,255,0.07)"
                        : "rgba(255,255,255,0.03)",
                      border: `1.5px solid ${borderColor}`,
                      transition: "all 160ms",
                    }}
                  >
                    <p style={{ fontSize: 13, fontWeight: 500, color: textColor, marginBottom: 2 }}>
                      {label}
                    </p>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)" }}>{hint}</p>
                  </button>
                );
              })}
            </div>

            {/* Public warning */}
            {accessMode === "public" && showPublicWarning && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 14px", borderRadius: 10, marginBottom: 16,
                background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.20)",
              }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: "rgba(239,68,68,0.70)", flexShrink: 0, marginTop: 1 }}>
                  <path d="M7 2L13 12H1L7 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                  <path d="M7 6v2.5M7 10v.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                <p style={{ fontSize: 12, color: "rgba(239,68,68,0.75)", margin: 0 }}>
                  This clone will be accessible to anyone on the internet — not just your org members.
                </p>
              </div>
            )}

            {/* Listed toggle */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.70)" }}>List on marketplace</p>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                  Make your clone discoverable to anyone on doppel.
                </p>
              </div>
              <button
                onClick={() => setIsListed((v) => !v)}
                style={{
                  position: "relative", width: 44, height: 24, borderRadius: 9999,
                  background: isListed ? "#1A73E8" : "rgba(255,255,255,0.10)",
                  border: "none", cursor: "pointer", flexShrink: 0,
                  transition: "background 180ms ease",
                }}
                aria-label="Toggle listing"
              >
                <span style={{
                  position: "absolute", top: 2,
                  left: isListed ? 22 : 2,
                  width: 20, height: 20, borderRadius: "50%",
                  background: isListed ? "#fff" : "rgba(255,255,255,0.60)",
                  transition: "left 180ms ease",
                }} />
              </button>
            </div>

            {isListed && accessMode !== "public" && (
              <div style={{
                marginTop: 14,
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 12px", borderRadius: 10,
                background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)",
              }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: "rgba(251,191,36,0.70)", flexShrink: 0, marginTop: 1 }}>
                  <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M7 4.5v3M7 9.5v.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                <p style={{ fontSize: 12, color: "rgba(251,191,36,0.65)" }}>
                  Set access to Public above to appear in the marketplace.
                </p>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.15)" }}>
              <p style={{ fontSize: 12, color: "rgba(248,113,113,0.80)" }}>{error}</p>
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Right column: sticky summary + save                                 */}
        {/* ------------------------------------------------------------------ */}
        <div style={{ position: "sticky", top: 32 }}>
          {/* Mini preview */}
          <p className="db-eyebrow" style={{ marginBottom: 12 }}>Preview</p>
          <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.30)" }}>
            {/* Banner header */}
            <div style={{ background: "linear-gradient(135deg, #0F1B3D 0%, #1A3A6B 100%)", padding: "20px 18px 18px", position: "relative", minHeight: 96 }}>
              {bannerUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bannerUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              )}
              <div style={{ position: "relative" }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 11,
                  background: avatarUrl ? "transparent" : "rgba(255,255,255,0.12)",
                  overflow: "hidden",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, color: "rgba(255,255,255,0.60)", marginBottom: 10,
                  border: avatarUrl ? "2px solid rgba(255,255,255,0.20)" : "none",
                }}>
                  {avatarUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : (displayName || clone?.display_name || "?").charAt(0).toUpperCase()
                  }
                </div>
                <p style={{ fontSize: 14, fontWeight: 500, color: "#fff", marginBottom: 3 }}>
                  {listingTitle || displayName || clone?.display_name}
                </p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.50)" }}>
                  {CATEGORIES.find((c) => c.value === category)?.label ?? "Other"}
                </p>
              </div>
            </div>
            {/* Card body */}
            <div style={{ padding: "14px 18px" }}>
              <p style={{ fontSize: 12, color: "#5F6368", lineHeight: 1.5, minHeight: 40 }}>
                {description || "No description yet."}
              </p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(0,0,0,0.07)" }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "#1D1D1F" }}>
                  {isFree ? "Free" : `$${parseFloat(price).toFixed(2)}/query`}
                </span>
                <div style={{ padding: "5px 14px", borderRadius: 9999, background: "#1A73E8", color: "#fff", fontSize: 12, fontWeight: 500 }}>
                  Ask
                </div>
              </div>
            </div>
          </div>

          {/* Clone URL */}
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ color: "rgba(255,255,255,0.20)", flexShrink: 0 }}>
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M3.5 6h5M7 4.5L8.5 6 7 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontFamily: "ui-monospace, Menlo, monospace" }}>
              /c/{handle}
            </span>
          </div>

          {/* Save button */}
          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              className="btn btn--primary"
              onClick={handleSave}
              disabled={saving}
              style={{ width: "100%", justifyContent: "center" }}
            >
              {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
            </button>
            <Link href="/dashboard/clones" className="btn" style={{ width: "100%", justifyContent: "center", textAlign: "center" }}>
              Back to clones
            </Link>
          </div>

          {/* Quick links */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: 8 }}>
            <Link href={`/dashboard/train`} style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", textDecoration: "none" }}>
              Train this clone →
            </Link>
            <Link href="/dashboard/earnings" style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", textDecoration: "none" }}>
              View earnings →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

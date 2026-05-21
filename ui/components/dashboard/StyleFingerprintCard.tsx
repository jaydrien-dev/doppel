import type { StyleFingerprint } from "@/lib/types";

interface StyleFingerprintCardProps {
  fingerprint?: StyleFingerprint | Record<string, never>;
}

function Meter({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", width: 76, flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 4, borderRadius: 9999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 9999, background: "rgba(255,255,255,0.25)" }} />
      </div>
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.30)", width: 30, textAlign: "right", flexShrink: 0 }}>
        {pct}%
      </span>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="glass" style={{ borderRadius: 10, padding: "3px 10px", fontSize: 11, color: "rgba(255,255,255,0.40)" }}>
      {children}
    </span>
  );
}

export function StyleFingerprintCard({ fingerprint }: StyleFingerprintCardProps) {
  const hasData =
    fingerprint &&
    typeof (fingerprint as StyleFingerprint).preferred_formality === "number";

  const fp = fingerprint as StyleFingerprint;

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.30)", display: "inline-block" }} />
        <p className="card-title" style={{ margin: 0 }}>Writing style</p>
      </div>

      {!hasData ? (
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.30)", padding: "4px 0" }}>
          Style profile will appear after your first ingestion.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Meters */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Meter label="Formality" value={fp.preferred_formality} />
            <Meter label="Directness" value={fp.directness} />
            <Meter label="Warmth" value={fp.warmth} />
            <Meter label="Vocabulary" value={fp.vocabulary_richness} />
          </div>

          {/* Boolean flags */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingTop: 4 }}>
            {fp.uses_contractions && <Tag>Contractions</Tag>}
            {fp.uses_bullet_points && <Tag>Lists</Tag>}
            {fp.uses_emojis && <Tag>Emojis</Tag>}
            <Tag>{fp.response_length_preference ?? "medium"} length</Tag>
          </div>

          {/* Signature phrases */}
          {fp.signature_phrases?.length > 0 && (
            <div>
              <p className="db-eyebrow" style={{ marginBottom: 8 }}>Signature phrases</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {fp.signature_phrases.slice(0, 6).map((p, i) => (
                  <span
                    key={i}
                    className="glass"
                    style={{ borderRadius: 10, padding: "3px 10px", fontSize: 12, color: "rgba(255,255,255,0.50)" }}
                  >
                    "{p}"
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

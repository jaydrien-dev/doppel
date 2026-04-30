import type { StyleFingerprint } from "@/lib/types";

interface StyleFingerprintCardProps {
  fingerprint?: StyleFingerprint | Record<string, never>;
}

function Meter({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-white/40 w-20 shrink-0">{label}</span>
      <div className="flex-1 h-px bg-white/[0.08] rounded-full overflow-hidden relative">
        <div
          className="absolute inset-y-0 left-0 h-full bg-white/30 rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-white/30 w-8 text-right shrink-0">{pct}%</span>
    </div>
  );
}

export function StyleFingerprintCard({ fingerprint }: StyleFingerprintCardProps) {
  const hasData =
    fingerprint &&
    typeof (fingerprint as StyleFingerprint).preferred_formality === "number";

  const fp = fingerprint as StyleFingerprint;

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-2 h-2 rounded-full bg-white/30" />
        <h2 className="text-sm font-medium text-white/60">Writing style</h2>
      </div>

      {!hasData ? (
        <div className="text-sm text-white/30 py-2">
          Style profile will appear after your first ingestion.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Meters */}
          <div className="flex flex-col gap-3">
            <Meter label="Formality" value={fp.preferred_formality} />
            <Meter label="Directness" value={fp.directness} />
            <Meter label="Warmth" value={fp.warmth} />
            <Meter label="Vocabulary" value={fp.vocabulary_richness} />
          </div>

          {/* Boolean flags */}
          <div className="flex flex-wrap gap-2 pt-2">
            {fp.uses_contractions && <Tag>Contractions</Tag>}
            {fp.uses_bullet_points && <Tag>Lists</Tag>}
            {fp.uses_emojis && <Tag>Emojis</Tag>}
            <Tag>{fp.response_length_preference ?? "medium"} length</Tag>
          </div>

          {/* Phrases */}
          {fp.signature_phrases?.length > 0 && (
            <div>
              <p className="text-[11px] text-white/30 mb-2 uppercase tracking-wider">Signature phrases</p>
              <div className="flex flex-wrap gap-1.5">
                {fp.signature_phrases.slice(0, 6).map((p, i) => (
                  <span key={i} className="glass rounded-lg px-2.5 py-1 text-xs text-white/50">
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

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="glass rounded-lg px-2.5 py-1 text-[11px] text-white/40">{children}</span>
  );
}

"use client";

import { useRef, useState } from "react";

interface ImageUploadProps {
  value: string;              // current data URL or empty string
  onChange: (dataUrl: string) => void;
  label: string;
  hint?: string;
  aspectRatio?: "square" | "banner"; // square=1:1 200px, banner=2:1 640x320
}

/** Compress an image file to a base64 data URL using Canvas. */
async function compressImage(file: File, maxW: number, maxH: number, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const ratio = Math.min(maxW / width, maxH / height, 1);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function ImageUpload({ value, onChange, label, hint, aspectRatio = "square" }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSquare = aspectRatio === "square";
  const previewW = isSquare ? 72 : 160;
  const previewH = isSquare ? 72 : 80;
  const maxW = isSquare ? 256 : 640;
  const maxH = isSquare ? 256 : 320;

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) { setError("Image files only."); return; }
    if (file.size > 8 * 1024 * 1024) { setError("Max 8 MB."); return; }
    setError(null);
    setLoading(true);
    try {
      const dataUrl = await compressImage(file, maxW, maxH);
      // Rough size check after compression
      if (dataUrl.length > 600_000) { setError("Image still too large after compression. Try a smaller file."); return; }
      onChange(dataUrl);
    } catch {
      setError("Failed to process image.");
    } finally {
      setLoading(false);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.50)", marginBottom: 8 }}>
        {label}
      </label>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        {/* Preview */}
        <div
          style={{
            width: previewW, height: previewH, flexShrink: 0,
            borderRadius: isSquare ? 12 : 10,
            overflow: "hidden",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative",
          }}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ color: "rgba(255,255,255,0.20)" }}>
              <rect x="2" y="4" width="16" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.3"/>
              <circle cx="7.5" cy="8.5" r="1.5" fill="currentColor" opacity="0.5"/>
              <path d="M2.5 14l4-4 3 3 2.5-2.5 3.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
          {loading && (
            <div style={{
              position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{
                width: 16, height: 16, borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.15)",
                borderTopColor: "rgba(255,255,255,0.70)",
                animation: "spin 0.7s linear infinite",
              }} />
            </div>
          )}
        </div>

        {/* Drop zone + buttons */}
        <div
          style={{ flex: 1 }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={loading}
              style={{
                padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.65)",
                fontFamily: "inherit", fontSize: 12, cursor: "pointer",
              }}
            >
              {value ? "Change" : "Upload"}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange("")}
                style={{
                  padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(248,113,113,0.15)",
                  background: "transparent", color: "rgba(248,113,113,0.55)",
                  fontFamily: "inherit", fontSize: 12, cursor: "pointer",
                }}
              >
                Remove
              </button>
            )}
          </div>
          {hint && (
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", lineHeight: 1.5 }}>{hint}</p>
          )}
          {error && (
            <p style={{ fontSize: 11, color: "rgba(248,113,113,0.70)", marginTop: 4 }}>{error}</p>
          )}
          <input ref={inputRef} type="file" accept="image/*" onChange={onInputChange} style={{ display: "none" }} />
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClone } from "@/lib/hooks/useClone";
import { createClone } from "@/lib/api";
import { BrainHealthCard } from "@/components/dashboard/BrainHealthCard";
import { StyleFingerprintCard } from "@/components/dashboard/StyleFingerprintCard";
import { CloneQualityCard } from "@/components/dashboard/CloneQualityCard";

export default function DashboardPage() {
  const { clone, isLoading, mutate } = useClone();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-5 h-5 rounded-full border border-white/20 border-t-white/60 animate-spin" />
      </div>
    );
  }

  if (!clone) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="glass rounded-2xl p-8 w-full max-w-md">
          {!creating ? (
            <>
              <h1 className="text-xl font-light text-white/85 mb-2">Create your clone</h1>
              <p className="text-sm text-white/40 mb-7 leading-relaxed">
                Your digital consciousness — a chatbot that thinks and sounds exactly like you.
              </p>
              <button
                onClick={() => setCreating(true)}
                className="glass-md hover:glass-hi rounded-xl px-5 py-3 text-sm text-white/70 hover:text-white/90 transition-all"
              >
                Get started →
              </button>
            </>
          ) : (
            <>
              <h1 className="text-xl font-light text-white/85 mb-6">Set up your clone</h1>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">Display name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full glass rounded-xl px-4 py-2.5 text-sm text-white/85 placeholder:text-white/25 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">
                    Handle{" "}
                    <span className="text-white/25">· your public URL: /c/your-handle</span>
                  </label>
                  <input
                    type="text"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="jane-smith"
                    className="w-full glass rounded-xl px-4 py-2.5 text-sm text-white/85 placeholder:text-white/25 outline-none"
                  />
                </div>
                {error && <p className="text-xs text-white/40">{error}</p>}
                <button
                  disabled={submitting || !handle || !name}
                  onClick={async () => {
                    setSubmitting(true);
                    setError("");
                    try {
                      await createClone({ handle, display_name: name });
                      router.push("/onboarding");
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Failed to create clone");
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  className="glass-md hover:glass-hi rounded-xl px-5 py-3 text-sm text-white/70 hover:text-white/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? "Creating…" : "Create clone →"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-light text-white/85">{clone.display_name}</h1>
        <p className="text-sm text-white/35 mt-1">@{clone.handle}</p>
      </div>

      <div className="flex flex-col gap-5">
        <BrainHealthCard cloneId={clone.clone_id} lastUpdated={clone.updated_at} />
        <div className="grid grid-cols-2 gap-5">
          <CloneQualityCard cloneId={clone.clone_id} />
          <StyleFingerprintCard fingerprint={clone.style_fingerprint} />
        </div>
      </div>
    </div>
  );
}

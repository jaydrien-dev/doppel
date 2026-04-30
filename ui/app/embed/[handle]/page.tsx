import { notFound } from "next/navigation";
import type { ClonePublicInfo } from "@/lib/types";
import { PublicChatClient } from "@/app/c/[handle]/PublicChatClient";

const FASTAPI = process.env.FASTAPI_URL ?? "http://localhost:8000";

async function getClone(handle: string): Promise<ClonePublicInfo | null> {
  const res = await fetch(`${FASTAPI}/clones/${handle}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function EmbedPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const clone = await getClone(handle);

  if (!clone || clone.access_mode === "private") notFound();

  return (
    <div className="h-dvh flex flex-col bg-[#080808]">
      {/* Minimal clone header */}
      <div className="px-4 py-3 flex items-center gap-2.5 border-b border-white/[0.06] shrink-0">
        <div className="w-7 h-7 rounded-xl glass-md flex items-center justify-center shrink-0">
          <span className="text-[11px] font-medium text-white/50">
            {clone.display_name[0]}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-sm text-white/75 truncate">{clone.display_name}</p>
          <p className="text-[10px] text-white/25">AI clone · Powered by Doppel</p>
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 overflow-hidden">
        <PublicChatClient clone={clone} />
      </div>

      {/* Footer */}
      <div className="py-1.5 text-center border-t border-white/[0.04] shrink-0">
        <p className="text-[9px] text-white/15">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white/30 transition-colors"
          >
            doppel.ai
          </a>
          {" · "}
          <a
            href="/sign-up"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white/30 transition-colors"
          >
            Create your clone →
          </a>
        </p>
      </div>
    </div>
  );
}

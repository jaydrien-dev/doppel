import { notFound, redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import type { ClonePublicInfo } from "@/lib/types";
import { PublicChatClient } from "./PublicChatClient";

const FASTAPI = process.env.FASTAPI_URL ?? "http://localhost:8000";

interface CloneServerInfo extends ClonePublicInfo {
  allowed_emails: string[];
}

async function getClone(handle: string): Promise<CloneServerInfo | null> {
  const res = await fetch(`${FASTAPI}/clones/${handle}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json();
}

export default async function PublicClonePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const fullClone = await getClone(handle);

  if (!fullClone) notFound();

  if (fullClone.access_mode === "private") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4">
        <div className="glass rounded-2xl p-10 text-center max-w-sm w-full">
          <div className="w-12 h-12 rounded-2xl glass-md flex items-center justify-center mx-auto mb-5">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="4" y="9" width="12" height="9" rx="2" stroke="white" strokeOpacity="0.4" strokeWidth="1.5"/>
              <path d="M7 9V6a3 3 0 016 0v3" stroke="white" strokeOpacity="0.4" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="text-lg font-medium text-white/80 mb-2">{fullClone.display_name}</h1>
          <p className="text-sm text-white/35">This clone is private.</p>
        </div>
        <DoppelFooter />
      </div>
    );
  }

  if (fullClone.access_mode === "allowlist") {
    const { userId } = await auth();

    if (!userId) {
      redirect(`/sign-in?redirect_url=/c/${handle}`);
    }

    const user = await currentUser();
    const userEmail = user?.emailAddresses.find(
      (e) => e.id === user.primaryEmailAddressId
    )?.emailAddress ?? user?.emailAddresses[0]?.emailAddress;

    const isAllowed = userEmail && fullClone.allowed_emails.includes(userEmail.toLowerCase());

    if (!isAllowed) {
      return (
        <div className="min-h-dvh flex flex-col items-center justify-center px-4">
          <div className="glass rounded-2xl p-10 text-center max-w-sm w-full">
            <div className="w-12 h-12 rounded-2xl glass-md flex items-center justify-center mx-auto mb-5">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="7" stroke="white" strokeOpacity="0.4" strokeWidth="1.5"/>
                <path d="M7 10h6M10 7v6" stroke="white" strokeOpacity="0.4" strokeWidth="1.5" strokeLinecap="round" transform="rotate(45 10 10)"/>
              </svg>
            </div>
            <h1 className="text-lg font-medium text-white/80 mb-2">{fullClone.display_name}</h1>
            <p className="text-sm text-white/35">You don&apos;t have access to this clone.</p>
            {userEmail && (
              <p className="text-xs text-white/20 mt-2">{userEmail}</p>
            )}
          </div>
          <DoppelFooter />
        </div>
      );
    }
  }

  // Strip allowed_emails before passing to client component
  const clone: ClonePublicInfo = {
    clone_id: fullClone.clone_id,
    display_name: fullClone.display_name,
    handle: fullClone.handle,
    access_mode: fullClone.access_mode,
  };

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 glass border-b border-white/[0.06] flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl glass-md flex items-center justify-center">
          <span className="text-xs font-medium text-white/50">{clone.display_name[0]}</span>
        </div>
        <div>
          <p className="text-sm font-medium text-white/80">{clone.display_name}</p>
          <p className="text-[11px] text-white/30">@{clone.handle}</p>
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 overflow-hidden">
        <PublicChatClient clone={clone} />
      </div>

      <DoppelFooter inline />
    </div>
  );
}

function DoppelFooter({ inline }: { inline?: boolean }) {
  return (
    <div className={`${inline ? "py-2" : "mt-8"} text-center`}>
      <p className="text-[10px] text-white/20">
        Powered by{" "}
        <span className="text-white/35 font-medium">Doppel</span>
        {" · "}
        <a href="/sign-up" className="text-white/35 hover:text-white/55 transition-colors">
          Create yours →
        </a>
      </p>
    </div>
  );
}

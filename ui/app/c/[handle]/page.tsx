import { notFound, redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import type { ClonePublicInfo } from "@/lib/types";
import { PublicChatClient } from "./PublicChatClient";

const FASTAPI = process.env.FASTAPI_URL ?? "http://localhost:8000";

interface CloneServerInfo extends ClonePublicInfo {
  allowed_emails: string[];
  is_onboarding_resource?: boolean;
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
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 16px" }}>
        <div className="glass" style={{ borderRadius: 20, padding: 40, textAlign: "center", maxWidth: 360, width: "100%" }}>
          <div className="glass-md" style={{ width: 48, height: 48, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="4" y="9" width="12" height="9" rx="2" stroke="white" strokeOpacity="0.4" strokeWidth="1.5"/>
              <path d="M7 9V6a3 3 0 016 0v3" stroke="white" strokeOpacity="0.4" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 style={{ fontSize: 17, fontWeight: 500, color: "rgba(255,255,255,0.80)", marginBottom: 8 }}>{fullClone.display_name}</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", margin: 0 }}>This clone is private.</p>
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
        <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 16px" }}>
          <div className="glass" style={{ borderRadius: 20, padding: 40, textAlign: "center", maxWidth: 360, width: "100%" }}>
            <div className="glass-md" style={{ width: 48, height: 48, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="7" stroke="white" strokeOpacity="0.4" strokeWidth="1.5"/>
                <path d="M7 10h6M10 7v6" stroke="white" strokeOpacity="0.4" strokeWidth="1.5" strokeLinecap="round" transform="rotate(45 10 10)"/>
              </svg>
            </div>
            <h1 style={{ fontSize: 17, fontWeight: 500, color: "rgba(255,255,255,0.80)", marginBottom: 8 }}>{fullClone.display_name}</h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", margin: 0 }}>You don&apos;t have access to this clone.</p>
            {userEmail && (
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.20)", marginTop: 8 }}>{userEmail}</p>
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
    <div style={{ height: "100dvh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <PublicChatClient clone={clone} isOnboardingResource={fullClone.is_onboarding_resource} />
    </div>
  );
}

function DoppelFooter({ inline }: { inline?: boolean }) {
  return (
    <div style={{ padding: inline ? "8px 0" : "32px 0 0", textAlign: "center" }}>
      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.20)", margin: 0 }}>
        Powered by{" "}
        <span style={{ color: "rgba(255,255,255,0.35)", fontWeight: 500 }}>Doppel</span>
        {" · "}
        <a href="/sign-up" style={{ color: "rgba(255,255,255,0.35)" }}>
          Create yours →
        </a>
      </p>
    </div>
  );
}

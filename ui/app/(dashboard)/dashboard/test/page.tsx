"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ApprovalsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/dashboard/tasks"); }, [router]);
  return null;
}

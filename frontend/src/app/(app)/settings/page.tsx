"use client";

// /settings opens the first page this member may change: the members for the admin, else Everyday.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/components/Shell";

export default function SettingsIndex() {
  const me = useMe();
  const router = useRouter();
  useEffect(() => {
    router.replace(me.role === "admin" ? "/settings/members" : "/settings/everyday");
  }, [me.role, router]);
  return null;
}

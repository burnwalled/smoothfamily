"use client";

// Documents live in the vault since 2.8.1 (its Documents view). A member without the vault keeps
// this page for them.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMe } from "@/components/Shell";
import Documents from "@/components/vault/Documents";

export default function DocumentsPage() {
  const me = useMe();
  const router = useRouter();
  const inVault = me.apps.includes("photos");
  useEffect(() => {
    if (inVault) router.replace("/vault?view=document");
  }, [inVault, router]);
  return inVault ? null : <Documents />;
}

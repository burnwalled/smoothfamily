"use client";

// Photos is a view in the vault since 2.8.1; old links land there.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PhotosPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/vault?view=photo");
  }, [router]);
  return null;
}

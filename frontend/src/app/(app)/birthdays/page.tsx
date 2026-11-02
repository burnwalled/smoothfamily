"use client";

// Birthdays moved in 2.8.2: the wish lists and gift planning are in Lists, the register of people in
// the family's settings. Old links land in Lists.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BirthdaysPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/lists");
  }, [router]);
  return null;
}

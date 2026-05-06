"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const SESSION_KEY = "boet-family-bootstrap-ran";

export function FamilyBootstrap() {
  const { isSignedIn, getToken } = useAuth();

  useEffect(() => {
    async function ensureFamily() {
      if (!isSignedIn || !API_URL || sessionStorage.getItem(SESSION_KEY) === "1") {
        return;
      }

      try {
        const token = await getToken();
        if (!token) {
          return;
        }

        await fetch(`${API_URL}/api/v1/families`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // Best-effort bootstrap; user can continue and retry next app load.
      }
    }

    void ensureFamily();
  }, [getToken, isSignedIn]);

  return null;
}

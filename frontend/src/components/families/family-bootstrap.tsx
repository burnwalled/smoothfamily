"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const SESSION_KEY = "boet-family-bootstrap-ran";

function resolveApiUrl(rawValue: string | undefined): string | undefined {
  if (!rawValue) {
    return undefined;
  }

  try {
    const parsed = new URL(rawValue);
    if (parsed.hostname === "localhost") {
      parsed.hostname = "127.0.0.1";
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return rawValue;
  }
}

export function FamilyBootstrap() {
  const { isSignedIn, getToken } = useAuth();
  const apiUrl = resolveApiUrl(API_URL);

  useEffect(() => {
    async function ensureFamily() {
      if (
        !isSignedIn ||
        !apiUrl ||
        sessionStorage.getItem(SESSION_KEY) === "1"
      ) {
        return;
      }

      try {
        const token = await getToken();
        if (!token) {
          return;
        }

        await fetch(`${apiUrl}/api/v1/families`, {
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
  }, [apiUrl, getToken, isSignedIn]);

  return null;
}

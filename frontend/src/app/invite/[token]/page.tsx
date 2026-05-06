"use client";

import { SignInButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type InviteState = "idle" | "loading" | "success" | "error";

type InviteAcceptResponse = {
  family_id: string;
  family_name: string;
  role: string;
  already_member: boolean;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function InviteAcceptPage() {
  const { isSignedIn, getToken } = useAuth();
  const params = useParams<{ token: string }>();
  const [state, setState] = useState<InviteState>("idle");
  const [message, setMessage] = useState<string>("Förbereder inbjudan...");
  const [result, setResult] = useState<InviteAcceptResponse | null>(null);
  const hasStartedRef = useRef(false);

  const token = useMemo(() => {
    const rawToken = params.token ?? "";
    return decodeURIComponent(rawToken);
  }, [params.token]);

  useEffect(() => {
    async function acceptInvite() {
      if (!token) {
        setState("error");
        setMessage("Inbjudningslanken ar ogiltig.");
        return;
      }

      if (!isSignedIn || !API_URL || hasStartedRef.current) {
        return;
      }
      hasStartedRef.current = true;
      setState("loading");
      setMessage("Accepterar inbjudan...");

      try {
        const bearer = await getToken();
        if (!bearer) {
          setState("error");
          setMessage("Kunde inte läsa inloggningstoken.");
          return;
        }

        const response = await fetch(
          `${API_URL}/api/v1/invites/${encodeURIComponent(token)}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${bearer}`,
            },
            cache: "no-store",
          },
        );

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            detail?: string;
          };
          setState("error");
          setMessage(payload.detail ?? "Kunde inte acceptera inbjudan.");
          return;
        }

        const payload = (await response.json()) as InviteAcceptResponse;
        setResult(payload);
        setState("success");
        setMessage(
          payload.already_member
            ? `Du är redan medlem i ${payload.family_name}.`
            : `Du är nu medlem i ${payload.family_name}.`,
        );
      } catch {
        setState("error");
        setMessage("Nätverksfel vid accepterande av inbjudan.");
      }
    }

    void acceptInvite();
  }, [getToken, isSignedIn, token]);

  if (!isSignedIn) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-semibold">Inbjudan till familj</h1>
        <p className="text-sm text-muted-foreground">
          Logga in för att acceptera din inbjudan.
        </p>
        <SignInButton>
          <button
            type="button"
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            Logga in
          </button>
        </SignInButton>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Inbjudan till familj</h1>
      <p className="text-sm text-muted-foreground">{message}</p>

      {state === "loading" || state === "idle" ? (
        <div className="h-2 w-56 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/2 animate-pulse bg-foreground" />
        </div>
      ) : null}

      {state === "success" ? (
        <div className="space-y-2">
          <p className="text-sm">
            Familj: <span className="font-medium">{result?.family_name}</span>
          </p>
          <p className="text-sm">
            Roll: <span className="font-medium">{result?.role}</span>
          </p>
          <Link
            href="/app"
            className="inline-block rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            Öppna appen
          </Link>
        </div>
      ) : null}

      {state === "error" ? (
        <Link
          href="/"
          className="inline-block rounded-md border px-4 py-2 text-sm font-medium"
        >
          Till startsidan
        </Link>
      ) : null}
    </main>
  );
}

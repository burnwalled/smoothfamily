import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { getTranslations } from "next-intl/server";

export default async function HomePage() {
  const t = await getTranslations();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <span className="text-lg font-semibold tracking-tight">{t("common.appName")}</span>
        <div className="flex items-center gap-3">
          <SignedOut>
            <SignInButton />
            <SignUpButton />
          </SignedOut>
          <SignedIn>
            <Link href="/app" className="text-sm underline underline-offset-4">
              {t("auth.openApp")}
            </Link>
            <UserButton />
          </SignedIn>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center p-8">
        <div className="max-w-2xl text-center">
          <h1 className="mb-4 text-5xl font-medium tracking-tight">{t("common.appName")}</h1>
          <p className="mb-8 text-lg text-muted-foreground">{t("common.tagline")}</p>
          <SignedOut>
            <SignUpButton>
              <button className="rounded-md bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-80 transition-opacity">
                {t("landing.cta")}
              </button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <Link
              href="/app"
              className="rounded-md bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-80 transition-opacity"
            >
              {t("landing.openApp")}
            </Link>
          </SignedIn>
        </div>
      </main>
    </div>
  );
}

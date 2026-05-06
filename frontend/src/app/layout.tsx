import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "../lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "Boet",
  description: "Familjeappen som faktiskt hjälper er hålla ordning på vardagen.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = getMessages(locale);

  return (
    <ClerkProvider afterSignInUrl="/app" afterSignUpUrl="/app">
      <html lang={locale} suppressHydrationWarning>
        <body className="min-h-screen bg-background font-sans text-foreground antialiased">
          <NextIntlClientProvider locale={locale} messages={messages}>
            {children}
          </NextIntlClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}

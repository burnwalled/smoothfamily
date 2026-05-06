import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "../components/theme/theme-provider";
import { getLocale, getMessages } from "../lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "Boet",
  description:
    "Familjeappen som faktiskt hjälper er hålla ordning på vardagen.",
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
          <ThemeProvider>
            <NextIntlClientProvider locale={locale} messages={messages}>
              {children}
            </NextIntlClientProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}

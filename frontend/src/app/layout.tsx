import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Boet",
  description: "Familjeappen som faktiskt hjälper er hålla ordning på vardagen.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}

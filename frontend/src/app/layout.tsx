import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import Providers from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smooth Family",
  description: "Your family's own portal — runs in your home, not in the cloud.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#1E3328",
  // Lets the bottom bar pad itself above the phone's home indicator (env(safe-area-inset-bottom)).
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Rendered per request: the page's scripts carry the nonce from middleware.ts.
  await headers();
  return (
    <html lang="en" data-theme="forest">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

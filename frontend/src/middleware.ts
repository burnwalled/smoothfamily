// Content-Security-Policy (2.9.0): the browser only runs scripts from this server that carry the
// page's one-time nonce, and only talks to this server. If a bug ever let someone's text be read as
// HTML, an injected script would still not run.
//
// CSP_MODE=enforce blocks; anything else only reports (to /api/csp-report) – the safe way to start.
import { NextRequest, NextResponse } from "next/server";

export function policy(nonce: string): string {
  return [
    "default-src 'self'",
    // Next's own scripts get the nonce; what they load is trusted through it. wasm: the barcode reader.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'`,
    // React writes style attributes; styles can't run code.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' blob:",
    // PDFs and photos shown from this server; office previews are drawn as HTML.
    "frame-src 'self' blob: https://open.spotify.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "report-uri /api/csp-report",
  ].join("; ");
}

export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = policy(nonce);
  // Next reads the nonce from the request's policy and puts it on its scripts.
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(process.env.CSP_MODE === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only – not the API, Next's static files or the files in public/.
      source: "/((?!api/|_next/static|_next/image|favicon|icon-|logo-|avatars/|zxing/|sw.js|manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

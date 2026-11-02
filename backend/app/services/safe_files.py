"""Serving files people put in the vault: only pictures and PDFs are shown in the browser; anything
else (a web page, a script, an SVG …) is sent as a download of plain bytes, so it can never run as
part of the app."""

INLINE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"}


def headers_for(content_type: str, filename: str, download: bool) -> tuple[str, dict[str, str]]:
    """(the media type to send, the headers) for a file."""
    safe = filename.replace('"', "").replace("\\", "").replace("\r", "").replace("\n", "")
    inline = not download and content_type in INLINE_TYPES
    media_type = content_type if content_type in INLINE_TYPES else "application/octet-stream"
    headers = {"Content-Disposition": f'{"inline" if inline else "attachment"}; filename="{safe}"', "X-Content-Type-Options": "nosniff"}
    if media_type == "application/octet-stream":
        # Belt and braces: even if a browser opened it, nothing in it may run.
        headers["Content-Security-Policy"] = "sandbox; default-src 'none'"
    return media_type, headers

"""Uploads without reading more than allowed into memory: a request that says it's too big is refused
before its body is parsed, and a file is read in pieces and dropped the moment it passes the limit."""
from fastapi import Depends, HTTPException, Request, UploadFile

CHUNK = 1024 * 1024
# The multipart wrapping around a file.
SLACK = 256 * 1024


def limit_body(max_bytes: int):
    """A dependency: refuses a request whose Content-Length says the body is larger than this."""

    async def check(request: Request) -> None:
        length = request.headers.get("content-length", "")
        if length.isdigit() and int(length) > max_bytes + SLACK:
            raise HTTPException(status_code=413, detail=f"The file is larger than {max_bytes // (1024 * 1024)} MB")

    return Depends(check)


def upload_size(file: UploadFile) -> int | None:
    """What the upload says it is, when known."""
    return file.size


async def read_upload(file: UploadFile, limit: int, status: int = 413, detail: str | None = None) -> bytes:
    """The whole file, as long as it's within `limit`; otherwise refused before it's all in memory."""
    message = detail or f"The file is larger than {limit // (1024 * 1024)} MB"
    if file.size is not None and file.size > limit:
        raise HTTPException(status_code=status, detail=message)
    await file.seek(0)
    body = bytearray()
    while chunk := await file.read(CHUNK):
        body.extend(chunk)
        if len(body) > limit:
            raise HTTPException(status_code=status, detail=message)
    return bytes(body)

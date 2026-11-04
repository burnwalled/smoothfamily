"""A GET of an address someone in the family gave us (a calendar subscription, a page to import): only
http(s), only public addresses – never the server itself, the NAS, Home Assistant or anything else on
the home network – checked again on every redirect, and never more than `limit` bytes."""
import asyncio
import ipaddress
import socket
from urllib.parse import urljoin, urlparse

import httpx

MAX_REDIRECTS = 4
USER_AGENT = "SmoothFamily/1.0 (+https://github.com/burnwalled/smoothfamily)"


class UnsafeAddress(ValueError):
    """The address isn't one the server may fetch."""


async def check_public(host: str) -> None:
    """Every address the name resolves to must be a public one."""
    try:
        ip = ipaddress.ip_address(host.strip("[]"))
        addresses = [ip]
    except ValueError:
        try:
            infos = await asyncio.get_running_loop().getaddrinfo(host, None, type=socket.SOCK_STREAM)
        except socket.gaierror as exc:
            raise UnsafeAddress("The address could not be found") from exc
        addresses = [ipaddress.ip_address(info[4][0]) for info in infos]
    if not addresses:
        raise UnsafeAddress("The address could not be found")
    for ip in addresses:
        if not ip.is_global or ip.is_multicast:
            raise UnsafeAddress("Only public web addresses can be fetched")


async def safe_get(url: str, limit: int, timeout: float = 15.0) -> bytes:
    """The body of a public http(s) address, at most `limit` bytes. Raises UnsafeAddress for an
    address the server may not fetch, httpx.HTTPError for one that fails."""
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False, headers={"User-Agent": USER_AGENT}) as client:
        for _ in range(MAX_REDIRECTS + 1):
            parsed = urlparse(url)
            if parsed.scheme not in {"http", "https"} or not parsed.hostname:
                raise UnsafeAddress("Only http and https addresses can be fetched")
            await check_public(parsed.hostname)
            async with client.stream("GET", url) as resp:
                if resp.is_redirect and "location" in resp.headers:
                    url = urljoin(url, resp.headers["location"])
                    continue
                resp.raise_for_status()
                body = bytearray()
                async for chunk in resp.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > limit:
                        raise UnsafeAddress("The answer is too large")
                return bytes(body)
    raise UnsafeAddress("Too many redirects")

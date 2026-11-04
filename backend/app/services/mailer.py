"""E-mail from the server (3.4.0), through a mail service the server admin sets up (Server →
Address and services → E-mail). Used for what can't reach someone through the app – a party's
guests who asked for updates. Passwords are stored encrypted; nothing is sent until it's set up.

Four kinds of account, any or all of them set up: Gmail (an app password; the mail comes from the
Gmail address), Brevo (its SMTP relay and key; from an address verified there, such as one on the
family's own domain), Exchange Online (an app registration sending through Microsoft Graph – basic
SMTP sign-in is being retired there) and any other SMTP server. The server admin chooses which one the family
running the server sends with, and which one – if any – the hosted families may use.
"""
import asyncio
import json
import smtplib
import ssl
import time
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from urllib.parse import quote

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppSetting, Family
from app.services.crypto import decrypt_token, encrypt_token

SETTING_KEY = "smtp"
TIMEOUT = 20
PROVIDERS = ("gmail", "brevo", "exchange", "smtp")
# The fixed part of each service; "smtp" is all the admin's own.
PRESETS = {
    "gmail": {"host": "smtp.gmail.com", "port": 587, "security": "starttls"},
    "brevo": {"host": "smtp-relay.brevo.com", "port": 587, "security": "starttls"},
    "exchange": {"transport": "graph"},
}
GRAPH = "https://graph.microsoft.com/v1.0"
LOGIN = "https://login.microsoftonline.com"
# Access tokens by (tenant, client, secret's hash), until they run out.
_tokens: dict[tuple[str, str, int], tuple[float, str]] = {}


class MailError(Exception):
    pass


async def _row(db: AsyncSession) -> AppSetting | None:
    return (await db.execute(select(AppSetting).where(AppSetting.key == SETTING_KEY))).scalar_one_or_none()


async def load(db: AsyncSession) -> dict:
    """{accounts: {provider: {...}}, owner: provider | "", hosted: provider | ""}."""
    row = await _row(db)
    empty = {"accounts": {}, "owner": "", "hosted": ""}
    if row is None or not row.value:
        return empty
    try:
        value = json.loads(decrypt_token(row.value))
    except Exception:
        return empty
    if "accounts" not in value:  # one SMTP server, as before
        return {"accounts": {"smtp": value}, "owner": "smtp", "hosted": ""}
    return {**empty, **value}


async def store(db: AsyncSession, value: dict) -> None:
    row = await _row(db)
    if not value["accounts"]:
        if row is not None:
            await db.delete(row)
    elif row is None:
        db.add(AppSetting(key=SETTING_KEY, value=encrypt_token(json.dumps(value))))
    else:
        row.value = encrypt_token(json.dumps(value))
    await db.commit()


def account(value: dict, provider: str) -> dict | None:
    conf = value["accounts"].get(provider)
    return {**conf, **PRESETS.get(provider, {})} if conf else None


async def for_family(db: AsyncSession, family: Family | None) -> dict | None:
    """The account a family's mail goes out through – none for a demo family, or a hosted one
    the server admin hasn't given one."""
    value = await load(db)
    if family is None or family.kind == "owner":
        provider = value["owner"]
    elif family.kind == "hosted":
        provider = value["hosted"]
    else:
        return None
    return account(value, provider) if provider else None


async def configured(db: AsyncSession, family: Family | None = None) -> bool:
    return await for_family(db, family) is not None


def _send(conf: dict, to: str, subject: str, text: str, html: str | None, reply_to: str | None) -> None:
    msg = EmailMessage()
    msg["From"] = formataddr((conf.get("sender_name") or "Smooth Family", conf["sender"]))
    msg["To"] = to
    msg["Subject"] = subject
    msg["Message-ID"] = make_msgid(domain=conf["sender"].split("@")[-1])
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    port = int(conf.get("port") or 587)
    security = conf.get("security") or "starttls"
    context = ssl.create_default_context()
    if security == "ssl":
        server = smtplib.SMTP_SSL(conf["host"], port, timeout=TIMEOUT, context=context)
    else:
        server = smtplib.SMTP(conf["host"], port, timeout=TIMEOUT)
    try:
        if security == "starttls":
            server.starttls(context=context)
        if conf.get("username"):
            server.login(conf["username"], conf.get("password") or "")
        server.send_message(msg)
    finally:
        try:
            server.quit()
        except Exception:
            pass


def _graph_error(resp: httpx.Response) -> str:
    """Microsoft's own words on why it was refused."""
    try:
        body = resp.json()
        err = body.get("error")
        message = err.get("message") if isinstance(err, dict) else body.get("error_description") or err
    except ValueError:
        message = ""
    return f"{resp.status_code}: {message or resp.reason_phrase}"[:200]


async def _graph_token(client: httpx.AsyncClient, conf: dict) -> str:
    key = (conf["tenant_id"], conf["client_id"], hash(conf.get("password") or ""))
    held = _tokens.get(key)
    if held and held[0] > time.monotonic():
        return held[1]
    resp = await client.post(
        f"{LOGIN}/{quote(conf['tenant_id'], safe='')}/oauth2/v2.0/token",
        data={"grant_type": "client_credentials", "client_id": conf["client_id"], "client_secret": conf.get("password") or "", "scope": "https://graph.microsoft.com/.default"},
    )
    if resp.status_code != 200:
        raise MailError(_graph_error(resp))
    body = resp.json()
    _tokens[key] = (time.monotonic() + int(body.get("expires_in", 3600)) - 120, body["access_token"])
    return body["access_token"]


async def _send_graph(conf: dict, to: str, subject: str, text: str, html: str | None, reply_to: str | None) -> None:
    """One mail from the account's mailbox through Microsoft Graph (the app needs Mail.Send)."""
    message: dict = {
        "subject": subject,
        "body": {"contentType": "HTML", "content": html} if html else {"contentType": "Text", "content": text},
        "toRecipients": [{"emailAddress": {"address": to}}],
    }
    if reply_to:
        message["replyTo"] = [{"emailAddress": {"address": reply_to}}]
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        token = await _graph_token(client, conf)
        resp = await client.post(
            f"{GRAPH}/users/{quote(conf['sender'], safe='@')}/sendMail",
            headers={"Authorization": f"Bearer {token}"},
            json={"message": message, "saveToSentItems": False},
        )
    if resp.status_code != 202:
        raise MailError(_graph_error(resp))


async def send_with(conf: dict, to: str, subject: str, text: str, html: str | None = None, reply_to: str | None = None) -> None:
    if conf.get("transport") == "graph":
        try:
            await _send_graph(conf, to, subject, text, html, reply_to)
        except httpx.HTTPError as exc:
            raise MailError(str(exc)[:200]) from exc
        return
    try:
        await asyncio.to_thread(_send, conf, to, subject, text, html, reply_to)
    except (smtplib.SMTPException, OSError, ssl.SSLError) as exc:
        raise MailError(str(exc)[:200]) from exc


async def send(db: AsyncSession, to: str, subject: str, text: str, html: str | None = None, reply_to: str | None = None, family: Family | None = None) -> None:
    conf = await for_family(db, family)
    if conf is None:
        raise MailError("E-mail isn't set up for this family")
    await send_with(conf, to, subject, text, html, reply_to)

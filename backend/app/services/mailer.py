"""E-mail from the server (3.4.0), through a mail service the server admin sets up (Server →
Address and services → E-mail). Used for what can't reach someone through the app – a party's
guests who asked for updates. Passwords are stored encrypted; nothing is sent until it's set up.

Three kinds of account, any or all of them set up: Gmail (an app password; the mail comes from the
Gmail address), Brevo (its SMTP relay and key; from an address verified there, such as one on the
family's own domain) and any other SMTP server. The server admin chooses which one the family
running the server sends with, and which one – if any – the hosted families may use.
"""
import asyncio
import json
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppSetting, Family
from app.services.crypto import decrypt_token, encrypt_token

SETTING_KEY = "smtp"
TIMEOUT = 20
PROVIDERS = ("gmail", "brevo", "smtp")
# The fixed part of each service; "smtp" is all the admin's own.
PRESETS = {
    "gmail": {"host": "smtp.gmail.com", "port": 587, "security": "starttls"},
    "brevo": {"host": "smtp-relay.brevo.com", "port": 587, "security": "starttls"},
}


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


async def send_with(conf: dict, to: str, subject: str, text: str, html: str | None = None, reply_to: str | None = None) -> None:
    try:
        await asyncio.to_thread(_send, conf, to, subject, text, html, reply_to)
    except (smtplib.SMTPException, OSError, ssl.SSLError) as exc:
        raise MailError(str(exc)[:200]) from exc


async def send(db: AsyncSession, to: str, subject: str, text: str, html: str | None = None, reply_to: str | None = None, family: Family | None = None) -> None:
    conf = await for_family(db, family)
    if conf is None:
        raise MailError("E-mail isn't set up for this family")
    await send_with(conf, to, subject, text, html, reply_to)

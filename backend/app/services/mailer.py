"""E-mail from the server (3.4.0), through an SMTP server the server admin sets up (Server →
Address and services → E-mail): the family's own mail provider, a mail relay, anything that
speaks SMTP. Used for what can't reach someone through the app – a party's guests who asked
for updates. The password is stored encrypted; nothing is sent until it's set up.
"""
import asyncio
import json
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppSetting
from app.services.crypto import decrypt_token, encrypt_token

SETTING_KEY = "smtp"
TIMEOUT = 20


class MailError(Exception):
    pass


async def settings(db: AsyncSession) -> dict | None:
    """{host, port, security (starttls | ssl | none), username, password, sender, sender_name}."""
    row = (await db.execute(select(AppSetting).where(AppSetting.key == SETTING_KEY))).scalar_one_or_none()
    if row is None or not row.value:
        return None
    try:
        return json.loads(decrypt_token(row.value))
    except Exception:
        return None


async def save(db: AsyncSession, value: dict | None) -> None:
    row = (await db.execute(select(AppSetting).where(AppSetting.key == SETTING_KEY))).scalar_one_or_none()
    if value is None:
        if row is not None:
            await db.delete(row)
    elif row is None:
        db.add(AppSetting(key=SETTING_KEY, value=encrypt_token(json.dumps(value))))
    else:
        row.value = encrypt_token(json.dumps(value))
    await db.commit()


async def configured(db: AsyncSession) -> bool:
    return await settings(db) is not None


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


async def send(db: AsyncSession, to: str, subject: str, text: str, html: str | None = None, reply_to: str | None = None) -> None:
    conf = await settings(db)
    if conf is None:
        raise MailError("E-mail isn't set up on this server")
    try:
        await asyncio.to_thread(_send, conf, to, subject, text, html, reply_to)
    except (smtplib.SMTPException, OSError, ssl.SSLError) as exc:
        raise MailError(str(exc)[:200]) from exc

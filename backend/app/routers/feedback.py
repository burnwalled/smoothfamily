"""Report a problem: bugs and wishes from the family go to the server admin (3.1.0).

A report stays on the server – its screenshot in the family's storage – and the server admins are
notified. The server admin reads them all, sets each one's status (the reporter is told) and may
take the chosen ones to the project's public repository: an export builds an anonymous text (no
family, no names) and GitHub's "new issue" page filled in with it, which the admin sends by hand.
Before 3.1.0 each report became a GitHub issue through a token; those keep their link.
"""
import base64
import binascii
import io
import re
import uuid
from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import func, select

from app.config import get_settings
from app.deps import CurrentUser, DB, ServerAdmin
from app.models import Family, FeedbackReport, User
from app.schemas import FeedbackAdminOut, FeedbackChange, FeedbackExportIn, FeedbackExportOut, FeedbackIn, FeedbackOut, FeedbackStatusOut
from app.services import useragent
from app.services.notify import notify
from app.services.storage import get_storage

router = APIRouter(prefix="/api/feedback", tags=["feedback"])

# The project's public repository, where a server admin takes reports, and its form for them.
PUBLIC_REPO = "burnwalled/smoothfamily"
ISSUE_TEMPLATE = "server-admin-report.yml"
# GitHub's limit for an address is about 8 000 characters; a longer text is pasted by hand.
MAX_URL = 7500

IMAGE_TYPES = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
MAX_IMAGE_BYTES = 6 * 1024 * 1024
_DATA_URL = re.compile(r"^data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$")

_NEW = {
    "en": ("New report: {title}", "{kind} from {family}. Read it in Server settings → Reports."),
    "sv": ("Ny rapport: {title}", "{kind} från {family}. Läs den under Serverinställningar → Rapporter."),
    "nb": ("Ny rapport: {title}", "{kind} fra {family}. Les den under Serverinnstillinger → Rapporter."),
    "da": ("Ny rapport: {title}", "{kind} fra {family}. Læs den under Serverindstillinger → Rapporter."),
    "fi": ("Uusi raportti: {title}", "{kind}, {family}. Lue se kohdassa Palvelimen asetukset → Raportit."),
}
_KIND = {
    "en": {"bug": "A problem", "idea": "A wish"},
    "sv": {"bug": "Ett fel", "idea": "Ett önskemål"},
    "nb": {"bug": "En feil", "idea": "Et ønske"},
    "da": {"bug": "En fejl", "idea": "Et ønske"},
    "fi": {"bug": "Virhe", "idea": "Toive"},
}
_CHANGED = {
    "en": {"planned": "Planned: {title}", "done": "Fixed: {title}", "declined": "Not planned: {title}", "new": "Received: {title}"},
    "sv": {"planned": "Planerad: {title}", "done": "Åtgärdad: {title}", "declined": "Inte planerad: {title}", "new": "Mottagen: {title}"},
    "nb": {"planned": "Planlagt: {title}", "done": "Fikset: {title}", "declined": "Ikke planlagt: {title}", "new": "Mottatt: {title}"},
    "da": {"planned": "Planlagt: {title}", "done": "Rettet: {title}", "declined": "Ikke planlagt: {title}", "new": "Modtaget: {title}"},
    "fi": {"planned": "Suunnitteilla: {title}", "done": "Korjattu: {title}", "declined": "Ei suunnitteilla: {title}", "new": "Vastaanotettu: {title}"},
}


def _parse_screenshot(data_url: str | None) -> tuple[bytes, str] | None:
    if not data_url:
        return None
    match = _DATA_URL.match(data_url)
    if not match:
        raise HTTPException(status_code=422, detail="The screenshot must be a PNG, JPG or WebP image")
    try:
        data = base64.b64decode(match.group(2), validate=True)
    except binascii.Error:
        raise HTTPException(status_code=422, detail="The screenshot could not be read")
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=422, detail="The screenshot is too large (max 6 MB)")
    return data, IMAGE_TYPES[match.group(1)]


def _out(report: FeedbackReport, reporter_name: str, family_admin: bool) -> FeedbackOut:
    return FeedbackOut(
        id=report.id, type=report.type, title=report.title, description=report.description,
        reporter_name=reporter_name, created_at=report.created_at, has_screenshot=report.has_screenshot,
        issue_number=report.issue_number, status=report.status or "new", admin_note=report.admin_note,
        updated_at=report.updated_at, issue_url=report.issue_url if family_admin else None,
    )


@router.get("/status", response_model=FeedbackStatusOut)
async def feedback_status(user: CurrentUser, db: DB) -> FeedbackStatusOut:
    # Always on: a report goes to the server admin, nothing has to be set up.
    return FeedbackStatusOut(enabled=True)


@router.post("", response_model=FeedbackOut, status_code=status.HTTP_201_CREATED)
async def submit_feedback(payload: FeedbackIn, user: CurrentUser, db: DB) -> FeedbackOut:
    title = payload.title.strip()
    description = payload.description.strip()
    if not title or not description:
        raise HTTPException(status_code=422, detail="Enter a title and a description")
    screenshot = _parse_screenshot(payload.screenshot)
    now = datetime.now(timezone.utc)
    number = ((await db.execute(select(func.max(FeedbackReport.issue_number)))).scalar() or 0) + 1
    report = FeedbackReport(
        id=uuid.uuid4(), family_id=user.family_id, user_id=user.id, type=payload.type, title=title,
        description=description, has_screenshot=screenshot is not None, issue_number=number, created_at=now,
        status="new", page=payload.page, user_agent=payload.user_agent, viewport=payload.viewport,
    )
    if screenshot:
        data, ext = screenshot
        report.screenshot_key = f"feedback/{report.id}.{ext}"
        get_storage().save(user.family_id, report.screenshot_key, io.BytesIO(data))
    db.add(report)
    await db.commit()

    family = await db.get(Family, user.family_id)
    for admin in (await db.execute(select(User).where(User.is_server_admin.is_(True)))).scalars().all():
        lang = admin.language if admin.language in _NEW else "en"
        head, body = _NEW[lang]
        await notify(db, admin, {
            "title": head.format(title=title)[:200], "body": body.format(kind=_KIND[lang][payload.type], family=family.name if family else ""),
            "route": "/server?tab=reports", "kind": "feedback",
        })
    return _out(report, user.display_name, user.role == "admin")


@router.get("", response_model=list[FeedbackOut])
async def list_feedback(user: CurrentUser, db: DB) -> list[FeedbackOut]:
    """Own reports; the family admin sees the whole family's."""
    is_admin = user.role == "admin"
    query = (
        select(FeedbackReport, User.display_name)
        .join(User, User.id == FeedbackReport.user_id)
        .where(FeedbackReport.family_id == user.family_id)
        .order_by(FeedbackReport.created_at.desc())
    )
    if not is_admin:
        query = query.where(FeedbackReport.user_id == user.id)
    return [_out(report, name, is_admin) for report, name in (await db.execute(query)).all()]


@router.get("/{report_id}/screenshot")
async def feedback_screenshot(report_id: uuid.UUID, user: CurrentUser, db: DB) -> Response:
    """For the reporter, their family's admin and the server admin."""
    report = await db.get(FeedbackReport, report_id)
    allowed = report is not None and (
        user.is_server_admin or (report.family_id == user.family_id and (user.role == "admin" or report.user_id == user.id))
    )
    if not allowed or not report.screenshot_key:
        raise HTTPException(status_code=404, detail="No screenshot")
    ext = report.screenshot_key.rsplit(".", 1)[-1]
    with open(get_storage().open(report.family_id, report.screenshot_key), "rb") as f:
        return Response(f.read(), media_type={"jpg": "image/jpeg"}.get(ext, f"image/{ext}"), headers={"Cache-Control": "private, max-age=3600"})


# --- The server admin ---------------------------------------------------------------------------


@router.get("/all", response_model=list[FeedbackAdminOut])
async def all_feedback(admin: ServerAdmin, db: DB) -> list[FeedbackAdminOut]:
    rows = (
        await db.execute(
            select(FeedbackReport, User, Family.name)
            .join(User, User.id == FeedbackReport.user_id)
            .join(Family, Family.id == FeedbackReport.family_id)
            .order_by(FeedbackReport.created_at.desc())
        )
    ).all()
    return [
        FeedbackAdminOut(
            **_out(report, reporter.display_name, True).model_dump(), family_name=family_name, reporter_role=reporter.role,
            page=report.page, browser=useragent.short(report.user_agent), viewport=report.viewport, exported_at=report.exported_at,
        )
        for report, reporter, family_name in rows
    ]


@router.patch("/{report_id}", response_model=FeedbackOut)
async def change_feedback(report_id: uuid.UUID, payload: FeedbackChange, admin: ServerAdmin, db: DB) -> FeedbackOut:
    report = await db.get(FeedbackReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    changed = payload.status is not None and payload.status != report.status
    if payload.status is not None:
        report.status = payload.status
    if payload.admin_note is not None:
        report.admin_note = payload.admin_note.strip() or None
    report.updated_at = datetime.now(timezone.utc)
    await db.commit()
    reporter = await db.get(User, report.user_id)
    if changed and reporter is not None:
        lang = reporter.language if reporter.language in _CHANGED else "en"
        await notify(db, reporter, {
            "title": _CHANGED[lang][report.status].format(title=report.title)[:200], "body": report.admin_note or "",
            "route": "/feedback", "kind": "feedback",
        })
    return _out(report, reporter.display_name if reporter else "", False)


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_feedback(report_id: uuid.UUID, admin: ServerAdmin, db: DB) -> None:
    report = await db.get(FeedbackReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.screenshot_key:
        try:
            get_storage().delete(report.family_id, report.screenshot_key)
        except Exception:
            pass
    await db.delete(report)
    await db.commit()


def _quote(text: str) -> str:
    """User text as a Markdown quote, so it can't break the issue's structure."""
    return "\n".join(f"> {line}" for line in text.replace("<", "&lt;").split("\n"))


def export_text(reports: list[FeedbackReport], version: str, today: datetime) -> tuple[str, str]:
    """An issue's title and body for the chosen reports – what they say and where, never who or
    which family."""
    kinds = {"bug": "Bug", "idea": "Wish"}
    if len(reports) == 1:
        title = f"[{kinds[reports[0].type]}] {reports[0].title}"
    else:
        title = f"{len(reports)} reports from a Smooth Family server"
    lines = [
        "Reports collected by a server admin, without names or families.",
        "",
        f"Server version: {version or 'unknown'} · Exported: {today:%Y-%m-%d}",
    ]
    for i, r in enumerate(reports, 1):
        context = [f"Page: `{(r.page or 'unknown').replace('`', '')}`"]
        if r.viewport:
            context.append(f"Screen: {r.viewport}")
        if useragent.short(r.user_agent):
            context.append(f"Browser: {useragent.short(r.user_agent)}")
        context.append(f"Reported: {r.created_at:%Y-%m-%d}")
        if r.has_screenshot:
            context.append("A screenshot is kept on the server")
        lines += ["", f"### {i}. [{kinds[r.type]}] {r.title}", "", _quote(r.description), "", " · ".join(context)]
    return title, "\n".join(lines)


@router.post("/export", response_model=FeedbackExportOut)
async def export_feedback(payload: FeedbackExportIn, admin: ServerAdmin, db: DB) -> FeedbackExportOut:
    rows = (await db.execute(select(FeedbackReport).where(FeedbackReport.id.in_(payload.ids)).order_by(FeedbackReport.created_at))).scalars().all()
    if not rows:
        raise HTTPException(status_code=404, detail="Choose the reports to export")
    now = datetime.now(timezone.utc)
    title, body = export_text(list(rows), get_settings().app_version, now)
    base = f"https://github.com/{PUBLIC_REPO}/issues/new?template={ISSUE_TEMPLATE}&title={quote(title)}"
    url = f"{base}&reports={quote(body)}"
    in_url = len(url) <= MAX_URL
    for r in rows:
        r.exported_at = now
    await db.commit()
    return FeedbackExportOut(title=title, body=body, url=url if in_url else base, body_in_url=in_url)

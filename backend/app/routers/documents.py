"""Document vault (#56): passports, ID cards, insurance, warranties, vaccinations … with a reminder
before they expire (or the next vaccine dose is due).

Who sees what: the household's documents and everyone's non-private ones are for the adults; a
private document only for its owner. A child (if given the app) sees only their own, and a
child's documents are always seen by the adults. Numbers are shown masked until asked for; numbers
and files are encrypted with the family's key and files are never cached by the browser.
"""
import io
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import file_limit, quota
from app.deps import DB, CurrentUser, require_app
from app.models import Document, DocumentFile, Family, User
from app.services.notify import notify
from app.services.storage import get_storage
from app.services.vault import family_fernet

router = APIRouter(prefix="/api/documents", tags=["documents"], dependencies=[require_app("documents")])

KINDS = ("passport", "id_card", "driving_licence", "insurance", "warranty", "contract", "vaccination", "health", "other")
# How long before expiry the reminder comes, unless chosen per document.
DEFAULT_REMIND_DAYS = {"passport": 90, "id_card": 60, "driving_licence": 60, "vaccination": 14}
# What the app shows in the browser (.docx, .xlsx and .pptx are read there); other office files are only downloaded.
PREVIEWABLE = {
    "application/pdf", "image/jpeg", "image/png", "image/webp",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}
OFFICE_TYPES = {
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.oasis.opendocument.spreadsheet",
    "application/vnd.oasis.opendocument.presentation",
}
FILE_TYPES = {"application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"} | OFFICE_TYPES
NO_STORE = {"Cache-Control": "no-store, private"}


class DocumentIn(BaseModel):
    user_id: uuid.UUID | None = None
    kind: str = Field(default="other", pattern="^(" + "|".join(KINDS) + ")$")
    title: str = Field(min_length=1, max_length=120)
    # None keeps the number as it is when editing; an empty string removes it.
    number: str | None = Field(default=None, max_length=100)
    issued_date: date | None = None
    expiry_date: date | None = None
    remind_days: int | None = Field(default=None, ge=0, le=730)
    private: bool = False
    notes: str | None = Field(default=None, max_length=5000)


class FileOut(BaseModel):
    id: uuid.UUID
    filename: str
    content_type: str
    size_bytes: int


class DocumentOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID | None
    owner_name: str | None
    kind: str
    title: str
    number_masked: str | None
    issued_date: date | None
    expiry_date: date | None
    remind_days: int
    private: bool
    notes: str | None
    # ok | soon (within the reminder time) | expired
    status: str
    files: list[FileOut]
    can_edit: bool


def _adult(user: User) -> bool:
    return user.role in {"admin", "adult"}


async def _owner(db: AsyncSession, doc: Document) -> User | None:
    return await db.get(User, doc.user_id) if doc.user_id else None


async def may_see(db: AsyncSession, user: User, doc: Document) -> bool:
    if doc.family_id != user.family_id:
        return False
    if doc.user_id == user.id:
        return True
    if not _adult(user):
        return False
    owner = await _owner(db, doc)
    if owner is not None and owner.role == "child":
        return True
    return not doc.private


async def may_edit(db: AsyncSession, user: User, doc: Document) -> bool:
    # Adults edit what they see; a child only their own.
    return await may_see(db, user, doc) and (_adult(user) or doc.user_id == user.id)


def status_of(doc: Document, today: date) -> str:
    if doc.expiry_date is None:
        return "ok"
    if doc.expiry_date < today:
        return "expired"
    return "soon" if doc.expiry_date - timedelta(days=doc.remind_days) <= today else "ok"


async def _out(db: AsyncSession, user: User, doc: Document) -> DocumentOut:
    owner = await _owner(db, doc)
    files = (await db.execute(select(DocumentFile).where(DocumentFile.document_id == doc.id).order_by(DocumentFile.created_at))).scalars().all()
    return DocumentOut(
        id=doc.id,
        user_id=doc.user_id,
        owner_name=owner.display_name if owner else None,
        kind=doc.kind,
        title=doc.title,
        number_masked=f"•••• {doc.number_last4}" if doc.number_last4 else None,
        issued_date=doc.issued_date,
        expiry_date=doc.expiry_date,
        remind_days=doc.remind_days,
        private=doc.private,
        notes=doc.notes,
        status=status_of(doc, date.today()),
        files=[FileOut(id=f.id, filename=f.filename, content_type=f.content_type, size_bytes=f.size_bytes) for f in files],
        can_edit=await may_edit(db, user, doc),
    )


async def _get(db: AsyncSession, user: User, doc_id: uuid.UUID, edit: bool = False) -> Document:
    doc = await db.get(Document, doc_id)
    if doc is None or not await may_see(db, user, doc):
        raise HTTPException(status_code=404, detail="Document not found")
    if edit and not await may_edit(db, user, doc):
        raise HTTPException(status_code=403, detail="Only an adult can change this document")
    return doc


async def _apply(db: AsyncSession, user: User, doc: Document, payload: DocumentIn) -> None:
    if payload.user_id is not None:
        owner = await db.get(User, payload.user_id)
        if owner is None or owner.family_id != user.family_id:
            raise HTTPException(status_code=422, detail="Unknown family member")
    if not _adult(user) and payload.user_id != user.id:
        raise HTTPException(status_code=403, detail="Children can only add their own documents")
    if payload.expiry_date and payload.issued_date and payload.expiry_date < payload.issued_date:
        raise HTTPException(status_code=422, detail="It can't expire before it was issued")
    if doc.expiry_date != payload.expiry_date:
        doc.reminded_for = None
    doc.user_id = payload.user_id
    doc.kind = payload.kind
    doc.title = payload.title.strip()
    doc.issued_date = payload.issued_date
    doc.expiry_date = payload.expiry_date
    doc.remind_days = payload.remind_days if payload.remind_days is not None else DEFAULT_REMIND_DAYS.get(payload.kind, 30)
    doc.private = payload.private
    doc.notes = (payload.notes or "").strip() or None
    if payload.number is not None:
        number = payload.number.strip()
        if number:
            fernet = await family_fernet(db, await db.get(Family, user.family_id))
            doc.number_encrypted = fernet.encrypt(number.encode()).decode()
            doc.number_last4 = number.replace(" ", "")[-4:]
        else:
            doc.number_encrypted = doc.number_last4 = None


@router.get("", response_model=list[DocumentOut])
async def list_documents(user: CurrentUser, db: DB) -> list[DocumentOut]:
    docs = (await db.execute(select(Document).where(Document.family_id == user.family_id).order_by(Document.expiry_date.is_(None), Document.expiry_date, Document.title))).scalars().all()
    return [await _out(db, user, d) for d in docs if await may_see(db, user, d)]


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def add_document(payload: DocumentIn, user: CurrentUser, db: DB) -> DocumentOut:
    doc = Document(family_id=user.family_id, created_by=user.id)
    await _apply(db, user, doc, payload)
    db.add(doc)
    await db.commit()
    return await _out(db, user, doc)


@router.put("/{doc_id}", response_model=DocumentOut)
async def update_document(doc_id: uuid.UUID, payload: DocumentIn, user: CurrentUser, db: DB) -> DocumentOut:
    doc = await _get(db, user, doc_id, edit=True)
    await _apply(db, user, doc, payload)
    await db.commit()
    return await _out(db, user, doc)


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(doc_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    doc = await _get(db, user, doc_id, edit=True)
    storage = get_storage()
    for f in (await db.execute(select(DocumentFile).where(DocumentFile.document_id == doc.id))).scalars().all():
        storage.delete(doc.family_id, f.storage_key)
        await db.delete(f)
    await db.delete(doc)
    await db.commit()


@router.get("/{doc_id}/number")
async def reveal_number(doc_id: uuid.UUID, user: CurrentUser, db: DB) -> Response:
    """The whole number, when someone taps "show"."""
    doc = await _get(db, user, doc_id)
    if not doc.number_encrypted:
        raise HTTPException(status_code=404, detail="No number saved")
    fernet = await family_fernet(db, await db.get(Family, user.family_id))
    number = fernet.decrypt(doc.number_encrypted.encode()).decode()
    return JSONResponse({"number": number}, headers=NO_STORE)


@router.post("/{doc_id}/files", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def add_file(doc_id: uuid.UUID, file: UploadFile, user: CurrentUser, db: DB) -> DocumentOut:
    doc = await _get(db, user, doc_id, edit=True)
    if file.content_type not in FILE_TYPES:
        raise HTTPException(status_code=415, detail="PDF, a picture (JPEG, PNG, WebP, HEIC) or an office file (Word, Excel, PowerPoint, OpenDocument)")
    data = await file.read()
    limit = await file_limit.too_large(db, len(data))
    if limit:
        raise HTTPException(status_code=413, detail=f"The file is larger than {limit} MB")
    await quota.check(db, user.family_id, len(data))
    fernet = await family_fernet(db, await db.get(Family, user.family_id))
    row = DocumentFile(
        family_id=doc.family_id, document_id=doc.id, storage_key="", filename=(file.filename or "file")[:200],
        content_type=file.content_type, size_bytes=len(data), created_by=user.id,
    )
    row.id = uuid.uuid4()
    row.storage_key = f"documents/{doc.id}/{row.id}.enc"
    get_storage().save(doc.family_id, row.storage_key, io.BytesIO(fernet.encrypt(data)))
    db.add(row)
    await db.commit()
    return await _out(db, user, doc)


@router.get("/{doc_id}/files/{file_id}")
async def get_file(doc_id: uuid.UUID, file_id: uuid.UUID, user: CurrentUser, db: DB) -> Response:
    doc = await _get(db, user, doc_id)
    row = await db.get(DocumentFile, file_id)
    if row is None or row.document_id != doc.id:
        raise HTTPException(status_code=404, detail="File not found")
    fernet = await family_fernet(db, await db.get(Family, user.family_id))
    data = fernet.decrypt(get_storage().open(doc.family_id, row.storage_key).read_bytes())
    safe = row.filename.replace('"', "")
    return Response(content=data, media_type=row.content_type, headers={**NO_STORE, "Content-Disposition": f'inline; filename="{safe}"'})


@router.delete("/{doc_id}/files/{file_id}", response_model=DocumentOut)
async def delete_file(doc_id: uuid.UUID, file_id: uuid.UUID, user: CurrentUser, db: DB) -> DocumentOut:
    doc = await _get(db, user, doc_id, edit=True)
    row = await db.get(DocumentFile, file_id)
    if row is None or row.document_id != doc.id:
        raise HTTPException(status_code=404, detail="File not found")
    get_storage().delete(doc.family_id, row.storage_key)
    await db.delete(row)
    await db.commit()
    return await _out(db, user, doc)


# --- Reminders ------------------------------------------------------------------------------

_TEXT = {
    "en": ("Expires soon", "{title}{owner} expires {date}", "Next dose soon", "{title}{owner}: next dose {date}"),
    "sv": ("Går snart ut", "{title}{owner} går ut {date}", "Snart dags för nästa dos", "{title}{owner}: nästa dos {date}"),
    "nb": ("Utløper snart", "{title}{owner} utløper {date}", "Snart tid for neste dose", "{title}{owner}: neste dose {date}"),
    "da": ("Udløber snart", "{title}{owner} udløber {date}", "Snart tid til næste dosis", "{title}{owner}: næste dosis {date}"),
    "fi": ("Vanhenee pian", "{title}{owner} vanhenee {date}", "Seuraava annos pian", "{title}{owner}: seuraava annos {date}"),
}


async def run_document_reminders(db: AsyncSession, now: datetime | None = None) -> int:
    """From 07 UTC, once per expiry date: the owner (if an adult or the child has the app) and the
    adults who may see it are told it is about to expire."""
    now = now or datetime.now(timezone.utc)
    if now.hour < 7:
        return 0
    today = now.date()
    docs = (
        await db.execute(select(Document).where(Document.expiry_date.is_not(None), Document.expiry_date >= today))
    ).scalars().all()
    sent = 0
    for doc in docs:
        if doc.reminded_for == doc.expiry_date or doc.expiry_date - timedelta(days=doc.remind_days) > today:
            continue
        doc.reminded_for = doc.expiry_date
        await db.commit()
        owner = await _owner(db, doc)
        members = (await db.execute(select(User).where(User.family_id == doc.family_id))).scalars().all()
        for member in members:
            if "documents" not in member.apps or not await may_see(db, member, doc):
                continue
            title, body, vtitle, vbody = _TEXT.get(member.language or "en", _TEXT["en"])
            if doc.kind == "vaccination":
                title, body = vtitle, vbody
            who = f" ({owner.display_name})" if owner and owner.id != member.id else ""
            await notify(db, member, {"title": title, "body": body.format(title=doc.title, owner=who, date=doc.expiry_date.isoformat()), "route": "/documents", "kind": "document_expiry"})
            sent += 1
    return sent

"""Parties (3.4.0): a child's birthday party, a celebration, a dinner – planned together.

For the guests, one shared invitation page (no account): what, when and where, the invitation, a
reply (first and last name, allergies, and a +1 if the hosts allow it), "add to my calendar", the
wish list if the hosts chose to show it (a reservation hidden from the one it's for, as always),
and afterwards the thank-you with the day's photos from an album in the vault. What the guests see
of each other is the hosts' choice: nothing, how many are coming, or the names.

For the adults: the invitation link (with a ready message to share and a QR code – the family
shares it itself, by text or chat), the replies with the allergies gathered, a checklist with
dates and a reminder each morning one is due (send the invitation, remind those who haven't
replied …), the budget and what has been spent, and the day's timeline. The party is in the
calendar. Children don't open the planning – the wish list's reservations are on it.
"""
import hashlib
import re
import secrets
import uuid
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import DB, AdultUser, require_app
from app.models import Album, Family, FamilyEvent, MediaItem, Party, PartyExpense, PartyGuest, PartyStep, PartyTask, Person, User, WishItem
from app.services import login_throttle
from app.services.crypto import decrypt_token, encrypt_token
from app.services.mfa import qr_svg
from app.services.public_url import public_base
from app.services.storage import get_storage
from app.services.weather import _tz

router = APIRouter(prefix="/api/parties", tags=["parties"], dependencies=[require_app("calendar")])
public = APIRouter(prefix="/api/party", tags=["party-public"])

KINDS = ("child_birthday", "birthday", "party", "dinner")
NO_STORE = {"Cache-Control": "no-store, private", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer"}


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# --- What a new party starts with ------------------------------------------------------------

# (days before the party, title) – negative days are before; the RSVP ones move with the RSVP date.
_TASKS = {
    "en": [(-21, "Share the invitation"), (-14, "Order or plan the cake"), (-7, "Buy decorations"), ("rsvp-2", "Remind those who haven't replied"),
           ("rsvp+1", "Count the guests and check the allergies"), (-2, "Shop for the food"), (-1, "Get the games and music ready"), (1, "Publish the thank-you page with the photos")],
    "sv": [(-21, "Dela inbjudan"), (-14, "Beställ eller planera tårtan"), (-7, "Köp dekorationer"), ("rsvp-2", "Påminn dem som inte svarat"),
           ("rsvp+1", "Räkna gästerna och kolla allergierna"), (-2, "Handla maten"), (-1, "Förbered lekar och musik"), (1, "Publicera tacksidan med bilderna")],
    "nb": [(-21, "Del invitasjonen"), (-14, "Bestill eller planlegg kaken"), (-7, "Kjøp dekorasjoner"), ("rsvp-2", "Påminn dem som ikke har svart"),
           ("rsvp+1", "Tell gjestene og sjekk allergiene"), (-2, "Handle maten"), (-1, "Forbered leker og musikk"), (1, "Publiser takkesiden med bildene")],
    "da": [(-21, "Del invitationen"), (-14, "Bestil eller planlæg kagen"), (-7, "Køb pynt"), ("rsvp-2", "Påmind dem, der ikke har svaret"),
           ("rsvp+1", "Tæl gæsterne, og tjek allergierne"), (-2, "Køb ind til maden"), (-1, "Forbered lege og musik"), (1, "Udgiv taksiden med billederne")],
    "fi": [(-21, "Jaa kutsu"), (-14, "Tilaa tai suunnittele kakku"), (-7, "Osta koristeet"), ("rsvp-2", "Muistuta niitä, jotka eivät ole vastanneet"),
           ("rsvp+1", "Laske vieraat ja tarkista allergiat"), (-2, "Tee ruokaostokset"), (-1, "Valmistele leikit ja musiikki"), (1, "Julkaise kiitossivu kuvineen")],
}
# (minutes from the start, or "end-N" / "end", title) – the day of a child's party.
_STEPS = {
    "en": [(0, "The guests arrive"), (20, "Games"), (75, "Cake and presents"), ("end-15", "Party bags"), ("end", "Pick-up")],
    "sv": [(0, "Gästerna kommer"), (20, "Lekar"), (75, "Tårta och presenter"), ("end-15", "Godispåsar"), ("end", "Hämtning")],
    "nb": [(0, "Gjestene kommer"), (20, "Leker"), (75, "Kake og gaver"), ("end-15", "Godteposer"), ("end", "Henting")],
    "da": [(0, "Gæsterne kommer"), (20, "Lege"), (75, "Kage og gaver"), ("end-15", "Slikposer"), ("end", "Afhentning")],
    "fi": [(0, "Vieraat saapuvat"), (20, "Leikit"), (75, "Kakku ja lahjat"), ("end-15", "Karkkipussit"), ("end", "Haku")],
}


async def _mail_ready(db: AsyncSession) -> bool:
    from app.services import mailer

    return await mailer.configured(db)


def _local(moment: datetime) -> datetime:
    return (moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)).astimezone(_tz())


def _starter_tasks(party: Party, language: str, today: date) -> list[PartyTask]:
    day = _local(party.starts_at).date()
    out = []
    for i, (when, title) in enumerate(_TASKS.get(language, _TASKS["en"])):
        if isinstance(when, str):
            if party.rsvp_by is None:
                continue
            due = party.rsvp_by + timedelta(days=int(when[4:]))
        else:
            due = day + timedelta(days=when)
        out.append(PartyTask(family_id=party.family_id, party_id=party.id, title=title, due_date=max(due, today), position=i))
    return out


def _starter_steps(party: Party, language: str) -> list[PartyStep]:
    start, end = _local(party.starts_at), _local(party.ends_at)
    out = []
    for when, title in _STEPS.get(language, _STEPS["en"]):
        if when == "end":
            moment = end
        elif isinstance(when, str):
            moment = end - timedelta(minutes=int(when[4:]))
        else:
            moment = start + timedelta(minutes=when)
        if start <= moment <= end:
            out.append(PartyStep(family_id=party.family_id, party_id=party.id, at=moment.strftime("%H:%M"), title=title))
    return out


# --- Updates by e-mail, for the guests who ask for them ------------------------------------------

THEMES = ("balloons", "jungle", "space", "ocean", "fairytale", "sports", "elegant", "garden")

_MAIL = {
    "en": {
        "confirm": ("{title}: thank you for your reply", "Thank you, {name}! We have your reply: {answer}."),
        "change": ("{title}: a new time or place", "Something has changed for {title}."),
        "remind": ("{title} is tomorrow", "A reminder: {title} is tomorrow."),
        "thanks": ("{title}: thank you!", "{text}"),
        "message": ("{title}: {subject}", "{text}"),
        "answers": ("coming", "not coming"), "plus": "with {name}",
        "decided": ("{title}: the date is set", "The date for {title} is set – see you then!"),
        "voted": "you voted for {n} date(s)", "family": "{adults} adult(s), {children} child(ren)",
        "page": "The party's page: {link}", "stop": "You get this because you asked for updates when you replied. Stop them: {link}",
    },
    "sv": {
        "confirm": ("{title}: tack för ditt svar", "Tack, {name}! Vi har fått ditt svar: {answer}."),
        "change": ("{title}: ny tid eller plats", "Något har ändrats för {title}."),
        "remind": ("{title} är i morgon", "En påminnelse: {title} är i morgon."),
        "thanks": ("{title}: tack!", "{text}"),
        "message": ("{title}: {subject}", "{text}"),
        "answers": ("kommer", "kommer inte"), "plus": "med {name}",
        "decided": ("{title}: datumet är bestämt", "Datumet för {title} är bestämt – vi ses då!"),
        "voted": "du har röstat på {n} datum", "family": "{adults} vuxna, {children} barn",
        "page": "Festens sida: {link}", "stop": "Du får det här för att du bad om uppdateringar när du svarade. Avsluta dem: {link}",
    },
    "nb": {
        "confirm": ("{title}: takk for svaret", "Takk, {name}! Vi har fått svaret ditt: {answer}."),
        "change": ("{title}: nytt tidspunkt eller sted", "Noe er endret for {title}."),
        "remind": ("{title} er i morgen", "En påminnelse: {title} er i morgen."),
        "thanks": ("{title}: takk!", "{text}"),
        "message": ("{title}: {subject}", "{text}"),
        "answers": ("kommer", "kommer ikke"), "plus": "med {name}",
        "decided": ("{title}: datoen er bestemt", "Datoen for {title} er bestemt – vi ses da!"),
        "voted": "du har stemt på {n} dato(er)", "family": "{adults} voksne, {children} barn",
        "page": "Festens side: {link}", "stop": "Du får dette fordi du ba om oppdateringer da du svarte. Avslutt dem: {link}",
    },
    "da": {
        "confirm": ("{title}: tak for dit svar", "Tak, {name}! Vi har fået dit svar: {answer}."),
        "change": ("{title}: nyt tidspunkt eller sted", "Noget er ændret for {title}."),
        "remind": ("{title} er i morgen", "En påmindelse: {title} er i morgen."),
        "thanks": ("{title}: tak!", "{text}"),
        "message": ("{title}: {subject}", "{text}"),
        "answers": ("kommer", "kommer ikke"), "plus": "med {name}",
        "decided": ("{title}: datoen er fastlagt", "Datoen for {title} er fastlagt – vi ses!"),
        "voted": "du har stemt på {n} dato(er)", "family": "{adults} voksne, {children} børn",
        "page": "Festens side: {link}", "stop": "Du får dette, fordi du bad om opdateringer, da du svarede. Stop dem: {link}",
    },
    "fi": {
        "confirm": ("{title}: kiitos vastauksestasi", "Kiitos, {name}! Saimme vastauksesi: {answer}."),
        "change": ("{title}: uusi aika tai paikka", "Jotain on muuttunut: {title}."),
        "remind": ("{title} on huomenna", "Muistutus: {title} on huomenna."),
        "thanks": ("{title}: kiitos!", "{text}"),
        "message": ("{title}: {subject}", "{text}"),
        "answers": ("tulee", "ei tule"), "plus": "seuranaan {name}",
        "decided": ("{title}: päivä on päätetty", "Päivä on päätetty: {title} – nähdään silloin!"),
        "voted": "äänestit {n} päivää", "family": "{adults} aikuista, {children} lasta",
        "page": "Juhlien sivu: {link}", "stop": "Saat tämän, koska pyysit päivityksiä vastatessasi. Lopeta ne: {link}",
    },
}


async def _host_language(db: AsyncSession, party: Party) -> str:
    host = await db.get(User, party.created_by) if party.created_by else None
    if host is None:
        host = (await db.execute(select(User).where(User.family_id == party.family_id, User.role == "admin").order_by(User.created_at))).scalars().first()
    return (host.language if host else None) or "en"


def _when_where(party: Party, language: str) -> str:
    start, end = _local(party.starts_at), _local(party.ends_at)
    where = ", ".join(x for x in (party.place, party.address) if x)
    if party.date_poll:
        return where
    return f"{start.strftime('%Y-%m-%d %H:%M')}–{end.strftime('%H:%M')}" + (f"\n{where}" if where else "")


async def mail_guests(db: AsyncSession, party: Party, kind: str, guests: list[PartyGuest] | None = None, base: str = "", **values) -> int:
    """Send one kind of update to the guests who asked for them (or the ones given). Returns how
    many were sent; a guest whose mail fails is skipped."""
    from app.services import mailer

    if not await mailer.configured(db):
        return 0
    if guests is None:
        guests = (await db.execute(select(PartyGuest).where(PartyGuest.party_id == party.id, PartyGuest.updates == True, PartyGuest.email.is_not(None)))).scalars().all()  # noqa: E712
    language = await _host_language(db, party)
    texts = _MAIL.get(language, _MAIL["en"])
    page = f"{base}/party/{decrypt_token(party.token_encrypted)}"
    sent = 0
    for guest in guests:
        if not guest.email or not guest.updates:
            continue
        code = secrets.token_urlsafe(18)
        guest.unsubscribe_hash = _hash(code)
        subject_t, body_t = texts[kind]
        answer = texts["answers"][0 if guest.coming else 1]
        if party.date_poll:
            answer = texts["voted"].format(n=len(guest.date_votes or []))
        elif guest.coming and party.households:
            answer += f" ({texts['family'].format(adults=guest.adults, children=guest.children)})"
        if guest.coming and guest.plus_first_name and not party.date_poll:
            answer += " " + texts["plus"].format(name=f"{guest.plus_first_name} {guest.plus_last_name or ''}".strip())
        fields = {"title": party.title, "name": guest.first_name, "answer": answer, **values}
        body = "\n\n".join([
            body_t.format(**fields),
            _when_where(party, language),
            texts["page"].format(link=page),
            texts["stop"].format(link=f"{page}?unsubscribe={code}"),
        ])
        try:
            await mailer.send(db, guest.email, subject_t.format(**fields), body)
            sent += 1
        except mailer.MailError:
            continue
    await db.commit()
    return sent


# --- The adults' side ----------------------------------------------------------------------


class PartyIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    kind: str = Field(default="party", pattern=r"^(child_birthday|birthday|party|dinner)$")
    person_id: uuid.UUID | None = None
    starts_at: datetime
    ends_at: datetime
    place: str = Field(default="", max_length=200)
    address: str = Field(default="", max_length=300)
    theme: str = Field(default="", max_length=120)
    emoji: str = Field(default="🎉", max_length=16)
    color: str = Field(default="#E85D75", pattern=r"^#[0-9a-fA-F]{6}$")
    invitation: str = Field(default="", max_length=4000)
    rsvp_by: date | None = None
    plus_one: bool = False
    show_guests: str = Field(default="count", pattern=r"^(none|count|names)$")
    wishlist: bool = False
    budget: float | None = Field(default=None, ge=0, le=10_000_000)
    page_theme: str = Field(default="balloons", pattern=r"^(balloons|jungle|space|ocean|fairytale|sports|elegant|garden)$")
    date_poll: bool = False
    date_options: list[datetime] = Field(default_factory=list, max_length=12)
    households: bool = False


class PartyChange(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    kind: str | None = Field(default=None, pattern=r"^(child_birthday|birthday|party|dinner)$")
    person_id: uuid.UUID | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    place: str | None = Field(default=None, max_length=200)
    address: str | None = Field(default=None, max_length=300)
    theme: str | None = Field(default=None, max_length=120)
    emoji: str | None = Field(default=None, max_length=16)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    invitation: str | None = Field(default=None, max_length=4000)
    rsvp_by: date | None = None
    plus_one: bool | None = None
    show_guests: str | None = Field(default=None, pattern=r"^(none|count|names)$")
    wishlist: bool | None = None
    budget: float | None = Field(default=None, ge=0, le=10_000_000)
    thanks_text: str | None = Field(default=None, max_length=4000)
    thanks_album_id: uuid.UUID | None = None
    thanks_published: bool | None = None
    page_theme: str | None = Field(default=None, pattern=r"^(balloons|jungle|space|ocean|fairytale|sports|elegant|garden)$")
    thanks_theme: str | None = Field(default=None, pattern=r"^(|balloons|jungle|space|ocean|fairytale|sports|elegant|garden)$")
    date_poll: bool | None = None
    date_options: list[datetime] | None = Field(default=None, max_length=12)
    households: bool | None = None


class DecideIn(BaseModel):
    option: datetime


class AnnounceIn(BaseModel):
    subject: str = Field(min_length=1, max_length=120)
    text: str = Field(min_length=1, max_length=4000)


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    due_date: date | None = None
    who: uuid.UUID | None = None


class TaskChange(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    due_date: date | None = None
    done: bool | None = None
    who: uuid.UUID | None = None


class ExpenseIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    amount: float = Field(gt=0, le=10_000_000)
    paid_by: uuid.UUID | None = None


class StepIn(BaseModel):
    at: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    title: str = Field(min_length=1, max_length=200)


class GuestIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(default="", max_length=80)
    coming: bool = True
    allergies: str = Field(default="", max_length=300)
    message: str = Field(default="", max_length=500)
    plus_first_name: str | None = Field(default=None, max_length=80)
    plus_last_name: str | None = Field(default=None, max_length=80)
    plus_allergies: str = Field(default="", max_length=300)
    email: str | None = Field(default=None, max_length=254, pattern=r"^$|^[^@\s]+@[^@\s]+\.[^@\s]+$")
    updates: bool = False
    date_votes: list[str] | None = Field(default=None, max_length=12)
    adults: int = Field(default=1, ge=0, le=30)
    children: int = Field(default=0, ge=0, le=30)


def _dt(moment: datetime) -> datetime:
    return moment if moment.tzinfo else moment.replace(tzinfo=_tz())


async def _mine(db: AsyncSession, user: User, party_id: uuid.UUID) -> Party:
    party = await db.get(Party, party_id)
    if party is None or party.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Party not found")
    return party


async def _sync_event(db: AsyncSession, party: Party, user: User) -> None:
    """The party in the family's calendar (for the one it's for, a birthday's) – once its date is set."""
    if party.date_poll:
        if party.event_id and (old := await db.get(FamilyEvent, party.event_id)) is not None:
            await db.delete(old)
        party.event_id = None
        return
    member = None
    if party.person_id:
        person = await db.get(Person, party.person_id)
        member = str(person.user_id) if person and person.user_id else None
    event = await db.get(FamilyEvent, party.event_id) if party.event_id else None
    if event is None:
        event = FamilyEvent(family_id=party.family_id, created_by=user.id, title=party.title, start=party.starts_at, end=party.ends_at)
        db.add(event)
        await db.flush()
        party.event_id = event.id
    event.title = f"{party.emoji} {party.title}".strip()
    event.start, event.end = party.starts_at, party.ends_at
    event.location = ", ".join(x for x in (party.place, party.address) if x) or None
    event.color = party.color
    event.member_ids = [member] if member else []


async def _link(db: AsyncSession, party: Party, request: Request | None) -> str:
    return f"{await public_base(db, request)}/party/{decrypt_token(party.token_encrypted)}"


def _guest_out(g: PartyGuest) -> dict:
    return {
        "id": g.id, "first_name": g.first_name, "last_name": g.last_name, "coming": g.coming, "allergies": g.allergies, "message": g.message,
        "plus_first_name": g.plus_first_name, "plus_last_name": g.plus_last_name, "plus_allergies": g.plus_allergies, "updated_at": g.updated_at,
        "email": g.email, "updates": bool(g.updates), "date_votes": g.date_votes or [], "adults": g.adults, "children": g.children,
    }


def _size(party: Party, g: PartyGuest) -> int:
    if party.households:
        return g.adults + g.children
    return 1 + (1 if g.plus_first_name else 0)


def _people(party: Party, guests: list[PartyGuest]) -> int:
    return sum(_size(party, g) for g in guests if g.coming)


def _iso(moment: datetime) -> str:
    return _utc(_dt(moment)).astimezone(timezone.utc).replace(second=0, microsecond=0).isoformat()


def _options(raw: list[datetime]) -> list[str]:
    return sorted({_iso(m) for m in raw})


def _tally(party: Party, guests: list[PartyGuest], names: bool = True) -> list[dict]:
    out = []
    for option in party.date_options or []:
        voters = [g for g in guests if option in (g.date_votes or [])]
        row = {"option": option, "votes": len(voters), "people": sum(_size(party, g) for g in voters)}
        if names:
            row["names"] = [f"{g.first_name} {g.last_name}".strip() for g in voters]
        out.append(row)
    return out


async def _detail(db: AsyncSession, party: Party, request: Request | None) -> dict:
    guests = (await db.execute(select(PartyGuest).where(PartyGuest.party_id == party.id).order_by(PartyGuest.created_at))).scalars().all()
    tasks = (await db.execute(select(PartyTask).where(PartyTask.party_id == party.id).order_by(PartyTask.due_date.nulls_last(), PartyTask.position))).scalars().all()
    expenses = (await db.execute(select(PartyExpense).where(PartyExpense.party_id == party.id).order_by(PartyExpense.created_at))).scalars().all()
    steps = (await db.execute(select(PartyStep).where(PartyStep.party_id == party.id).order_by(PartyStep.at))).scalars().all()
    link = await _link(db, party, request)
    allergies = []
    for g in guests:
        if g.coming and g.allergies.strip():
            allergies.append({"name": f"{g.first_name} {g.last_name}".strip(), "allergies": g.allergies})
        if g.coming and g.plus_first_name and g.plus_allergies.strip():
            allergies.append({"name": f"{g.plus_first_name} {g.plus_last_name or ''}".strip(), "allergies": g.plus_allergies})
    wishes = []
    if party.person_id:
        wishes = [
            {"id": w.id, "title": w.title, "reserved": bool(w.reserved_by or w.reserved_by_guest), "reserved_by": w.reserved_by_guest}
            for w in (await db.execute(select(WishItem).where(WishItem.person_id == party.person_id, WishItem.kind == "wish").order_by(WishItem.created_at))).scalars()
        ]
    spent = round(sum(float(e.amount) for e in expenses), 2)
    return {
        "id": party.id, "title": party.title, "kind": party.kind, "person_id": party.person_id, "starts_at": party.starts_at, "ends_at": party.ends_at,
        "place": party.place, "address": party.address, "theme": party.theme, "emoji": party.emoji, "color": party.color, "invitation": party.invitation,
        "rsvp_by": party.rsvp_by, "plus_one": party.plus_one, "show_guests": party.show_guests, "wishlist": party.wishlist,
        "budget": float(party.budget) if party.budget is not None else None, "spent": spent,
        "thanks_text": party.thanks_text, "thanks_album_id": party.thanks_album_id, "thanks_published": party.thanks_published,
        "page_theme": party.page_theme, "thanks_theme": party.thanks_theme,
        "date_poll": party.date_poll, "date_options": party.date_options or [], "households": party.households, "tally": _tally(party, guests),
        "mail": await _mail_ready(db), "subscribers": sum(1 for g in guests if g.updates and g.email),
        "link": link, "qr_svg": qr_svg(link),
        "guests": [_guest_out(g) for g in guests],
        "coming": _people(party, guests), "not_coming": sum(1 for g in guests if not g.coming), "allergies": allergies,
        "tasks": [{"id": t.id, "title": t.title, "due_date": t.due_date, "done": t.done, "who": t.who} for t in tasks],
        "expenses": [{"id": e.id, "title": e.title, "amount": float(e.amount), "paid_by": e.paid_by} for e in expenses],
        "steps": [{"id": s.id, "at": s.at, "title": s.title} for s in steps],
        "wishes": wishes,
    }


@router.get("")
async def list_parties(user: AdultUser, db: DB) -> list[dict]:
    parties = (await db.execute(select(Party).where(Party.family_id == user.family_id).order_by(Party.starts_at.desc()))).scalars().all()
    out = []
    for p in parties:
        guests = (await db.execute(select(PartyGuest).where(PartyGuest.party_id == p.id))).scalars().all()
        left = (await db.execute(select(func.count()).select_from(PartyTask).where(PartyTask.party_id == p.id, PartyTask.done == False))).scalar_one()  # noqa: E712
        out.append({"id": p.id, "title": p.title, "kind": p.kind, "emoji": p.emoji, "color": p.color, "starts_at": p.starts_at, "place": p.place, "date_poll": p.date_poll, "coming": _people(p, guests), "replies": len(guests), "tasks_left": left})
    return out


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_party(payload: PartyIn, request: Request, user: AdultUser, db: DB) -> dict:
    data = payload.model_dump()
    data["starts_at"], data["ends_at"] = _dt(payload.starts_at), _dt(payload.ends_at)
    if data["ends_at"] <= data["starts_at"]:
        raise HTTPException(status_code=422, detail="The party ends after it starts")
    data["date_options"] = _options([payload.starts_at, *payload.date_options]) if payload.date_poll else None
    if payload.date_poll and len(data["date_options"]) < 2:
        raise HTTPException(status_code=422, detail="A vote needs at least two dates")
    if payload.person_id and (person := await db.get(Person, payload.person_id)) is not None and person.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Person not found")
    token = secrets.token_urlsafe(18)
    party = Party(family_id=user.family_id, created_by=user.id, created_at=datetime.now(timezone.utc), token_hash=_hash(token), token_encrypted=encrypt_token(token), **data)
    party.title = party.title.strip()
    db.add(party)
    await db.flush()
    language = user.language or "en"
    today = datetime.now(_tz()).date()
    db.add_all(_starter_tasks(party, language, today))
    if party.kind == "child_birthday":
        db.add_all(_starter_steps(party, language))
    await _sync_event(db, party, user)
    await db.commit()
    return await _detail(db, party, request)


@router.get("/{party_id}")
async def get_party(party_id: uuid.UUID, request: Request, user: AdultUser, db: DB) -> dict:
    return await _detail(db, await _mine(db, user, party_id), request)


@router.put("/{party_id}")
async def change_party(party_id: uuid.UUID, payload: PartyChange, request: Request, user: AdultUser, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    changes = payload.model_dump(exclude_unset=True)
    for key in ("starts_at", "ends_at"):
        if changes.get(key) is not None:
            changes[key] = _dt(changes[key])
    if changes.get("date_options") is not None:
        changes["date_options"] = _options(changes["date_options"])
    if changes.get("date_poll") and len(changes.get("date_options") or party.date_options or []) < 2:
        raise HTTPException(status_code=422, detail="A vote needs at least two dates")
    if changes.get("thanks_album_id"):
        album = await db.get(Album, changes["thanks_album_id"])
        if album is None or album.family_id != user.family_id:
            raise HTTPException(status_code=404, detail="Album not found")
    before = (_utc(party.starts_at), _utc(party.ends_at), party.place, party.address, party.thanks_published)
    for key, value in changes.items():
        if key in ("title", "starts_at", "ends_at", "kind", "page_theme", "thanks_theme", "date_poll", "date_options", "households") and value is None:
            continue
        setattr(party, key, value)
    if _utc(party.ends_at) <= _utc(party.starts_at):
        raise HTTPException(status_code=422, detail="The party ends after it starts")
    await _sync_event(db, party, user)
    await db.commit()
    base = await public_base(db, request)
    if not party.date_poll and (_utc(party.starts_at), _utc(party.ends_at), party.place, party.address) != before[:4]:
        await mail_guests(db, party, "change", base=base)
    if party.thanks_published and not before[4]:
        await mail_guests(db, party, "thanks", base=base, text=party.thanks_text or "")
    return await _detail(db, party, request)


@router.post("/{party_id}/decide")
async def decide(party_id: uuid.UUID, payload: DecideIn, request: Request, user: AdultUser, db: DB) -> dict:
    """The date is set: the vote closes, the party goes in the calendar, each guest is coming if
    they voted for it (they can change their reply), and those who asked for updates hear of it."""
    party = await _mine(db, user, party_id)
    option = _iso(payload.option)
    if not party.date_poll or option not in (party.date_options or []):
        raise HTTPException(status_code=404, detail="Not one of the dates")
    length = _utc(party.ends_at) - _utc(party.starts_at)
    party.starts_at = datetime.fromisoformat(option)
    party.ends_at = party.starts_at + length
    party.date_poll = False
    for guest in (await db.execute(select(PartyGuest).where(PartyGuest.party_id == party.id))).scalars():
        guest.coming = option in (guest.date_votes or [])
    await _sync_event(db, party, user)
    await db.commit()
    await mail_guests(db, party, "decided", base=await public_base(db, request))
    return await _detail(db, party, request)


@router.post("/{party_id}/announce")
async def announce(party_id: uuid.UUID, payload: AnnounceIn, request: Request, user: AdultUser, db: DB) -> dict:
    """A message to every guest who asked for updates by e-mail."""
    party = await _mine(db, user, party_id)
    if not await _mail_ready(db):
        raise HTTPException(status_code=409, detail="E-mail isn't set up on this server")
    sent = await mail_guests(db, party, "message", base=await public_base(db, request), subject=payload.subject.strip(), text=payload.text.strip())
    return {"sent": sent}


@router.delete("/{party_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_party(party_id: uuid.UUID, user: AdultUser, db: DB) -> None:
    party = await _mine(db, user, party_id)
    event_id = party.event_id
    for model in (PartyGuest, PartyTask, PartyExpense, PartyStep):
        await db.execute(delete(model).where(model.party_id == party.id))
    await db.delete(party)
    if event_id and (event := await db.get(FamilyEvent, event_id)) is not None:
        await db.delete(event)
    await db.commit()


@router.post("/{party_id}/link")
async def new_link(party_id: uuid.UUID, request: Request, user: AdultUser, db: DB) -> dict:
    """A new invitation link; the old one stops working."""
    party = await _mine(db, user, party_id)
    token = secrets.token_urlsafe(18)
    party.token_hash, party.token_encrypted = _hash(token), encrypt_token(token)
    await db.commit()
    return await _detail(db, party, request)


@router.post("/{party_id}/tasks", status_code=status.HTTP_201_CREATED)
async def add_task(party_id: uuid.UUID, payload: TaskIn, request: Request, user: AdultUser, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    count = (await db.execute(select(func.count()).select_from(PartyTask).where(PartyTask.party_id == party.id))).scalar_one()
    db.add(PartyTask(family_id=party.family_id, party_id=party.id, title=payload.title.strip(), due_date=payload.due_date, who=payload.who, position=count))
    await db.commit()
    return await _detail(db, party, request)


@router.put("/{party_id}/tasks/{task_id}")
async def change_task(party_id: uuid.UUID, task_id: uuid.UUID, payload: TaskChange, request: Request, user: AdultUser, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    task = await db.get(PartyTask, task_id)
    if task is None or task.party_id != party.id:
        raise HTTPException(status_code=404, detail="Not found")
    changes = payload.model_dump(exclude_unset=True)
    if "due_date" in changes and changes["due_date"] != task.due_date:
        task.reminded_on = None
    for key, value in changes.items():
        if key == "title" and value is None:
            continue
        setattr(task, key, value)
    await db.commit()
    return await _detail(db, party, request)


@router.delete("/{party_id}/tasks/{task_id}")
async def delete_task(party_id: uuid.UUID, task_id: uuid.UUID, request: Request, user: AdultUser, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    await db.execute(delete(PartyTask).where(PartyTask.id == task_id, PartyTask.party_id == party.id))
    await db.commit()
    return await _detail(db, party, request)


@router.post("/{party_id}/expenses", status_code=status.HTTP_201_CREATED)
async def add_expense(party_id: uuid.UUID, payload: ExpenseIn, request: Request, user: AdultUser, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    db.add(PartyExpense(family_id=party.family_id, party_id=party.id, title=payload.title.strip(), amount=payload.amount, paid_by=payload.paid_by or user.id, created_at=datetime.now(timezone.utc)))
    await db.commit()
    return await _detail(db, party, request)


@router.delete("/{party_id}/expenses/{expense_id}")
async def delete_expense(party_id: uuid.UUID, expense_id: uuid.UUID, request: Request, user: AdultUser, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    await db.execute(delete(PartyExpense).where(PartyExpense.id == expense_id, PartyExpense.party_id == party.id))
    await db.commit()
    return await _detail(db, party, request)


@router.post("/{party_id}/steps", status_code=status.HTTP_201_CREATED)
async def add_step(party_id: uuid.UUID, payload: StepIn, request: Request, user: AdultUser, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    db.add(PartyStep(family_id=party.family_id, party_id=party.id, at=payload.at, title=payload.title.strip()))
    await db.commit()
    return await _detail(db, party, request)


@router.delete("/{party_id}/steps/{step_id}")
async def delete_step(party_id: uuid.UUID, step_id: uuid.UUID, request: Request, user: AdultUser, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    await db.execute(delete(PartyStep).where(PartyStep.id == step_id, PartyStep.party_id == party.id))
    await db.commit()
    return await _detail(db, party, request)


@router.post("/{party_id}/guests", status_code=status.HTTP_201_CREATED)
async def add_guest(party_id: uuid.UUID, payload: GuestIn, request: Request, user: AdultUser, db: DB) -> dict:
    """A reply that came by text or at the door: an adult adds it."""
    party = await _mine(db, user, party_id)
    now = datetime.now(timezone.utc)
    db.add(PartyGuest(family_id=party.family_id, party_id=party.id, key_hash=_hash(secrets.token_urlsafe(18)), created_at=now, updated_at=now, **_clean_guest(payload, party)))
    await db.commit()
    return await _detail(db, party, request)


@router.delete("/{party_id}/guests/{guest_id}")
async def delete_guest(party_id: uuid.UUID, guest_id: uuid.UUID, request: Request, user: AdultUser, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    await db.execute(delete(PartyGuest).where(PartyGuest.id == guest_id, PartyGuest.party_id == party.id))
    await db.commit()
    return await _detail(db, party, request)


def _clean_guest(payload: GuestIn, party: Party) -> dict:
    data = {k: (v.strip() if isinstance(v, str) else v) for k, v in payload.model_dump().items()}
    if party.households or not party.plus_one or not data.get("plus_first_name"):
        data.update(plus_first_name=None, plus_last_name=None, plus_allergies="")
    if not party.households:
        data.update(adults=1, children=0)
    elif data["coming"] and data["adults"] + data["children"] < 1:
        data["adults"] = 1
    votes = data.pop("date_votes", None)
    if party.date_poll:
        # Only the dates on offer; a guest is "coming" while voting if some date suits them.
        chosen = set()
        for v in votes or []:
            try:
                chosen.add(_iso(datetime.fromisoformat(v.replace("Z", "+00:00"))))
            except ValueError:
                continue
        data["date_votes"] = [o for o in party.date_options or [] if o in chosen]
        data["coming"] = bool(data["date_votes"])
    data["email"] = (data.get("email") or "").lower() or None
    data["updates"] = bool(data.get("updates") and data["email"])
    return data


# --- The guests' side, through the link ------------------------------------------------------


async def _open(db: AsyncSession, token: str, request: Request) -> Party:
    ip = login_throttle.client_ip(request)
    if login_throttle.ip_retry_after(ip):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    party = (await db.execute(select(Party).where(Party.token_hash == _hash(token)))).scalar_one_or_none()
    if party is None:
        login_throttle.record_ip_failure(ip)
        raise HTTPException(status_code=404, detail="This link isn't valid")
    return party


def _utc(moment: datetime) -> datetime:
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def _open_for_replies(party: Party) -> bool:
    return datetime.now(timezone.utc) < _utc(party.ends_at)


@public.get("/{token}")
async def invitation(token: str, request: Request, response: Response, db: DB, key: str | None = None, wish_key: str | None = None) -> dict:
    party = await _open(db, token, request)
    response.headers.update(NO_STORE)
    family = await db.get(Family, party.family_id)
    guests = (await db.execute(select(PartyGuest).where(PartyGuest.party_id == party.id).order_by(PartyGuest.created_at))).scalars().all()
    mine = next((g for g in guests if key and g.key_hash == _hash(key)), None)
    seen = None
    if party.show_guests == "count":
        seen = {"coming": _people(party, guests)}
    elif party.show_guests == "names":
        names = []
        for g in guests:
            if g.coming:
                names.append(f"{g.first_name} {g.last_name}".strip() + (f" (+{_size(party, g) - 1})" if party.households and _size(party, g) > 1 else ""))
                if g.plus_first_name:
                    names.append(f"{g.plus_first_name} {g.plus_last_name or ''}".strip())
        seen = {"coming": _people(party, guests), "names": names}
    wishes = None
    if party.wishlist and party.person_id:
        mine_wish = _hash(wish_key) if wish_key else None
        wishes = [
            {"id": w.id, "title": w.title, "url": w.url, "note": w.note, "reserved": bool(w.reserved_by or w.reserved_by_guest), "reserved_by_you": mine_wish is not None and w.guest_key_hash == mine_wish}
            for w in (await db.execute(select(WishItem).where(WishItem.person_id == party.person_id, WishItem.kind == "wish").order_by(WishItem.created_at))).scalars()
        ]
    thanks = None
    if party.thanks_published:
        photos = []
        if party.thanks_album_id:
            photos = [str(m.id) for m in (await db.execute(select(MediaItem).where(MediaItem.album_id == party.thanks_album_id, MediaItem.kind == "image").order_by(MediaItem.created_at))).scalars()][:200]
        thanks = {"text": party.thanks_text, "photos": photos}
    # The host's language (whoever made the party), else the family admin's.
    host = await db.get(User, party.created_by) if party.created_by else None
    if host is None:
        host = (await db.execute(select(User).where(User.family_id == party.family_id, User.role == "admin").order_by(User.created_at))).scalars().first()
    return {
        "page_theme": party.page_theme, "thanks_theme": party.thanks_theme or party.page_theme, "mail": await _mail_ready(db),
        "date_poll": party.date_poll, "date_options": party.date_options or [], "households": party.households,
        "tally": _tally(party, guests, names=party.show_guests == "names") if party.date_poll and party.show_guests != "none" else None,
        "language": (host.language if host else None) or "en",
        "title": party.title, "kind": party.kind, "emoji": party.emoji, "color": party.color, "family_name": family.name if family else "",
        "starts_at": party.starts_at, "ends_at": party.ends_at, "place": party.place, "address": party.address, "theme": party.theme,
        "invitation": party.invitation, "rsvp_by": party.rsvp_by, "plus_one": party.plus_one, "open": _open_for_replies(party),
        "guests": seen, "wishes": wishes, "thanks": thanks, "mine": _guest_out(mine) if mine else None,
    }


@public.post("/{token}/reply")
async def reply(token: str, payload: GuestIn, request: Request, db: DB, key: str | None = None) -> dict:
    """The guest's reply – or, with the key their browser kept, a change to it."""
    party = await _open(db, token, request)
    if not _open_for_replies(party):
        raise HTTPException(status_code=409, detail="The party is over")
    now = datetime.now(timezone.utc)
    data = _clean_guest(payload, party)
    guest = None
    if key:
        guest = (await db.execute(select(PartyGuest).where(PartyGuest.party_id == party.id, PartyGuest.key_hash == _hash(key)))).scalar_one_or_none()
    if guest is None:
        count = (await db.execute(select(func.count()).select_from(PartyGuest).where(PartyGuest.party_id == party.id))).scalar_one()
        if count >= 500:
            raise HTTPException(status_code=409, detail="Too many replies")
        key = secrets.token_urlsafe(18)
        guest = PartyGuest(family_id=party.family_id, party_id=party.id, key_hash=_hash(key), created_at=now)
        db.add(guest)
    asked_now = data.get("updates") and not guest.updates
    for k, v in data.items():
        setattr(guest, k, v)
    guest.updated_at = now
    await db.commit()
    await _tell_hosts(db, party, guest)
    if asked_now:
        await mail_guests(db, party, "confirm", guests=[guest], base=await public_base(db, request))
    return {"key": key, "mine": _guest_out(guest)}


class UnsubscribeIn(BaseModel):
    code: str = Field(min_length=8, max_length=200)


@public.post("/{token}/unsubscribe")
async def unsubscribe(token: str, payload: UnsubscribeIn, request: Request, db: DB) -> dict:
    """The link in each mail: no more updates for that guest."""
    party = await _open(db, token, request)
    guest = (await db.execute(select(PartyGuest).where(PartyGuest.party_id == party.id, PartyGuest.unsubscribe_hash == _hash(payload.code)))).scalar_one_or_none()
    if guest is not None:
        guest.updates = False
        guest.unsubscribe_hash = None
        await db.commit()
    return {"done": True}


async def _tell_hosts(db: AsyncSession, party: Party, guest: PartyGuest) -> None:
    from app.services.notify import notify

    text = {
        "en": ("{name} replied: {answer}", ("coming", "not coming")), "sv": ("{name} har svarat: {answer}", ("kommer", "kommer inte")),
        "nb": ("{name} har svart: {answer}", ("kommer", "kommer ikke")), "da": ("{name} har svaret: {answer}", ("kommer", "kommer ikke")),
        "fi": ("{name} vastasi: {answer}", ("tulee", "ei tule")),
    }
    adults = (await db.execute(select(User).where(User.family_id == party.family_id, User.role.in_(["admin", "adult"])))).scalars().all()
    for adult in adults:
        title, answers = text.get(adult.language or "en", text["en"])
        await notify(db, adult, {"title": f"{party.emoji} {party.title}", "body": title.format(name=f"{guest.first_name} {guest.last_name}".strip(), answer=answers[0 if guest.coming else 1]), "route": f"/parties?id={party.id}", "kind": "party_reply"}, pref="calendar_family")


@public.delete("/{token}/reply", status_code=status.HTTP_204_NO_CONTENT)
async def withdraw(token: str, request: Request, db: DB, key: str) -> None:
    party = await _open(db, token, request)
    await db.execute(delete(PartyGuest).where(PartyGuest.party_id == party.id, PartyGuest.key_hash == _hash(key)))
    await db.commit()


@public.get("/{token}/calendar.ics")
async def to_calendar(token: str, request: Request, db: DB) -> Response:
    """The party for the guest's own calendar."""
    import icalendar

    party = await _open(db, token, request)
    cal = icalendar.Calendar()
    cal.add("prodid", "-//Smooth Family//Party//EN")
    cal.add("version", "2.0")
    ev = icalendar.Event()
    ev.add("uid", f"party-{party.id}@smooth-family")
    ev.add("summary", f"{party.emoji} {party.title}".strip())
    ev.add("dtstart", _utc(party.starts_at))
    ev.add("dtend", _utc(party.ends_at))
    if party.place or party.address:
        ev.add("location", ", ".join(x for x in (party.place, party.address) if x))
    if party.invitation:
        ev.add("description", party.invitation)
    cal.add_component(ev)
    safe = re.sub(r"[^A-Za-z0-9_-]+", "-", party.title).strip("-") or "party"
    return Response(content=cal.to_ical(), media_type="text/calendar", headers={**NO_STORE, "Content-Disposition": f'attachment; filename="{safe}.ics"'})


class WishReserveIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)


@public.post("/{token}/wishes/{wish_id}/reserve")
async def reserve(token: str, wish_id: uuid.UUID, payload: WishReserveIn, request: Request, db: DB) -> dict:
    """"I'll buy this" – hidden from the one it's for, as on the wish list's own link."""
    party = await _open(db, token, request)
    wish = await db.get(WishItem, wish_id)
    if not party.wishlist or wish is None or wish.person_id != party.person_id or wish.kind != "wish":
        raise HTTPException(status_code=404, detail="Wish not found")
    if wish.reserved_by is not None or wish.reserved_by_guest is not None:
        raise HTTPException(status_code=409, detail="Someone is already buying this")
    key = secrets.token_urlsafe(18)
    wish.reserved_by_guest = payload.name.strip()
    wish.guest_key_hash = _hash(key)
    await db.commit()
    return {"key": key}


@public.delete("/{token}/wishes/{wish_id}/reserve", status_code=status.HTTP_204_NO_CONTENT)
async def unreserve(token: str, wish_id: uuid.UUID, request: Request, db: DB, key: str) -> None:
    party = await _open(db, token, request)
    wish = await db.get(WishItem, wish_id)
    if wish is None or wish.person_id != party.person_id or wish.guest_key_hash != _hash(key):
        raise HTTPException(status_code=404, detail="Reservation not found")
    wish.reserved_by_guest = None
    wish.guest_key_hash = None
    await db.commit()


@public.get("/{token}/photos/{item_id}")
async def photo(token: str, item_id: uuid.UUID, request: Request, db: DB, variant: str = Query(default="view", pattern=r"^(thumb|view)$")) -> Response:
    """A photo on the thank-you page: the web-sized copy, never the original."""
    party = await _open(db, token, request)
    item = await db.get(MediaItem, item_id)
    if not party.thanks_published or item is None or item.album_id != party.thanks_album_id or item.kind != "image":
        raise HTTPException(status_code=404, detail="Not found")
    storage = get_storage()
    base = item.storage_key.rsplit(".", 1)[0]
    key = base + ("_thumb.jpg" if variant == "thumb" else "_web.jpg")
    if not storage.exists(item.family_id, key):
        raise HTTPException(status_code=404, detail="Not found")
    return Response(content=storage.open(item.family_id, key).read_bytes(), media_type="image/jpeg", headers=NO_STORE)


# --- Reminders ---------------------------------------------------------------------------------


async def run_party_reminders(db: AsyncSession, now: datetime | None = None) -> int:
    """Each morning from 8: the adults are told of what's due today for a party (once)."""
    from app.services.notify import notify

    local = (now or datetime.now(timezone.utc)).astimezone(_tz())
    if local.hour < 8:
        return 0
    today = local.date()
    due = (
        await db.execute(select(PartyTask).where(PartyTask.done == False, PartyTask.due_date.is_not(None), PartyTask.due_date <= today, PartyTask.reminded_on.is_(None)))  # noqa: E712
    ).scalars().all()
    sent = 0
    for task in due:
        party = await db.get(Party, task.party_id)
        task.reminded_on = today
        if party is None or _local(party.ends_at).date() + timedelta(days=7) < today:
            continue
        adults = (await db.execute(select(User).where(User.family_id == party.family_id, User.role.in_(["admin", "adult"])))).scalars().all()
        for adult in adults:
            if task.who and task.who != adult.id:
                continue
            await notify(db, adult, {"title": f"{party.emoji} {party.title}", "body": task.title, "route": f"/parties?id={party.id}", "kind": "party_task"}, pref="calendar_family")
            sent += 1
    await db.commit()
    # The guests who asked for updates: the day before, at the same morning hour.
    tomorrow = today + timedelta(days=1)
    for party in (await db.execute(select(Party).where(Party.guests_reminded_on.is_(None), Party.date_poll == False))).scalars().all():  # noqa: E712
        if _local(party.starts_at).date() != tomorrow:
            continue
        party.guests_reminded_on = today
        coming = (await db.execute(select(PartyGuest).where(PartyGuest.party_id == party.id, PartyGuest.coming == True, PartyGuest.updates == True))).scalars().all()  # noqa: E712
        await db.commit()
        sent += await mail_guests(db, party, "remind", guests=coming, base=await public_base(db))
    return sent

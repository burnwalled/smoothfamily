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
from dataclasses import dataclass
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.deps import DB, AdultUser, get_current_user
from app.models import Album, ChatMessage, Conversation, ConversationMember, Family, FamilyEvent, MediaItem, Party, PartyExpense, PartyGuest, PartyHelper, PartyMailing, PartyPlanItem, PartyStep, PartyTask, PartyTemplate, PartyTheme, PartyVendor, Person, User, WishItem
from app.services import login_throttle, party_mail
from app.services.crypto import decrypt_token, encrypt_token
from app.services.mfa import qr_svg
from app.services.public_url import configured_url, public_base
from app.services.storage import get_storage
from app.services.weather import _tz

HELPER_COOKIE = "smooth_party_helper"


@dataclass
class HelperActor:
    """A helper from outside, acting on the one party their link is for. Things they make are the
    hosts' on paper (id: whoever made the party)."""

    id: uuid.UUID
    family_id: uuid.UUID
    language: str
    helper_id: uuid.UUID
    party_id: uuid.UUID
    is_helper: bool = True


def _helper_ends(helper: PartyHelper, party: Party) -> datetime:
    return _utc(party.ends_at) + timedelta(days=helper.days_after)


async def _helper_session(request: Request, db: AsyncSession) -> HelperActor | None:
    token = request.cookies.get(HELPER_COOKIE)
    if not token:
        return None
    helper = (await db.execute(select(PartyHelper).where(PartyHelper.token_hash == _hash(token)))).scalar_one_or_none()
    party = await db.get(Party, helper.party_id) if helper else None
    family = await db.get(Family, party.family_id) if party else None
    if helper is None or party is None or family is None or family.status != "active" or datetime.now(timezone.utc) >= _helper_ends(helper, party):
        return None
    return HelperActor(id=party.created_by, family_id=party.family_id, language=await _host_language(db, party), helper_id=helper.id, party_id=party.id)


async def party_actor(request: Request, db: DB) -> User | HelperActor:
    """Who's planning: a family's adult with the calendar app, or a helper with their link. On a helper's
    own page (the header) it's always the helper, also in a browser signed in to the app."""
    actor: User | HelperActor | None = None
    if request.headers.get("x-party-helper"):
        actor = await _helper_session(request, db)
        if actor is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="This link has ended")
    else:
        try:
            user = await get_current_user(request, db)
        except HTTPException:
            actor = await _helper_session(request, db)
            if actor is None:
                raise
        else:
            if user.role not in ("admin", "adult"):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Adults only")
            if "calendar" not in user.apps:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This app is not enabled for you")
            actor = user
    request.state.party_actor = actor
    return actor


PartyActor = Annotated[User | HelperActor, Depends(party_actor)]
router = APIRouter(prefix="/api/parties", tags=["parties"], dependencies=[Depends(party_actor)])
helpers = APIRouter(prefix="/api/party-help", tags=["party-help"])
public = APIRouter(prefix="/api/party", tags=["party-public"])

KINDS = ("child_birthday", "birthday", "party", "dinner", "match", "bbq", "outdoor")
KIND_PATTERN = rf"^({'|'.join(KINDS)})$"
NO_STORE = {"Cache-Control": "no-store, private", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer"}


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# --- What a new party starts with ------------------------------------------------------------

# (days before the party, title) – negative days are before; the RSVP ones move with the RSVP date.
# Each kind of party starts with its own list.
_REMIND = {"en": "Remind those who haven't replied", "sv": "Påminn dem som inte svarat", "nb": "Påminn dem som ikke har svart", "da": "Påmind dem, der ikke har svaret", "fi": "Muistuta niitä, jotka eivät ole vastanneet"}
_COUNT = {"en": "Count the guests and check the allergies", "sv": "Räkna gästerna och kolla allergierna", "nb": "Tell gjestene og sjekk allergiene", "da": "Tæl gæsterne, og tjek allergierne", "fi": "Laske vieraat ja tarkista allergiat"}
_SHARE = {"en": "Share the invitation", "sv": "Dela inbjudan", "nb": "Del invitasjonen", "da": "Del invitationen", "fi": "Jaa kutsu"}
_PRINT_QR = {"en": "Print the QR code for the party day's portal", "sv": "Skriv ut QR-koden till festportalen", "nb": "Skriv ut QR-koden til festportalen", "da": "Udskriv QR-koden til festportalen", "fi": "Tulosta juhlaportaalin QR-koodi"}
_THANK = {"en": "Publish the thank-you page with the photos", "sv": "Publicera tacksidan med bilderna", "nb": "Publiser takkesiden med bildene", "da": "Udgiv taksiden med billederne", "fi": "Julkaise kiitossivu kuvineen"}
_WEATHER = {"en": "Check the weather – and a plan B", "sv": "Kolla vädret – och en plan B", "nb": "Sjekk været – og en plan B", "da": "Tjek vejret – og en plan B", "fi": "Tarkista sää – ja varasuunnitelma"}
_OWN = {
    "kids": {
        "en": [(-14, "Order or plan the cake"), (-7, "Buy decorations"), (-2, "Shop for the food"), (-1, "Get the games and music ready")],
        "sv": [(-14, "Beställ eller planera tårtan"), (-7, "Köp dekorationer"), (-2, "Handla maten"), (-1, "Förbered lekar och musik")],
        "nb": [(-14, "Bestill eller planlegg kaken"), (-7, "Kjøp dekorasjoner"), (-2, "Handle maten"), (-1, "Forbered leker og musikk")],
        "da": [(-14, "Bestil eller planlæg kagen"), (-7, "Køb pynt"), (-2, "Køb ind til maden"), (-1, "Forbered lege og musik")],
        "fi": [(-14, "Tilaa tai suunnittele kakku"), (-7, "Osta koristeet"), (-2, "Tee ruokaostokset"), (-1, "Valmistele leikit ja musiikki")],
    },
    "party": {
        "en": [(-14, "Plan the food and drinks"), (-7, "Make the playlist"), (-7, "Buy decorations"), (-2, "Shop for the food and drinks"), (0, "Decorate and set up")],
        "sv": [(-14, "Planera mat och dryck"), (-7, "Gör spellistan"), (-7, "Köp dekorationer"), (-2, "Handla mat och dryck"), (0, "Dekorera och duka fram")],
        "nb": [(-14, "Planlegg mat og drikke"), (-7, "Lag spillelisten"), (-7, "Kjøp dekorasjoner"), (-2, "Handle mat og drikke"), (0, "Pynt og rigg til")],
        "da": [(-14, "Planlæg mad og drikke"), (-7, "Lav playlisten"), (-7, "Køb pynt"), (-2, "Køb ind til mad og drikke"), (0, "Pynt op, og stil frem")],
        "fi": [(-14, "Suunnittele ruoat ja juomat"), (-7, "Tee soittolista"), (-7, "Osta koristeet"), (-2, "Osta ruoat ja juomat"), (0, "Koristele ja kattaa")],
    },
    "dinner": {
        "en": [(-14, "Plan the menu"), (-7, "Choose the drinks"), (-2, "Shop for the food"), (0, "Set the table – flowers and candles")],
        "sv": [(-14, "Planera menyn"), (-7, "Välj drycker"), (-2, "Handla maten"), (0, "Duka – blommor och ljus")],
        "nb": [(-14, "Planlegg menyen"), (-7, "Velg drikke"), (-2, "Handle maten"), (0, "Dekk bordet – blomster og lys")],
        "da": [(-14, "Planlæg menuen"), (-7, "Vælg drikkevarer"), (-2, "Køb ind til maden"), (0, "Dæk bord – blomster og lys")],
        "fi": [(-14, "Suunnittele menu"), (-7, "Valitse juomat"), (-2, "Tee ruokaostokset"), (0, "Kattaa pöytä – kukat ja kynttilät")],
    },
    "match": {
        "en": [(-7, "Check the kick-off and where it's shown"), (-3, "Find the jerseys, scarves and flags"), (-1, "Shop for snacks and drinks"), (0, "Test the TV and the sound")],
        "sv": [(-7, "Kolla avsparken och var den sänds"), (-3, "Fram med tröjor, halsdukar och flaggor"), (-1, "Handla snacks och dryck"), (0, "Testa tv:n och ljudet")],
        "nb": [(-7, "Sjekk avspark og hvor kampen vises"), (-3, "Finn fram drakter, skjerf og flagg"), (-1, "Handle snacks og drikke"), (0, "Test tv-en og lyden")],
        "da": [(-7, "Tjek kampstart, og hvor den vises"), (-3, "Find trøjer, halstørklæder og flag frem"), (-1, "Køb snacks og drikke"), (0, "Test tv'et og lyden")],
        "fi": [(-7, "Tarkista aloitusaika ja missä ottelu näytetään"), (-3, "Esiin pelipaidat, huivit ja liput"), (-1, "Osta naposteltavat ja juomat"), (0, "Testaa tv ja ääni")],
    },
    "bbq": {
        "en": [(-7, "Check the grill – charcoal or gas"), (-2, "W"), (-1, "Shop – something vegetarian too"), (0, "Light the grill in good time")],
        "sv": [(-7, "Kolla grillen – kol eller gasol"), (-2, "W"), (-1, "Handla – något vegetariskt också"), (0, "Tänd grillen i god tid")],
        "nb": [(-7, "Sjekk grillen – kull eller gass"), (-2, "W"), (-1, "Handle – noe vegetarisk også"), (0, "Tenn grillen i god tid")],
        "da": [(-7, "Tjek grillen – kul eller gas"), (-2, "W"), (-1, "Køb ind – også noget vegetarisk"), (0, "Tænd grillen i god tid")],
        "fi": [(-7, "Tarkista grilli – hiilet tai kaasu"), (-2, "W"), (-1, "Tee ostokset – myös jotain kasvisruokaa"), (0, "Sytytä grilli ajoissa")],
    },
    "outdoor": {
        "en": [(-3, "Get the gear – bats, balls, cones"), (-1, "W"), (-1, "Pack water, snacks and sunscreen")],
        "sv": [(-3, "Fixa utrustningen – trä, bollar, koner"), (-1, "W"), (-1, "Packa vatten, fika och solkräm")],
        "nb": [(-3, "Skaff utstyret – balltre, baller, kjegler"), (-1, "W"), (-1, "Pakk vann, mat og solkrem")],
        "da": [(-3, "Find udstyret – bat, bolde, kegler"), (-1, "W"), (-1, "Pak vand, snacks og solcreme")],
        "fi": [(-3, "Hanki varusteet – mailat, pallot, kartiot"), (-1, "W"), (-1, "Pakkaa vettä, eväät ja aurinkorasva")],
    },
}
_GROUP = {"child_birthday": "kids", "birthday": "party", "party": "party", "dinner": "dinner", "match": "match", "bbq": "bbq", "outdoor": "outdoor"}


def _tasks_for(kind: str, language: str) -> list[tuple]:
    lang = language if language in _SHARE else "en"
    group = _GROUP.get(kind, "party")
    own = [(when, _WEATHER[lang] if title == "W" else title) for when, title in _OWN[group][lang]]
    share = -10 if group == "match" else -21 if group in ("kids", "party", "dinner") else -14
    out = [(share, _SHARE[lang]), *own, ("rsvp-2", _REMIND[lang]), ("rsvp+1", _COUNT[lang]), (1, _THANK[lang])]
    return sorted(out, key=lambda x: x[0] if isinstance(x[0], int) else -2 if x[0] == "rsvp-2" else -1.5)


# (minutes from the start, or "end-N" / "end", title) – the day of a child's party.
_STEPS = {
    "en": [(0, "The guests arrive"), (20, "Games"), (75, "Cake and presents"), ("end-15", "Party bags"), ("end", "Pick-up")],
    "sv": [(0, "Gästerna kommer"), (20, "Lekar"), (75, "Tårta och presenter"), ("end-15", "Godispåsar"), ("end", "Hämtning")],
    "nb": [(0, "Gjestene kommer"), (20, "Leker"), (75, "Kake og gaver"), ("end-15", "Godteposer"), ("end", "Henting")],
    "da": [(0, "Gæsterne kommer"), (20, "Lege"), (75, "Kage og gaver"), ("end-15", "Slikposer"), ("end", "Afhentning")],
    "fi": [(0, "Vieraat saapuvat"), (20, "Leikit"), (75, "Kakku ja lahjat"), ("end-15", "Karkkipussit"), ("end", "Haku")],
}


async def _came(db: AsyncSession, party: Party) -> list[PartyGuest]:
    """Those the thank-you is for: the guests who said they'd come."""
    return (await db.execute(select(PartyGuest).where(PartyGuest.party_id == party.id, PartyGuest.coming == True))).scalars().all()  # noqa: E712


async def _mail_ready(db: AsyncSession, party: Party) -> bool:
    """Whether this family's server lets it send e-mail (a hosted family needs the admin's yes)."""
    from app.services import mailer

    return await mailer.configured(db, await db.get(Family, party.family_id))


def _local(moment: datetime) -> datetime:
    return (moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)).astimezone(_tz())


def _starter_tasks(party: Party, language: str, today: date) -> list[PartyTask]:
    day = _local(party.starts_at).date()
    out = []
    for i, (when, title) in enumerate(_tasks_for(party.kind, language)):
        if isinstance(when, str):
            if party.rsvp_by is None:
                continue
            due = party.rsvp_by + timedelta(days=int(when[4:]))
        else:
            due = day + timedelta(days=when)
        out.append(PartyTask(family_id=party.family_id, party_id=party.id, title=title, due_date=max(due, today), position=i))
    out.append(_qr_task(party, language, today, len(out)))
    return out


def _qr_task(party: Party, language: str, today: date, position: int) -> PartyTask:
    due = max(_local(party.starts_at).date() - timedelta(days=1), today)
    return PartyTask(family_id=party.family_id, party_id=party.id, title=_PRINT_QR.get(language, _PRINT_QR["en"]), due_date=due, position=position, action="print_qr")


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

# The built-in looks (drawn by the guests' page), by the kind of party they suit; "custom" is one
# of the family's own.
THEMES = (
    "balloons", "jungle", "space", "ocean", "fairytale", "pirate", "dinosaur", "superhero", "unicorn",
    "disco", "glitter", "eighties", "nineties", "glamour", "techno", "champagne", "neon", "student", "halloween", "newyear",
    "wedding", "elegant", "bistro", "christmas", "midsummer", "crayfish", "garden",
    "football", "hockey", "sports",
    "bbq", "brannboll", "beach", "picnic",
)
THEME_PATTERN = rf"^({'|'.join(THEMES)}|custom)$"
PATTERNS = ("none", "confetti", "dots", "stars", "stripes", "hearts", "check")
BRING = r"^(none|one|family)$"

_MAIL = {
    "en": {
        "confirm": ("{title}: thank you for your reply", "Thank you, {name}! We have your reply: {answer}."),
        "change": ("{title}: a new time or place", "Something has changed for {title}."),
        "remind": ("{title} is tomorrow", "A reminder: {title} is tomorrow."),
        "thanks": ("{title}: thank you!", "{text}"),
        "message": ("{title}: {subject}", "{text}"),
        "answers": ("coming", "not coming"), "plus": "with {name}",
        "decided": ("{title}: the date is set", "The date for {title} is set – see you then!"),
        "voted": "you voted for {n} date(s)",
        "subscribed": ("{title}: you'll hear from us", "Thank you, {name}! Save the date – we'll send the invitation when it's ready."),
        "invited": ("{title}: the invitation is here", "The invitation to {title} is here – reply on the party's page."),
        "save": ("Save the date: {title}", "Save the date – {title}! The invitation follows; the page has the date and a button for your calendar."),
        "remind_rsvp": ("{title}: we haven't heard from you", "Hi {name}! We haven't had your reply to the invitation to {title}.{by}"),
        "reminder": ("{title}: a reminder", "A reminder about {title}."),
        "by": " Please reply by {date}.",
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
        "voted": "du har röstat på {n} datum",
        "subscribed": ("{title}: du hör av oss", "Tack, {name}! Spara datumet – vi skickar inbjudan när den är klar."),
        "invited": ("{title}: inbjudan är här", "Inbjudan till {title} är här – svara på festens sida."),
        "save": ("Spara datumet: {title}", "Spara datumet – {title}! Inbjudan kommer; på sidan finns datumet och en knapp för din kalender."),
        "remind_rsvp": ("{title}: vi har inte hört från dig", "Hej {name}! Vi har inte fått ditt svar på inbjudan till {title}.{by}"),
        "reminder": ("{title}: en påminnelse", "En påminnelse om {title}."),
        "by": " Svara senast {date}.",
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
        "voted": "du har stemt på {n} dato(er)",
        "subscribed": ("{title}: du hører fra oss", "Takk, {name}! Sett av datoen – vi sender invitasjonen når den er klar."),
        "invited": ("{title}: invitasjonen er her", "Invitasjonen til {title} er her – svar på festens side."),
        "save": ("Sett av datoen: {title}", "Sett av datoen – {title}! Invitasjonen kommer; på siden finner du datoen og en knapp for kalenderen din."),
        "remind_rsvp": ("{title}: vi har ikke hørt fra deg", "Hei {name}! Vi har ikke fått svaret ditt på invitasjonen til {title}.{by}"),
        "reminder": ("{title}: en påminnelse", "En påminnelse om {title}."),
        "by": " Svar innen {date}.",
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
        "voted": "du har stemt på {n} dato(er)",
        "subscribed": ("{title}: du hører fra os", "Tak, {name}! Gem datoen – vi sender invitationen, når den er klar."),
        "invited": ("{title}: invitationen er her", "Invitationen til {title} er her – svar på festens side."),
        "save": ("Gem datoen: {title}", "Gem datoen – {title}! Invitationen kommer; på siden er datoen og en knap til din kalender."),
        "remind_rsvp": ("{title}: vi har ikke hørt fra dig", "Hej {name}! Vi har ikke fået dit svar på invitationen til {title}.{by}"),
        "reminder": ("{title}: en påmindelse", "En påmindelse om {title}."),
        "by": " Svar senest {date}.",
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
        "voted": "äänestit {n} päivää",
        "subscribed": ("{title}: kuulet meistä", "Kiitos, {name}! Merkitse päivä – lähetämme kutsun, kun se on valmis."),
        "invited": ("{title}: kutsu on täällä", "Kutsu juhliin {title} on täällä – vastaa juhlien sivulla."),
        "save": ("Merkitse päivä: {title}", "Merkitse päivä – {title}! Kutsu tulee perässä; sivulla on päivä ja painike kalenteriisi."),
        "remind_rsvp": ("{title}: emme ole kuulleet sinusta", "Hei {name}! Emme ole saaneet vastaustasi kutsuun: {title}.{by}"),
        "reminder": ("{title}: muistutus", "Muistutus: {title}."),
        "by": " Vastaa viimeistään {date}.",
        "page": "Juhlien sivu: {link}", "stop": "Saat tämän, koska pyysit päivityksiä vastatessasi. Lopeta ne: {link}",
    },
}


for _lang, _texts in {
    "en": {"checkin": ("{title}: are you ready?", "It's soon time for {title}! Are you coming? Answer with a thumb up or down on your page – and tell us if something's come up."), "helper": ("You're helping with {title}", "Hi {name}! You've been asked to help with {title} as {role}. Your own link, until {until}:\n{link}\n\nDon't share it: it gives access to the party's planning."), "helper_task": ("{title}: a task for you", "{task}\n\n{link}")},
    "sv": {"checkin": ("{title}: är du taggad?", "Snart är det dags för {title}! Kommer du? Svara med tummen upp eller ner på din sida – och säg till om något har hänt."), "helper": ("Du hjälper till med {title}", "Hej {name}! Du har blivit ombedd att hjälpa till med {title} som {role}. Din egen länk, till och med {until}:\n{link}\n\nDela den inte: den ger tillgång till festens planering."), "helper_task": ("{title}: en uppgift till dig", "{task}\n\n{link}")},
    "nb": {"checkin": ("{title}: er du klar?", "Snart er det tid for {title}! Kommer du? Svar med tommel opp eller ned på siden din – og si fra om noe har skjedd."), "helper": ("Du hjelper til med {title}", "Hei {name}! Du er bedt om å hjelpe til med {title} som {role}. Din egen lenke, til og med {until}:\n{link}\n\nIkke del den: den gir tilgang til festens planlegging."), "helper_task": ("{title}: en oppgave til deg", "{task}\n\n{link}")},
    "da": {"checkin": ("{title}: er du klar?", "Snart er det tid til {title}! Kommer du? Svar med tommel op eller ned på din side – og sig til, hvis der er sket noget."), "helper": ("Du hjælper med {title}", "Hej {name}! Du er blevet bedt om at hjælpe med {title} som {role}. Dit eget link, til og med {until}:\n{link}\n\nDel det ikke: det giver adgang til festens planlægning."), "helper_task": ("{title}: en opgave til dig", "{task}\n\n{link}")},
    "fi": {"checkin": ("{title}: oletko valmis?", "Pian on aika: {title}! Tuletko? Vastaa peukulla ylös tai alas sivullasi – ja kerro, jos jotain on sattunut."), "helper": ("Autat juhlissa: {title}", "Hei {name}! Sinua on pyydetty auttamaan juhlissa {title} roolissa {role}. Oma linkkisi, {until} asti:\n{link}\n\nÄlä jaa sitä: se antaa pääsyn juhlien suunnitteluun."), "helper_task": ("{title}: tehtävä sinulle", "{task}\n\n{link}")},
}.items():
    _MAIL[_lang].update(_texts)
_ROLES = {
    "en": {"toastmaster": "toastmaster", "toastmadame": "toastmadame", "helper": "helper"},
    "sv": {"toastmaster": "toastmaster", "toastmadame": "toastmadame", "helper": "hjälpare"},
    "nb": {"toastmaster": "toastmaster", "toastmadame": "toastmadame", "helper": "hjelper"},
    "da": {"toastmaster": "toastmaster", "toastmadame": "toastmadame", "helper": "hjælper"},
    "fi": {"toastmaster": "toastmaster", "toastmadame": "toastmadame", "helper": "auttaja"},
}
# The mails the hosts can word themselves, in the order of the party.
# (A save-the-date is shared by hand: there are no addresses yet. Those planned earlier still go.)
SHARE_KINDS = ("share_save", "share_invite")
MAIL_KINDS = ("save", "subscribed", "invited", "confirm", "change", "decided", "remind_rsvp", "reminder", "checkin", "remind", "thanks")


def _fill(template: str, fields: dict) -> str:
    """The {fields} of a text the hosts may have written: what isn't a field stays as it is."""
    return re.sub(r"\{(\w+)\}", lambda m: str(fields[m.group(1)]) if m.group(1) in fields else m.group(0), template)


_OPEN = {"en": "Open your page", "sv": "Öppna din sida", "nb": "Åpne siden din", "da": "Åbn din side", "fi": "Avaa sivusi"}


async def _mail_look(db: AsyncSession, party: Party, base: str) -> tuple[dict, str | None]:
    """The party's colours for its mails, and its top picture where a mail program can fetch it."""
    custom = await db.get(PartyTheme, party.page_custom_id) if party.page_theme == "custom" and party.page_custom_id else None
    colors = party_mail.palette(party.page_theme, custom)
    if not base:
        return colors, None
    if custom is not None:
        version = _version(custom.header_key)
        return colors, f"{base}/api/party/{decrypt_token(party.token_encrypted)}/themes/{custom.id}/header?v={version}" if custom.header_key else None
    return colors, f"{base}{colors['header']}" if colors.get("header") else None


def _small_print(stop: str) -> tuple[str, str]:
    """Why they get it, and how to stop, as the two parts of the text: the second becomes the link."""
    head, _, tail = stop.replace("{link}", "").rpartition(". ")
    return f"{head}.", tail.strip().rstrip(":")


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

    conf = await mailer.for_family(db, await db.get(Family, party.family_id))
    if conf is None:
        return 0
    if guests is None:
        guests = (await db.execute(select(PartyGuest).where(PartyGuest.party_id == party.id, PartyGuest.updates == True, PartyGuest.email.is_not(None)))).scalars().all()  # noqa: E712
    language = await _host_language(db, party)
    texts = _MAIL.get(language, _MAIL["en"])
    page = f"{base}/party/{decrypt_token(party.token_encrypted)}"
    colors, header = await _mail_look(db, party, base)
    sent = 0
    for guest in guests:
        if not guest.email or not guest.updates:
            continue
        code = secrets.token_urlsafe(18)
        guest.unsubscribe_hash = _hash(code)
        own = f"{page}?key={decrypt_token(guest.key_encrypted)}" if guest.key_encrypted else page
        subject_t, body_t = texts[kind]
        own_text = (party.mail_texts or {}).get(kind) or {}
        subject_t, body_t = own_text.get("subject") or subject_t, own_text.get("text") or body_t
        answer = texts["answers"][0 if guest.coming else 1]
        if party.date_poll:
            answer = texts["voted"].format(n=len(guest.date_votes or []))
        elif guest.coming and guest.companions:
            answer += " " + texts["plus"].format(name=", ".join(_name(c) for c in guest.companions))
        by = texts["by"].format(date=f"{party.rsvp_by.day}/{party.rsvp_by.month}") if party.rsvp_by else ""
        stop_url = f"{page}?unsubscribe={code}"
        when = _when_where(party, language)
        fields = {"title": party.title, "name": guest.first_name, "answer": answer, "by": by, "when": when, "link": own, **values}
        # The guest's own link always goes along, whatever the hosts have written.
        body = "\n\n".join(x for x in [
            _fill(body_t, fields),
            "" if "{when}" in body_t else when,
            "" if "{link}" in body_t else texts["page"].format(link=own),
            texts["stop"].format(link=stop_url),
        ] if x)
        foot, stop = _small_print(texts["stop"])
        html = party_mail.render(
            colors=colors, title=party.title, emoji=party.emoji, text=_fill(body_t, fields), when="" if "{when}" in body_t else when, button=_OPEN.get(language, _OPEN["en"]), link=own,
            foot=foot, stop=stop, stop_link=stop_url, header=header,
        )
        try:
            await mailer.send_with(conf, guest.email, _fill(subject_t, fields), body, html)
            sent += 1
        except mailer.MailError:
            continue
    await db.commit()
    return sent


# --- The adults' side ----------------------------------------------------------------------


class PartyIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    kind: str = Field(default="party", pattern=KIND_PATTERN)
    person_ids: list[uuid.UUID] = Field(default_factory=list, max_length=10)
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
    bring: str = Field(default="none", pattern=BRING)
    show_guests: str = Field(default="count", pattern=r"^(none|count|names)$")
    wishlist: bool = False
    budget: float | None = Field(default=None, ge=0, le=10_000_000)
    page_theme: str = Field(default="balloons", pattern=THEME_PATTERN)
    page_custom_id: uuid.UUID | None = None
    date_poll: bool = False
    date_options: list[datetime] = Field(default_factory=list, max_length=12)


class PartyChange(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    kind: str | None = Field(default=None, pattern=KIND_PATTERN)
    person_ids: list[uuid.UUID] | None = Field(default=None, max_length=10)
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
    bring: str | None = Field(default=None, pattern=BRING)
    show_guests: str | None = Field(default=None, pattern=r"^(none|count|names)$")
    wishlist: bool | None = None
    budget: float | None = Field(default=None, ge=0, le=10_000_000)
    thanks_text: str | None = Field(default=None, max_length=4000)
    thanks_album_id: uuid.UUID | None = None
    thanks_published: bool | None = None
    page_theme: str | None = Field(default=None, pattern=THEME_PATTERN)
    page_custom_id: uuid.UUID | None = None
    # The poster's blocks; [] or None = the theme's own. layouts: the same for each poster by its stage.
    layout: list[dict] | None = Field(default=None, max_length=60)
    layouts: dict[str, list[dict] | None] | None = None
    phase: str | None = Field(default=None, pattern=r"^(save|invite)$")
    playlist_url: str | None = Field(default=None, max_length=300, pattern=r"^$|^https://open\.spotify\.com/[\w/?=&.-]+$")
    portal_gallery: bool | None = None
    portal_at: datetime | None = None
    portal_until: datetime | None = None
    pages: list[Literal["save", "invite", "checkin", "portal", "thanks"]] | None = Field(default=None, max_length=5)
    tables: list["TableIn"] | None = Field(default=None, max_length=100)
    checkin_at: datetime | None = None
    menu: list["MenuOption"] | None = Field(default=None, max_length=12)
    speech_signup: bool | None = None
    practical: "PracticalIn | None" = None
    mail_texts: dict[str, "MailTextIn"] | None = None
    guest_chat: bool | None = None
    planner_chat: bool | None = None
    thanks_at: datetime | None = None
    rsvp_remind_days: int | None = Field(default=None, ge=0, le=60)
    date_poll: bool | None = None
    date_options: list[datetime] | None = Field(default=None, max_length=12)


class ThemeIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    bg: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    bg2: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    accent: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    ink: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    pattern: str = Field(default="confetti", pattern=rf"^({'|'.join(PATTERNS)})$")
    decor: str = Field(default="", max_length=60)
    font: str = Field(default="playful", pattern=r"^(gala|playful|retro|classic|sporty)$")
    effect: str = Field(default="confetti", pattern=r"^(none|confetti|bokeh|stars|bubbles|snow|leaves|embers)$")


class TableIn(BaseModel):
    id: str = Field(pattern=r"^[A-Za-z0-9-]{1,20}$")
    name: str = Field(min_length=1, max_length=40)
    seats: int = Field(default=8, ge=1, le=500)


class MenuOption(BaseModel):
    id: str = Field(pattern=r"^[A-Za-z0-9-]{1,20}$")
    name: str = Field(min_length=1, max_length=60)


class PracticalIn(BaseModel):
    parking: str = Field(default="", max_length=1000)
    lodging: str = Field(default="", max_length=1000)
    travel: str = Field(default="", max_length=1000)


class MailTextIn(BaseModel):
    subject: str = Field(default="", max_length=160)
    text: str = Field(default="", max_length=4000)


PartyChange.model_rebuild()


class ChatIn(BaseModel):
    body: str = Field(min_length=1, max_length=500)
    name: str = Field(default="", max_length=60)


class MailPreviewIn(BaseModel):
    subject: str = Field(default="", max_length=160)
    text: str = Field(default="", max_length=4000)
    name: str = Field(default="", max_length=80)


class CheckinIn(BaseModel):
    going: bool
    message: str = Field(default="", max_length=500)


class HelperIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    role: str = Field(default="toastmaster", pattern=r"^(toastmaster|toastmadame|helper)$")
    email: str | None = Field(default=None, max_length=254, pattern=r"^$|^[^@\s]+@[^@\s]+\.[^@\s]+$")
    days_after: Literal[1, 3, 7] = 3


class PlanHiddenIn(BaseModel):
    user_ids: list[uuid.UUID] = Field(default_factory=list, max_length=50)


class PlanItemIn(BaseModel):
    kind: str = Field(default="note", pattern=r"^(speech|serving|game|music|note)$")
    at: str = Field(default="", pattern=r"^$|^([01]\d|2[0-3]):[0-5]\d$")
    minutes: int | None = Field(default=None, ge=0, le=600)
    title: str = Field(min_length=1, max_length=160)
    who: str = Field(default="", max_length=120)
    note: str = Field(default="", max_length=2000)


class PlanItemChange(BaseModel):
    kind: str | None = Field(default=None, pattern=r"^(speech|serving|game|music|note)$")
    at: str | None = Field(default=None, pattern=r"^$|^([01]\d|2[0-3]):[0-5]\d$")
    minutes: int | None = Field(default=None, ge=0, le=600)
    title: str | None = Field(default=None, min_length=1, max_length=160)
    who: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=2000)
    done: bool | None = None


VENDOR_KINDS = r"^(catering|decoration|dj|music|venue|photo|cake|rental|other)$"
VENDOR_STATUS = r"^(idea|asked|booked|no)$"


class VendorIn(BaseModel):
    category: str = Field(default="other", pattern=VENDOR_KINDS)
    name: str = Field(min_length=1, max_length=160)
    url: str = Field(default="", max_length=500, pattern=r"^$|^https?://")
    contact: str = Field(default="", max_length=200)
    price: float | None = Field(default=None, ge=0, le=10_000_000)
    status: str = Field(default="idea", pattern=VENDOR_STATUS)
    note: str = Field(default="", max_length=2000)


class VendorChange(BaseModel):
    category: str | None = Field(default=None, pattern=VENDOR_KINDS)
    name: str | None = Field(default=None, min_length=1, max_length=160)
    url: str | None = Field(default=None, max_length=500, pattern=r"^$|^https?://")
    contact: str | None = Field(default=None, max_length=200)
    price: float | None = Field(default=None, ge=0, le=10_000_000)
    status: str | None = Field(default=None, pattern=VENDOR_STATUS)
    note: str | None = Field(default=None, max_length=2000)


class ImportedGuest(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(default="", max_length=80)
    email: str | None = Field(default=None, max_length=254, pattern=r"^$|^[^@\s]+@[^@\s]+\.[^@\s]+$")
    allergies: str = Field(default="", max_length=300)


class GuestImportIn(BaseModel):
    guests: list[ImportedGuest] = Field(min_length=1, max_length=500)


class GroupIn(BaseModel):
    with_id: uuid.UUID | None = None


class SeatIn(BaseModel):
    table_id: str | None = Field(default=None, max_length=20)


class LookIn(BaseModel):
    bg: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    bg2: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    accent: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    ink: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    pattern: str = Field(default="none", pattern=rf"^({'|'.join(PATTERNS)})$")
    decor: str = Field(default="", max_length=60)
    font: str = Field(default="gala", pattern=r"^(gala|playful|retro|classic|sporty)$")
    effect: str = Field(default="none", pattern=r"^(none|confetti|bokeh|stars|bubbles|snow|leaves|embers)$")


class TemplateIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    theme: str | None = Field(default=None, pattern=THEME_PATTERN)
    look: LookIn | None = None
    layouts: dict[str, list[dict] | None]


class DecideIn(BaseModel):
    option: datetime


class AnnounceIn(BaseModel):
    subject: str = Field(min_length=1, max_length=120)
    text: str = Field(min_length=1, max_length=4000)


class TaskIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    due_date: date | None = None
    who: uuid.UUID | None = None
    helper_id: uuid.UUID | None = None


class TaskChange(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    due_date: date | None = None
    done: bool | None = None
    who: uuid.UUID | None = None
    helper_id: uuid.UUID | None = None


class ExpenseIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    amount: float = Field(gt=0, le=10_000_000)
    paid_by: uuid.UUID | None = None


class StepIn(BaseModel):
    at: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    title: str = Field(min_length=1, max_length=200)
    hidden: bool = False


class StepChange(BaseModel):
    at: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    title: str | None = Field(default=None, min_length=1, max_length=200)
    hidden: bool | None = None


class MailingIn(BaseModel):
    kind: str = Field(pattern=r"^(save|invite|checkin|remind|thanks|custom)$")
    audience: str = Field(default="all", pattern=r"^(all|waiting|coming)$")
    subject: str = Field(default="", max_length=120)
    text: str = Field(default="", max_length=4000)
    send_at: datetime


class GuestIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(default="", max_length=80)
    coming: bool = True
    allergies: str = Field(default="", max_length=300)
    message: str = Field(default="", max_length=500)
    companions: list["CompanionIn"] = Field(default_factory=list, max_length=20)
    email: str | None = Field(default=None, max_length=254, pattern=r"^$|^[^@\s]+@[^@\s]+\.[^@\s]+$")
    updates: bool = False
    date_votes: list[str] | None = Field(default=None, max_length=12)
    # Put on the guest list by the hosts (not a reply yet): they get the mails and their own link.
    invited: bool = False
    wants_speech: bool = False
    speech_note: str = Field(default="", max_length=200)
    menu_choice: str | None = Field(default=None, max_length=20)
    # Answering for those they're together with who haven't answered themselves.
    for_group: bool = False


class CompanionIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(default="", max_length=80)
    child: bool = False
    allergies: str = Field(default="", max_length=300)
    menu_choice: str | None = Field(default=None, max_length=20)


GuestIn.model_rebuild()


def _dt(moment: datetime) -> datetime:
    return moment if moment.tzinfo else moment.replace(tzinfo=_tz())


async def _mine(db: AsyncSession, user: User | HelperActor, party_id: uuid.UUID) -> Party:
    party = await db.get(Party, party_id)
    if party is None or party.family_id != user.family_id or (isinstance(user, HelperActor) and user.party_id != party.id):
        raise HTTPException(status_code=404, detail="Party not found")
    return party


async def _sync_event(db: AsyncSession, party: Party, user: User) -> None:
    """The party in the family's calendar (for the one it's for, a birthday's) – once its date is set."""
    if party.date_poll:
        if party.event_id and (old := await db.get(FamilyEvent, party.event_id)) is not None:
            await db.delete(old)
        party.event_id = None
        return
    members = []
    for pid in party.person_ids or ([str(party.person_id)] if party.person_id else []):
        person = await db.get(Person, uuid.UUID(str(pid)))
        if person and person.user_id and str(person.user_id) not in members:
            members.append(str(person.user_id))
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
    event.member_ids = members


async def _check_refs(db: AsyncSession, user: User, data: dict) -> None:
    """The people and the own themes a party points to are the family's."""
    for pid in [*(data.get("person_ids") or []), *([data["person_id"]] if data.get("person_id") else [])]:
        person = await db.get(Person, pid)
        if person is None or person.family_id != user.family_id:
            raise HTTPException(status_code=404, detail="Person not found")
    if data.get("page_custom_id"):
        theme = await db.get(PartyTheme, data["page_custom_id"])
        if theme is None or theme.family_id != user.family_id:
            raise HTTPException(status_code=404, detail="Theme not found")


LAYOUT_BYTES = 60_000
BLOCK_TYPES = {"text", "image", "emblem", "decor", "details", "countdown", "calendar", "invitation", "ribbon", "divider", "spacer", "subscribe", "playlist", "schedule", "upload", "gallery", "practical", "checkin", "chat"}
STAGES = {"save": "save_layout", "invite": "layout", "checkin": "checkin_layout", "portal": "portal_layout", "thanks": "thanks_layout"}


def _layouts(party: Party) -> dict:
    return {stage: getattr(party, col) for stage, col in STAGES.items()}


def _clean_layout(blocks: list[dict] | None) -> list[dict] | None:
    """The poster's blocks as the editor sent them: plain data (texts, choices), not too big.
    The guests' page only ever shows it as text – nothing in it runs."""
    import json

    if not blocks:
        return None
    if len(json.dumps(blocks)) > LAYOUT_BYTES:
        raise HTTPException(status_code=422, detail="The poster is too big")
    for b in blocks:
        if b.get("type") not in BLOCK_TYPES or not isinstance(b.get("id"), str):
            raise HTTPException(status_code=422, detail="A block needs a known type and an id")
    return blocks


def _assets_out(party: Party) -> list[dict]:
    return [{"id": a["id"], "v": _version(a["key"])} for a in party.assets or []]


def _version(key: str | None) -> str | None:
    """A stored picture's own code (it changes with the picture): for the browser's cache."""
    return key.rsplit("-", 1)[-1].split(".")[0] if key else None


def _save_picture(family_id: uuid.UUID, prefix: str, data: bytes, old: str | None, behind: str = "#ffffff") -> str:
    """A picture made web-sized (at most 1600 px, JPEG) and stored; the old one goes. What's
    see-through (a PNG's logo) is laid on the theme's colour, not left black."""
    import io

    from PIL import Image, ImageOps

    try:
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
        if img.mode in ("RGBA", "LA", "P", "PA"):
            img = img.convert("RGBA")
            flat = Image.new("RGBA", img.size, behind)
            flat.alpha_composite(img)
            img = flat
        img = img.convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=422, detail="That isn't a picture") from exc
    img.thumbnail((1600, 1600), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=84)
    buf.seek(0)
    storage = get_storage()
    key = f"parties/{prefix}-{secrets.token_hex(6)}.jpg"
    storage.save(family_id, key, buf)
    if old and storage.exists(family_id, old):
        storage.delete(family_id, old)
    return key


async def _read_picture(file: UploadFile) -> bytes:
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=422, detail="That isn't a picture")
    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="The picture is too big")
    return data


def _picture(family_id: uuid.UUID, key: str | None) -> Response:
    storage = get_storage()
    if not key or not storage.exists(family_id, key):
        raise HTTPException(status_code=404, detail="Not found")
    return Response(content=storage.open(family_id, key).read_bytes(), media_type="image/jpeg", headers={**NO_STORE, "Cache-Control": "private, max-age=86400"})


def _theme_out(t: PartyTheme) -> dict:
    return {
        "id": t.id, "name": t.name, "bg": t.bg, "bg2": t.bg2, "accent": t.accent, "ink": t.ink, "pattern": t.pattern, "decor": t.decor, "font": t.font, "effect": t.effect,
        "header": _version(t.header_key), "background": _version(t.background_key),
    }


async def _link(db: AsyncSession, party: Party, request: Request | None) -> str:
    return f"{await public_base(db, request)}/party/{decrypt_token(party.token_encrypted)}"


def _guest_out(g: PartyGuest) -> dict:
    return {
        "id": g.id, "first_name": g.first_name, "last_name": g.last_name, "coming": g.coming, "allergies": g.allergies, "message": g.message,
        "companions": g.companions or [], "updated_at": g.updated_at, "table_id": g.table_id, "group_id": g.group_id,
        "wants_speech": g.wants_speech, "speech_note": g.speech_note, "menu_choice": g.menu_choice, "checkin": g.checkin,
        "email": g.email, "updates": bool(g.updates), "date_votes": g.date_votes or [], "pending": bool(g.pending),
    }


def _name(person: dict) -> str:
    return f"{person.get('first_name', '')} {person.get('last_name', '')}".strip()


def _size(party: Party, g: PartyGuest) -> int:
    return 1 + len(g.companions or [])


def _people(party: Party, guests: list[PartyGuest]) -> int:
    return sum(_size(party, g) for g in guests if g.coming)


def _same_person(companion: dict, guest: PartyGuest) -> bool:
    """A +1 who's also on the list by themselves: the first names agree, and the last if both have one."""
    first, last = (companion.get("first_name") or "").strip().lower(), (companion.get("last_name") or "").strip().lower()
    theirs = (guest.last_name or "").strip().lower()
    return bool(first) and first == (guest.first_name or "").strip().lower() and (not last or not theirs or last == theirs)


def _capacity(party: Party, guests: list[PartyGuest]) -> dict:
    """How many it can come to: those who've said yes, and at most if everyone not yet answered does –
    a guest who may bring a +1 and has none counts for two, unless they're together with someone."""
    possible = [g for g in guests if g.coming or g.pending]
    most = sum(2 if party.bring == "one" and not g.group_id and not g.companions else _size(party, g) for g in possible)
    return {"coming": _people(party, guests), "waiting": sum(1 for g in guests if g.pending), "most": most, "open": party.bring == "family"}


async def _group(db: AsyncSession, party: Party, group_id: str | None) -> list[PartyGuest]:
    if not group_id:
        return []
    return (await db.execute(select(PartyGuest).where(PartyGuest.party_id == party.id, PartyGuest.group_id == group_id))).scalars().all()


def _no_doubles(members: list[PartyGuest]) -> None:
    """Whoever's on the list by themselves isn't also someone's +1: they'd be counted twice."""
    for g in members:
        if g.companions:
            g.companions = [c for c in g.companions if not any(_same_person(c, o) for o in members if o.id != g.id)] or None


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


def _mail_templates(party: Party, language: str) -> list[dict]:
    texts = _MAIL.get(language, _MAIL["en"])
    own = party.mail_texts or {}
    return [{"kind": k, "default_subject": texts[k][0], "default_text": texts[k][1], "subject": (own.get(k) or {}).get("subject", ""), "text": (own.get(k) or {}).get("text", "")} for k in MAIL_KINDS]


def _plan_kept_from(party: Party, actor: object) -> bool:
    """Whether the helpers keep the plan from this person."""
    return isinstance(actor, User) and str(actor.id) in (party.plan_hidden or [])


def _menu_tally(party: Party, guests: list[PartyGuest]) -> list[dict]:
    counts: dict[str | None, int] = {}
    for g in guests:
        if not g.coming:
            continue
        counts[g.menu_choice] = counts.get(g.menu_choice, 0) + 1
        for c in g.companions or []:
            counts[c.get("menu_choice")] = counts.get(c.get("menu_choice"), 0) + 1
    known = {m["id"] for m in party.menu or []}
    return [{"id": m["id"], "name": m["name"], "people": counts.get(m["id"], 0)} for m in party.menu or []] + [{"id": None, "name": "", "people": sum(n for k, n in counts.items() if k not in known)}]


async def _detail(db: AsyncSession, party: Party, request: Request | None) -> dict:
    actor = getattr(request.state, "party_actor", None) if request is not None else None
    kept = _plan_kept_from(party, actor)
    plan = [] if kept else (await db.execute(select(PartyPlanItem).where(PartyPlanItem.party_id == party.id).order_by(PartyPlanItem.at, PartyPlanItem.created_at))).scalars().all()
    party_helpers = (await db.execute(select(PartyHelper).where(PartyHelper.party_id == party.id).order_by(PartyHelper.created_at))).scalars().all()
    vendors = (await db.execute(select(PartyVendor).where(PartyVendor.party_id == party.id).order_by(PartyVendor.created_at))).scalars().all()
    family = await db.get(Family, party.family_id)
    adults = (await db.execute(select(User).where(User.family_id == party.family_id, User.role.in_(["admin", "adult"])).order_by(User.created_at))).scalars().all()
    tagged = (await db.execute(select(Person).where(Person.family_id == party.family_id).order_by(Person.name))).scalars().all() if isinstance(actor, HelperActor) else []
    guests = (await db.execute(select(PartyGuest).where(PartyGuest.party_id == party.id).order_by(PartyGuest.created_at))).scalars().all()
    tasks = (await db.execute(select(PartyTask).where(PartyTask.party_id == party.id).order_by(PartyTask.due_date.nulls_last(), PartyTask.position))).scalars().all()
    expenses = (await db.execute(select(PartyExpense).where(PartyExpense.party_id == party.id).order_by(PartyExpense.created_at))).scalars().all()
    steps = (await db.execute(select(PartyStep).where(PartyStep.party_id == party.id).order_by(PartyStep.at))).scalars().all()
    link = await _link(db, party, request)
    allergies = []
    for g in guests:
        if g.coming and g.allergies.strip():
            allergies.append({"name": f"{g.first_name} {g.last_name}".strip(), "allergies": g.allergies})
        for c in g.companions or [] if g.coming else []:
            if (c.get("allergies") or "").strip():
                allergies.append({"name": _name(c), "allergies": c["allergies"]})
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
        "rsvp_by": party.rsvp_by, "bring": party.bring, "show_guests": party.show_guests, "wishlist": party.wishlist,
        "person_ids": [str(x) for x in party.person_ids or ([party.person_id] if party.person_id else [])],
        "page_custom_id": party.page_custom_id, "invite_image": _version(party.invite_image_key),
        "layout": party.layout, "layouts": _layouts(party), "assets": _assets_out(party), "phase": party.phase, "playlist_url": party.playlist_url,
        "portal": await _portal_out(db, party, request), "stage": _stage(party), "thanks_at": party.thanks_at,
        "rsvp_remind_days": party.rsvp_remind_days, "rsvp_reminded_on": party.rsvp_reminded_on, "address_set": bool(await configured_url(db)),
        "budget": float(party.budget) if party.budget is not None else None, "spent": spent,
        "thanks_text": party.thanks_text, "thanks_album_id": party.thanks_album_id, "thanks_published": party.thanks_published,
        "page_theme": party.page_theme,
        "date_poll": party.date_poll, "date_options": party.date_options or [], "tally": _tally(party, guests),
        "mail": await _mail_ready(db, party), "subscribers": sum(1 for g in guests if g.updates and g.email),
        "link": link, "qr_svg": qr_svg(link),
        "guests": [{**_guest_out(g), **({"wants_speech": False, "speech_note": ""} if kept else {})} for g in guests],
        "capacity": _capacity(party, guests),
        "coming": _people(party, guests), "children": sum(1 for g in guests if g.coming for c in g.companions or [] if c.get("child")), "not_coming": sum(1 for g in guests if not g.coming and not g.pending), "signed_up": sum(1 for g in guests if g.pending), "allergies": allergies,
        "tasks": [{"id": t.id, "title": t.title, "due_date": t.due_date, "done": t.done, "who": t.who, "helper_id": t.helper_id, "action": t.action} for t in tasks],
        "pages": _pages(party), "tables": party.tables or [], "family_name": family.name if family else "",
        "checkin_at": party.checkin_at, "menu": party.menu or [], "menu_tally": _menu_tally(party, guests), "speech_signup": party.speech_signup, "practical": party.practical or {},
        "adults": [{"id": a.id, "name": a.display_name} for a in adults],
        "you": {"helper": isinstance(actor, HelperActor), "helper_id": actor.helper_id if isinstance(actor, HelperActor) else None},
        "people": [{"id": x.id, "name": x.name} for x in tagged],
        "helpers": [{"id": h.id, "name": h.name, "role": h.role, "email": h.email, "days_after": h.days_after, "ends_at": _helper_ends(h, party), "last_seen": h.last_seen} for h in party_helpers],
        "guest_chat": party.guest_chat, "planner_chat": party.planner_chat and not kept,
        "plan_kept": kept, "plan_hidden": [] if kept else party.plan_hidden or [],
        "plan": [{"id": i.id, "kind": i.kind, "at": i.at, "minutes": i.minutes, "title": i.title, "who": i.who, "note": i.note, "done": i.done} for i in plan],
        "speeches": [] if kept else [{"id": g.id, "name": f"{g.first_name} {g.last_name}".strip(), "note": g.speech_note} for g in guests if g.coming and g.wants_speech],
        "vendors": [{"id": v.id, "category": v.category, "name": v.name, "url": v.url, "contact": v.contact, "price": float(v.price) if v.price is not None else None, "status": v.status, "note": v.note, "in_budget": v.expense_id is not None} for v in vendors],
        "mail_templates": _mail_templates(party, await _host_language(db, party)),
        "share_texts": {k.removeprefix("share_"): ((party.mail_texts or {}).get(k) or {}).get("text", "") for k in SHARE_KINDS},
        "expenses": [{"id": e.id, "title": e.title, "amount": float(e.amount), "paid_by": e.paid_by} for e in expenses],
        "steps": [{"id": s.id, "at": s.at, "title": s.title, "hidden": s.hidden} for s in steps],
        "mailings": [_mailing_out(m) for m in (await db.execute(select(PartyMailing).where(PartyMailing.party_id == party.id).order_by(PartyMailing.send_at))).scalars()],
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
    await _check_refs(db, user, data)
    data["person_ids"] = [str(x) for x in payload.person_ids] or ([str(payload.person_id)] if payload.person_id else None)
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


@router.get("/themes")
async def list_themes(user: PartyActor, db: DB) -> list[dict]:
    """The family's own themes, to use again."""
    rows = (await db.execute(select(PartyTheme).where(PartyTheme.family_id == user.family_id).order_by(PartyTheme.created_at))).scalars().all()
    return [_theme_out(t) for t in rows]


async def _my_theme(db: AsyncSession, user: User, theme_id: uuid.UUID) -> PartyTheme:
    theme = await db.get(PartyTheme, theme_id)
    if theme is None or theme.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Theme not found")
    return theme


@router.post("/themes", status_code=status.HTTP_201_CREATED)
async def create_theme(payload: ThemeIn, user: PartyActor, db: DB) -> dict:
    count = (await db.execute(select(func.count()).select_from(PartyTheme).where(PartyTheme.family_id == user.family_id))).scalar_one()
    if count >= 40:
        raise HTTPException(status_code=409, detail="Too many themes")
    theme = PartyTheme(family_id=user.family_id, created_by=user.id, created_at=datetime.now(timezone.utc), **{**payload.model_dump(), "name": payload.name.strip()})
    db.add(theme)
    await db.commit()
    return _theme_out(theme)


def _template_out(row: PartyTemplate) -> dict:
    return {"id": row.id, "name": row.name, "theme": row.theme, "look": row.look, "layouts": row.layouts}


@router.get("/templates")
async def list_templates(user: PartyActor, db: DB) -> list[dict]:
    """The family's own templates, to use again."""
    rows = (await db.execute(select(PartyTemplate).where(PartyTemplate.family_id == user.family_id).order_by(PartyTemplate.created_at))).scalars().all()
    return [_template_out(t) for t in rows]


@router.post("/templates", status_code=status.HTTP_201_CREATED)
async def create_template(payload: TemplateIn, user: PartyActor, db: DB) -> dict:
    count = (await db.execute(select(func.count()).select_from(PartyTemplate).where(PartyTemplate.family_id == user.family_id))).scalar_one()
    if count >= 40:
        raise HTTPException(status_code=409, detail="Too many templates")
    if set(payload.layouts) - set(STAGES):
        raise HTTPException(status_code=422, detail="A template holds the party's four posters")
    # A template in an own theme carries its look: the theme itself may go, the template stays.
    theme = None if payload.look or payload.theme == "custom" else payload.theme
    row = PartyTemplate(
        family_id=user.family_id, created_by=user.id, created_at=datetime.now(timezone.utc), name=payload.name.strip(), theme=theme,
        look=payload.look.model_dump() if payload.look else None, layouts={stage: _clean_layout(blocks) for stage, blocks in payload.layouts.items()},
    )
    db.add(row)
    await db.commit()
    return _template_out(row)


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(template_id: uuid.UUID, user: PartyActor, db: DB) -> None:
    row = await db.get(PartyTemplate, template_id)
    if row is None or row.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(row)
    await db.commit()


@router.put("/themes/{theme_id}")
async def change_theme(theme_id: uuid.UUID, payload: ThemeIn, user: PartyActor, db: DB) -> dict:
    theme = await _my_theme(db, user, theme_id)
    for key, value in payload.model_dump().items():
        setattr(theme, key, value.strip() if key == "name" else value)
    await db.commit()
    return _theme_out(theme)


@router.delete("/themes/{theme_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_theme(theme_id: uuid.UUID, user: PartyActor, db: DB) -> None:
    theme = await _my_theme(db, user, theme_id)
    for party in (await db.execute(select(Party).where(Party.family_id == user.family_id))).scalars():
        if party.page_custom_id == theme.id:
            party.page_custom_id, party.page_theme = None, "balloons"
    storage = get_storage()
    for key in (theme.header_key, theme.background_key):
        if key and storage.exists(theme.family_id, key):
            storage.delete(theme.family_id, key)
    await db.delete(theme)
    await db.commit()


@router.post("/themes/{theme_id}/pictures/{slot}")
async def set_theme_picture(theme_id: uuid.UUID, slot: str, file: UploadFile, user: PartyActor, db: DB) -> dict:
    theme = await _my_theme(db, user, theme_id)
    if slot not in ("header", "background"):
        raise HTTPException(status_code=404, detail="Not found")
    field = f"{slot}_key"
    behind = theme.bg if slot == "background" else theme.bg2
    setattr(theme, field, _save_picture(theme.family_id, f"themes/{theme.id}-{slot}", await _read_picture(file), getattr(theme, field), behind))
    await db.commit()
    return _theme_out(theme)


@router.delete("/themes/{theme_id}/pictures/{slot}")
async def remove_theme_picture(theme_id: uuid.UUID, slot: str, user: PartyActor, db: DB) -> dict:
    theme = await _my_theme(db, user, theme_id)
    if slot not in ("header", "background"):
        raise HTTPException(status_code=404, detail="Not found")
    field = f"{slot}_key"
    key = getattr(theme, field)
    if key and get_storage().exists(theme.family_id, key):
        get_storage().delete(theme.family_id, key)
    setattr(theme, field, None)
    await db.commit()
    return _theme_out(theme)


@router.get("/themes/{theme_id}/pictures/{slot}")
async def theme_picture(theme_id: uuid.UUID, slot: str, user: PartyActor, db: DB) -> Response:
    theme = await _my_theme(db, user, theme_id)
    return _picture(theme.family_id, getattr(theme, f"{slot}_key", None) if slot in ("header", "background") else None)


@router.get("/{party_id}")
async def get_party(party_id: uuid.UUID, request: Request, user: PartyActor, db: DB) -> dict:
    return await _detail(db, await _mine(db, user, party_id), request)


@router.put("/{party_id}")
async def change_party(party_id: uuid.UUID, payload: PartyChange, request: Request, user: PartyActor, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("mail_texts") is not None:
        if set(changes["mail_texts"]) - set(MAIL_KINDS) - set(SHARE_KINDS):
            raise HTTPException(status_code=422, detail="No such mail")
        # Empty is the app's own wording again.
        changes["mail_texts"] = {k: {"subject": v.get("subject", "").strip(), "text": v.get("text", "").strip()} for k, v in {**(party.mail_texts or {}), **changes["mail_texts"]}.items() if v.get("subject", "").strip() or v.get("text", "").strip()} or None
    if changes.get("practical") is not None:
        changes["practical"] = {k: v.strip() for k, v in changes["practical"].items() if v.strip()} or None
    if "menu" in changes:
        changes["menu"] = changes["menu"] or None
    for key in ("starts_at", "ends_at", "portal_at", "portal_until", "thanks_at", "checkin_at"):
        if changes.get(key) is not None:
            changes[key] = _dt(changes[key])
    if "layout" in changes:
        changes["layout"] = _clean_layout(changes["layout"])
    for stage, blocks in (changes.pop("layouts", None) or {}).items():
        if stage not in STAGES:
            raise HTTPException(status_code=422, detail="No such poster")
        changes[STAGES[stage]] = _clean_layout(blocks)
    if "playlist_url" in changes:
        changes["playlist_url"] = changes["playlist_url"] or None
    was_save = party.phase == "save"
    if changes.get("pages") is not None:
        changes["pages"] = [p for p in STAGES if p in changes["pages"] or p == "invite"]
        # A page taken away isn't a switch to the invitation: nobody is mailed for it.
        if "save" not in changes["pages"]:
            was_save = False
    if changes.get("date_options") is not None:
        changes["date_options"] = _options(changes["date_options"])
    if changes.get("date_poll") and len(changes.get("date_options") or party.date_options or []) < 2:
        raise HTTPException(status_code=422, detail="A vote needs at least two dates")
    await _check_refs(db, user, changes)
    if "person_ids" in changes and changes["person_ids"] is not None:
        changes["person_ids"] = [str(x) for x in changes["person_ids"]] or None
    if changes.get("thanks_album_id"):
        album = await db.get(Album, changes["thanks_album_id"])
        if album is None or album.family_id != user.family_id:
            raise HTTPException(status_code=404, detail="Album not found")
    before = (_utc(party.starts_at), _utc(party.ends_at), party.place, party.address, party.thanks_published)
    for key, value in changes.items():
        if key in ("title", "starts_at", "ends_at", "kind", "page_theme", "date_poll", "date_options", "bring", "phase", "portal_gallery", "pages", "speech_signup", "guest_chat", "planner_chat") and value is None:
            continue
        setattr(party, key, value)
    if _utc(party.ends_at) <= _utc(party.starts_at):
        raise HTTPException(status_code=422, detail="The party ends after it starts")
    if changes.get("pages") is not None:
        await _keep_to_pages(db, party, user)
    if "tables" in changes:
        await _seat_at_known_tables(db, party)
    # A time for the portal needs the portal: its link and its album are made now. Its link ends a
    # little after the party unless the hosts say otherwise.
    if party.portal_at is not None:
        await _ensure_portal(db, party, user)
        if party.portal_until is None and "portal_until" not in changes:
            party.portal_until = _utc(party.ends_at) + PORTAL_AFTER
    if party.portal_until is not None and party.portal_at is not None and _utc(party.portal_until) <= _utc(party.portal_at):
        raise HTTPException(status_code=422, detail="The portal's link ends after it opens")
    if "rsvp_remind_days" in changes or "rsvp_by" in changes:
        party.rsvp_reminded_on = None
    if "guest_chat" in changes or "planner_chat" in changes or "title" in changes:
        await _sync_chats(db, party)
    await _sync_event(db, party, user)
    await db.commit()
    base = await public_base(db, request)
    if not party.date_poll and (_utc(party.starts_at), _utc(party.ends_at), party.place, party.address) != before[:4]:
        await mail_guests(db, party, "change", base=base)
    if was_save and party.phase == "invite":
        await mail_guests(db, party, "invited", base=base)
    if party.thanks_published and not before[4]:
        await mail_guests(db, party, "thanks", guests=await _came(db, party), base=base, text=party.thanks_text or "")
    return await _detail(db, party, request)


@router.post("/{party_id}/decide")
async def decide(party_id: uuid.UUID, payload: DecideIn, request: Request, user: PartyActor, db: DB) -> dict:
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
async def announce(party_id: uuid.UUID, payload: AnnounceIn, request: Request, user: PartyActor, db: DB) -> dict:
    """A message to every guest who asked for updates by e-mail."""
    party = await _mine(db, user, party_id)
    if not await _mail_ready(db, party):
        raise HTTPException(status_code=409, detail="E-mail isn't set up on this server")
    sent = await mail_guests(db, party, "message", base=await public_base(db, request), subject=payload.subject.strip(), text=payload.text.strip())
    return {"sent": sent}


@router.delete("/{party_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_party(party_id: uuid.UUID, user: AdultUser, db: DB) -> None:
    party = await _mine(db, user, party_id)
    event_id = party.event_id
    storage = get_storage()
    for key in [party.invite_image_key, *(a["key"] for a in party.assets or [])]:
        if key and storage.exists(party.family_id, key):
            storage.delete(party.family_id, key)
    party.guest_chat = party.planner_chat = False
    await _sync_chats(db, party)
    for model in (PartyGuest, PartyTask, PartyExpense, PartyStep, PartyMailing, PartyHelper, PartyPlanItem, PartyVendor):
        await db.execute(delete(model).where(model.party_id == party.id))
    await db.delete(party)
    if event_id and (event := await db.get(FamilyEvent, event_id)) is not None:
        await db.delete(event)
    await db.commit()


@router.post("/{party_id}/picture")
async def set_invite_picture(party_id: uuid.UUID, file: UploadFile, request: Request, user: PartyActor, db: DB) -> dict:
    """A picture on the invitation – the birthday child, the place, anything."""
    party = await _mine(db, user, party_id)
    party.invite_image_key = _save_picture(party.family_id, f"{party.id}-invite", await _read_picture(file), party.invite_image_key)
    await db.commit()
    return await _detail(db, party, request)


@router.delete("/{party_id}/picture")
async def remove_invite_picture(party_id: uuid.UUID, request: Request, user: PartyActor, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    if party.invite_image_key and get_storage().exists(party.family_id, party.invite_image_key):
        get_storage().delete(party.family_id, party.invite_image_key)
    party.invite_image_key = None
    await db.commit()
    return await _detail(db, party, request)


MAX_ASSETS = 30


@router.post("/{party_id}/assets")
async def add_asset(party_id: uuid.UUID, file: UploadFile, request: Request, user: PartyActor, db: DB) -> dict:
    """A picture of the hosts' own for the poster – a sticker in place of an emoji, a photo, a frame."""
    party = await _mine(db, user, party_id)
    assets = list(party.assets or [])
    if len(assets) >= MAX_ASSETS:
        raise HTTPException(status_code=409, detail="Too many pictures")
    asset_id = secrets.token_hex(6)
    key = _save_picture(party.family_id, f"{party.id}-asset-{asset_id}", await _read_picture(file), None)
    assets.append({"id": asset_id, "key": key})
    party.assets = assets
    await db.commit()
    return await _detail(db, party, request)


@router.delete("/{party_id}/assets/{asset_id}")
async def remove_asset(party_id: uuid.UUID, asset_id: str, request: Request, user: PartyActor, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    keep = []
    for a in party.assets or []:
        if a["id"] == asset_id:
            if get_storage().exists(party.family_id, a["key"]):
                get_storage().delete(party.family_id, a["key"])
        else:
            keep.append(a)
    party.assets = keep or None
    await db.commit()
    return await _detail(db, party, request)


@router.get("/{party_id}/assets/{asset_id}")
async def asset_picture(party_id: uuid.UUID, asset_id: str, user: PartyActor, db: DB) -> Response:
    party = await _mine(db, user, party_id)
    return _picture(party.family_id, next((a["key"] for a in party.assets or [] if a["id"] == asset_id), None))


@router.get("/{party_id}/picture")
async def invite_picture(party_id: uuid.UUID, user: PartyActor, db: DB) -> Response:
    party = await _mine(db, user, party_id)
    return _picture(party.family_id, party.invite_image_key)


PORTAL_AFTER = timedelta(hours=3)


def _pages(party: Party) -> list[str]:
    """The pages the party has: the invitation always, and those chosen (all, until someone chooses)."""
    return list(party.pages) if party.pages else [p for p in STAGES if p != "checkin"]


def _past_portal(party: Party, now: datetime) -> bool:
    return party.portal_until is not None and now >= _utc(party.portal_until)


def _portal_live(party: Party, now: datetime | None = None) -> bool:
    """Opened by the hosts or its time has come, and its link hasn't ended."""
    now = now or datetime.now(timezone.utc)
    if "portal" not in _pages(party) or _past_portal(party, now):
        return False
    return party.portal_open or (party.portal_at is not None and now >= _utc(party.portal_at))


async def _keep_to_pages(db: AsyncSession, party: Party, user: User) -> None:
    """What belongs to a page taken away goes with it; the QR code's task comes with the portal."""
    pages = _pages(party)
    if "save" not in pages and party.phase == "save":
        party.phase = "invite"
    gone = [kind for kind, page in (("save", "save"), ("thanks", "thanks"), ("checkin", "checkin")) if page not in pages]
    if "checkin" not in pages:
        party.checkin_at = None
    elif party.checkin_at is None:
        party.checkin_at = _utc(party.starts_at) - timedelta(days=3)
    if gone:
        await db.execute(delete(PartyMailing).where(PartyMailing.party_id == party.id, PartyMailing.sent_at.is_(None), PartyMailing.kind.in_(gone)))
    if "thanks" not in pages:
        party.thanks_at = None
    task = (await db.execute(select(PartyTask).where(PartyTask.party_id == party.id, PartyTask.action == "print_qr"))).scalars().first()
    if "portal" in pages:
        if task is None:
            count = (await db.execute(select(func.count()).select_from(PartyTask).where(PartyTask.party_id == party.id))).scalar_one()
            db.add(_qr_task(party, user.language or "en", datetime.now(_tz()).date(), count))
    else:
        party.portal_open, party.portal_at, party.portal_until = False, None, None
        if task is not None and not task.done:
            await db.delete(task)


async def _seat_at_known_tables(db: AsyncSession, party: Party) -> None:
    """A table taken away: those at it are without a place again."""
    known = [t["id"] for t in party.tables or []]
    if len(set(known)) != len(known):
        raise HTTPException(status_code=422, detail="Two tables with the same id")
    await db.execute(update(PartyGuest).where(PartyGuest.party_id == party.id, PartyGuest.table_id.is_not(None), PartyGuest.table_id.not_in(known)).values(table_id=None))


def _stage(party: Party, now: datetime | None = None) -> str:
    """What the guests' one link shows now: the save-the-date, the invitation, the party day's
    portal from its set time, and the thank-you once it's out."""
    now = now or datetime.now(timezone.utc)
    pages = _pages(party)
    if party.thanks_published and "thanks" in pages:
        return "thanks"
    if "portal" in pages and party.portal_at is not None and party.portal_token_encrypted and now >= _utc(party.portal_at) and not _past_portal(party, now):
        return "portal"
    if "checkin" in pages and party.checkin_at is not None and _utc(party.checkin_at) <= now < _utc(party.ends_at) and party.phase == "invite":
        return "checkin"
    return party.phase


async def _ensure_portal(db: AsyncSession, party: Party, user: User) -> None:
    if not party.portal_token_encrypted:
        token = secrets.token_urlsafe(18)
        party.portal_token_hash, party.portal_token_encrypted = _hash(token), encrypt_token(token)
    if party.portal_album_id is None or await db.get(Album, party.portal_album_id) is None:
        album = Album(family_id=party.family_id, name=f"{party.title} – {_ALBUM_NAME.get(user.language or 'en', _ALBUM_NAME['en'])}", created_by=user.id, created_at=datetime.now(timezone.utc))
        db.add(album)
        await db.flush()
        party.portal_album_id = album.id


async def _portal_out(db: AsyncSession, party: Party, request: Request | None) -> dict | None:
    if not party.portal_token_encrypted:
        return None
    link = f"{await public_base(db, request)}/fest/{decrypt_token(party.portal_token_encrypted)}"
    photos = 0
    if party.portal_album_id:
        photos = (await db.execute(select(func.count()).select_from(MediaItem).where(MediaItem.album_id == party.portal_album_id))).scalar_one()
    return {"open": _portal_live(party), "at": party.portal_at, "until": party.portal_until, "link": link, "qr_svg": qr_svg(link), "album_id": party.portal_album_id, "photos": photos, "gallery": party.portal_gallery}


@router.post("/{party_id}/portal")
async def open_portal(party_id: uuid.UUID, request: Request, user: PartyActor, db: DB) -> dict:
    """Turn on the party day's portal: its link and QR code, and the album the guests' photos go to."""
    party = await _mine(db, user, party_id)
    if "portal" not in _pages(party):
        raise HTTPException(status_code=409, detail="This party has no portal")
    await _ensure_portal(db, party, user)
    party.portal_open = True
    # Opened by hand it still ends: a little after the party, or a while from now if that's passed.
    now = datetime.now(timezone.utc)
    if party.portal_until is None or _past_portal(party, now):
        party.portal_until = max(_utc(party.ends_at), now) + PORTAL_AFTER
    await db.commit()
    return await _detail(db, party, request)


@router.post("/{party_id}/portal/prepare")
async def prepare_portal(party_id: uuid.UUID, request: Request, user: PartyActor, db: DB) -> dict:
    """The portal's link and QR code made ready to print, without opening it."""
    party = await _mine(db, user, party_id)
    await _ensure_portal(db, party, user)
    await db.commit()
    return await _detail(db, party, request)


@router.delete("/{party_id}/portal")
async def close_portal(party_id: uuid.UUID, request: Request, user: PartyActor, db: DB) -> dict:
    """Close the portal; the photos stay in the album."""
    party = await _mine(db, user, party_id)
    party.portal_open = False
    party.portal_at = None
    party.portal_until = None
    await db.commit()
    return await _detail(db, party, request)


_ALBUM_NAME = {"en": "the guests' photos", "sv": "gästernas bilder", "nb": "gjestenes bilder", "da": "gæsternes billeder", "fi": "vieraiden kuvat"}


@router.post("/{party_id}/link")
async def new_link(party_id: uuid.UUID, request: Request, user: PartyActor, db: DB) -> dict:
    """A new invitation link; the old one stops working."""
    party = await _mine(db, user, party_id)
    token = secrets.token_urlsafe(18)
    party.token_hash, party.token_encrypted = _hash(token), encrypt_token(token)
    await db.commit()
    return await _detail(db, party, request)


@router.post("/{party_id}/tasks", status_code=status.HTTP_201_CREATED)
async def add_task(party_id: uuid.UUID, payload: TaskIn, request: Request, user: PartyActor, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    count = (await db.execute(select(func.count()).select_from(PartyTask).where(PartyTask.party_id == party.id))).scalar_one()
    db.add(PartyTask(family_id=party.family_id, party_id=party.id, title=payload.title.strip(), due_date=payload.due_date, who=payload.who, position=count))
    await db.commit()
    return await _detail(db, party, request)


@router.put("/{party_id}/tasks/{task_id}")
async def change_task(party_id: uuid.UUID, task_id: uuid.UUID, payload: TaskChange, request: Request, user: PartyActor, db: DB) -> dict:
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
async def delete_task(party_id: uuid.UUID, task_id: uuid.UUID, request: Request, user: PartyActor, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    await db.execute(delete(PartyTask).where(PartyTask.id == task_id, PartyTask.party_id == party.id))
    await db.commit()
    return await _detail(db, party, request)


@router.post("/{party_id}/expenses", status_code=status.HTTP_201_CREATED)
async def add_expense(party_id: uuid.UUID, payload: ExpenseIn, request: Request, user: PartyActor, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    db.add(PartyExpense(family_id=party.family_id, party_id=party.id, title=payload.title.strip(), amount=payload.amount, paid_by=payload.paid_by or user.id, created_at=datetime.now(timezone.utc)))
    await db.commit()
    return await _detail(db, party, request)


@router.delete("/{party_id}/expenses/{expense_id}")
async def delete_expense(party_id: uuid.UUID, expense_id: uuid.UUID, request: Request, user: PartyActor, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    await db.execute(delete(PartyExpense).where(PartyExpense.id == expense_id, PartyExpense.party_id == party.id))
    await db.commit()
    return await _detail(db, party, request)


@router.post("/{party_id}/steps", status_code=status.HTTP_201_CREATED)
async def add_step(party_id: uuid.UUID, payload: StepIn, request: Request, user: PartyActor, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    db.add(PartyStep(family_id=party.family_id, party_id=party.id, at=payload.at, title=payload.title.strip(), hidden=payload.hidden))
    await db.commit()
    return await _detail(db, party, request)


@router.put("/{party_id}/steps/{step_id}")
async def change_step(party_id: uuid.UUID, step_id: uuid.UUID, payload: StepChange, request: Request, user: PartyActor, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    step = await db.get(PartyStep, step_id)
    if step is None or step.party_id != party.id:
        raise HTTPException(status_code=404, detail="Not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(step, key, value.strip() if isinstance(value, str) and key == "title" else value)
    await db.commit()
    return await _detail(db, party, request)


def _mailing_out(m: PartyMailing) -> dict:
    return {"id": m.id, "kind": m.kind, "audience": m.audience, "subject": m.subject, "text": m.text, "send_at": m.send_at, "sent_at": m.sent_at, "sent_count": m.sent_count}


@router.post("/{party_id}/mailings", status_code=status.HTTP_201_CREATED)
async def add_mailing(party_id: uuid.UUID, payload: MailingIn, request: Request, user: PartyActor, db: DB) -> dict:
    """A mail to the guests at a time of the hosts' choosing (now, or later)."""
    party = await _mine(db, user, party_id)
    if not await _mail_ready(db, party):
        raise HTTPException(status_code=409, detail="E-mail isn't set up on this server")
    if payload.kind == "custom" and not (payload.subject.strip() and payload.text.strip()):
        raise HTTPException(status_code=422, detail="A message needs a subject and a text")
    count = (await db.execute(select(func.count()).select_from(PartyMailing).where(PartyMailing.party_id == party.id))).scalar_one()
    if count >= 30:
        raise HTTPException(status_code=409, detail="Too many mailings")
    db.add(PartyMailing(family_id=party.family_id, party_id=party.id, kind=payload.kind, audience=payload.audience, subject=payload.subject.strip(), text=payload.text.strip(), send_at=_utc(_dt(payload.send_at)), created_by=user.id, sent_count=0))
    await db.commit()
    await run_party_mailings(db, base=await public_base(db, request))
    return await _detail(db, party, request)


@router.delete("/{party_id}/mailings/{mailing_id}")
async def delete_mailing(party_id: uuid.UUID, mailing_id: uuid.UUID, request: Request, user: PartyActor, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    await db.execute(delete(PartyMailing).where(PartyMailing.id == mailing_id, PartyMailing.party_id == party.id, PartyMailing.sent_at.is_(None)))
    await db.commit()
    return await _detail(db, party, request)


async def run_party_mailings(db: AsyncSession, now: datetime | None = None, base: str | None = None) -> int:
    """The mailings whose time has come, each once, to the guests it's for."""
    now = now or datetime.now(timezone.utc)
    # Without the server's address the links wouldn't lead anywhere: they wait (the hosts are told).
    base = base if base is not None else await public_base(db)
    if not base:
        return 0
    due = (await db.execute(select(PartyMailing).where(PartyMailing.sent_at.is_(None), PartyMailing.send_at <= now))).scalars().all()
    sent = 0
    for m in due:
        party = await db.get(Party, m.party_id)
        m.sent_at = now
        await db.commit()
        if party is None:
            continue
        guests = (await db.execute(select(PartyGuest).where(PartyGuest.party_id == party.id, PartyGuest.updates == True, PartyGuest.email.is_not(None)))).scalars().all()  # noqa: E712
        if m.audience == "waiting":
            guests = [g for g in guests if g.pending]
        elif m.audience == "coming" or m.kind == "thanks":
            guests = [g for g in guests if g.coming]
        if m.kind == "invite":
            party.phase = "invite"
        elif m.kind == "thanks":
            party.thanks_published = True
        kind = {"invite": "invited", "custom": "message", "remind": "remind_rsvp" if m.audience == "waiting" else "reminder"}.get(m.kind, m.kind)
        values = {"subject": m.subject, "text": m.text} if m.kind == "custom" else {"text": party.thanks_text or ""} if m.kind == "thanks" else {}
        m.sent_count = await mail_guests(db, party, kind, guests=guests, base=base, **values)
        await db.commit()
        sent += m.sent_count
    return sent


@router.delete("/{party_id}/steps/{step_id}")
async def delete_step(party_id: uuid.UUID, step_id: uuid.UUID, request: Request, user: PartyActor, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    await db.execute(delete(PartyStep).where(PartyStep.id == step_id, PartyStep.party_id == party.id))
    await db.commit()
    return await _detail(db, party, request)


@router.post("/{party_id}/guests", status_code=status.HTTP_201_CREATED)
async def add_guest(party_id: uuid.UUID, payload: GuestIn, request: Request, user: PartyActor, db: DB) -> dict:
    """A reply that came by text or at the door: an adult adds it."""
    party = await _mine(db, user, party_id)
    now = datetime.now(timezone.utc)
    key = secrets.token_urlsafe(18)
    data = _clean_guest(payload, party)
    invited = data.pop("invited", False)
    if invited:
        data.update(coming=False, updates=bool(data.get("email")))
    db.add(PartyGuest(family_id=party.family_id, party_id=party.id, key_hash=_hash(key), key_encrypted=encrypt_token(key), created_at=now, updated_at=now, pending=invited, **data))
    await db.commit()
    return await _detail(db, party, request)


# --- The helpers and their plan ----------------------------------------------------------------


# --- The chats ------------------------------------------------------------------------------------

_CHAT_NAMES = {
    "en": {"guests": "{title} – guests", "planners": "{title} – planning"}, "sv": {"guests": "{title} – gäster", "planners": "{title} – planering"},
    "nb": {"guests": "{title} – gjester", "planners": "{title} – planlegging"}, "da": {"guests": "{title} – gæster", "planners": "{title} – planlægning"},
    "fi": {"guests": "{title} – vieraat", "planners": "{title} – suunnittelu"},
}
CHAT_MESSAGES = 5000
CHAT_PER_MINUTE = 12


async def _party_chat(db: AsyncSession, party: Party, kind: str) -> Conversation | None:
    return (await db.execute(select(Conversation).where(Conversation.party_id == party.id, Conversation.party_kind == kind))).scalars().first()


async def _sync_chats(db: AsyncSession, party: Party) -> None:
    """The party's chats in the chat app: there while they're chosen, with the family's adults in them.
    The planners' leaves out those the plan is kept from."""
    language = await _host_language(db, party)
    adults = (await db.execute(select(User.id).where(User.family_id == party.family_id, User.role.in_(["admin", "adult"])))).scalars().all()
    for kind, on in (("guests", party.guest_chat), ("planners", party.planner_chat)):
        conv = await _party_chat(db, party, kind)
        if not on:
            if conv is not None:
                await db.execute(delete(ChatMessage).where(ChatMessage.conversation_id == conv.id))
                await db.execute(delete(ConversationMember).where(ConversationMember.conversation_id == conv.id))
                await db.delete(conv)
            continue
        name = _CHAT_NAMES.get(language, _CHAT_NAMES["en"])[kind].format(title=party.title)[:80]
        if conv is None:
            conv = Conversation(family_id=party.family_id, name=name, created_by=party.created_by, party_id=party.id, party_kind=kind)
            db.add(conv)
            await db.flush()
        conv.name = name
        wanted = {a for a in adults if kind == "guests" or str(a) not in (party.plan_hidden or [])}
        members = (await db.execute(select(ConversationMember).where(ConversationMember.conversation_id == conv.id))).scalars().all()
        for m in members:
            if m.user_id not in wanted:
                await db.delete(m)
        for user_id in wanted - {m.user_id for m in members}:
            db.add(ConversationMember(conversation_id=conv.id, user_id=user_id))


async def _chat_page(db: AsyncSession, party: Party, conv: Conversation, mine: tuple[uuid.UUID | None, str | None]) -> dict:
    rows = (await db.execute(select(ChatMessage).where(ChatMessage.conversation_id == conv.id).order_by(ChatMessage.created_at.desc()).limit(100))).scalars().all()
    people = {u.id: u.display_name for u in (await db.execute(select(User).where(User.family_id == party.family_id))).scalars().all()}
    return {"messages": [
        {"id": m.id, "name": m.sender_name or people.get(m.sender_id, ""), "body": m.body, "at": m.created_at, "host": m.sender_id is not None,
         "mine": (m.sender_id == mine[0]) if mine[0] else (m.sender_id is None and m.sender_name == mine[1] and mine[1] is not None)}
        for m in reversed(rows)
    ]}


async def _chat_post(db: AsyncSession, party: Party, conv: Conversation, body: str, sender_id: uuid.UUID | None, sender_name: str | None) -> None:
    """A message in a party's chat, and word to those in the chat app. Not without limits: guests write here."""
    from app.services.push import send_to_user, user_pref_enabled

    text = body.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Write something")
    now = datetime.now(timezone.utc)
    if (await db.execute(select(func.count()).select_from(ChatMessage).where(ChatMessage.conversation_id == conv.id))).scalar_one() >= CHAT_MESSAGES:
        raise HTTPException(status_code=409, detail="The chat is full")
    recent = select(func.count()).select_from(ChatMessage).where(ChatMessage.conversation_id == conv.id, ChatMessage.created_at > now - timedelta(minutes=1))
    who = ChatMessage.sender_id == sender_id if sender_id else ChatMessage.sender_name == sender_name
    if (await db.execute(recent.where(who))).scalar_one() >= CHAT_PER_MINUTE:
        raise HTTPException(status_code=429, detail="Slow down a little")
    db.add(ChatMessage(family_id=party.family_id, conversation_id=conv.id, sender_id=sender_id, sender_name=sender_name, body=text, created_at=now))
    await db.commit()
    author = sender_name
    if sender_id:
        sender = await db.get(User, sender_id)
        author = sender.display_name if sender else ""
    for member in (await db.execute(select(ConversationMember).where(ConversationMember.conversation_id == conv.id))).scalars().all():
        if member.user_id == sender_id:
            continue
        recipient = await db.get(User, member.user_id)
        if recipient and user_pref_enabled(recipient, "chat"):
            await send_to_user(db, recipient.id, {"title": f"{author} · {party.title}", "body": text[:180], "route": "/chat", "kind": "chat", "peer": str(conv.id)})


async def _planner_chat(db: AsyncSession, party: Party, kind: str, user: object) -> Conversation:
    if kind not in ("guests", "planners"):
        raise HTTPException(status_code=404, detail="No such chat")
    if kind == "planners":
        _plan_open(party, user)
    conv = await _party_chat(db, party, kind)
    if conv is None:
        raise HTTPException(status_code=404, detail="This party has no such chat")
    return conv


async def _actor_name(db: AsyncSession, user: object) -> tuple[uuid.UUID | None, str | None]:
    if isinstance(user, HelperActor):
        helper = await db.get(PartyHelper, user.helper_id)
        return None, helper.name if helper else ""
    return user.id, None


@router.get("/{party_id}/chat/{kind}")
async def read_chat(party_id: uuid.UUID, kind: str, user: PartyActor, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    await _sync_chats(db, party)
    await db.commit()
    return await _chat_page(db, party, await _planner_chat(db, party, kind, user), await _actor_name(db, user))


@router.post("/{party_id}/chat/{kind}", status_code=status.HTTP_201_CREATED)
async def write_chat(party_id: uuid.UUID, kind: str, payload: ChatIn, user: PartyActor, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    sender_id, name = await _actor_name(db, user)
    await _chat_post(db, party, await _planner_chat(db, party, kind, user), payload.body, sender_id, name)
    return {"done": True}


@router.delete("/{party_id}/chat/{kind}/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_chat_message(party_id: uuid.UUID, kind: str, message_id: uuid.UUID, user: PartyActor, db: DB) -> None:
    """The hosts and helpers keep the chat a nice place."""
    party = await _mine(db, user, party_id)
    conv = await _planner_chat(db, party, kind, user)
    await db.execute(delete(ChatMessage).where(ChatMessage.id == message_id, ChatMessage.conversation_id == conv.id))
    await db.commit()


@router.post("/{party_id}/mail-preview")
async def mail_preview(party_id: uuid.UUID, payload: MailPreviewIn, request: Request, user: PartyActor, db: DB) -> dict:
    """A mail as a guest would get it, in the party's theme, with a made-up guest."""
    party = await _mine(db, user, party_id)
    language = await _host_language(db, party)
    texts = _MAIL.get(language, _MAIL["en"])
    base = await public_base(db, request)
    colors, header = await _mail_look(db, party, base)
    link = f"{base}/party/{decrypt_token(party.token_encrypted)}"
    when = _when_where(party, language)
    fields = {"title": party.title, "name": payload.name or "Anna", "when": when, "link": link, "answer": texts["answers"][0], "by": "", "text": party.thanks_text or "", "subject": ""}
    foot, stop = _small_print(texts["stop"])
    return {
        "subject": _fill(payload.subject, fields),
        "html": party_mail.render(colors=colors, title=party.title, emoji=party.emoji, text=_fill(payload.text, fields), when="" if "{when}" in payload.text else when, button=_OPEN.get(language, _OPEN["en"]), link=link, foot=foot, stop=stop, stop_link=link, header=header),
    }


@router.post("/{party_id}/helpers", status_code=status.HTTP_201_CREATED)
async def invite_helper(party_id: uuid.UUID, payload: HelperIn, request: Request, user: PartyActor, db: DB) -> dict:
    """Someone from outside to help run this party, by a personal link until a while after it."""
    party = await _mine(db, user, party_id)
    if (await db.execute(select(func.count()).select_from(PartyHelper).where(PartyHelper.party_id == party.id))).scalar_one() >= 10:
        raise HTTPException(status_code=409, detail="Too many helpers")
    token = secrets.token_urlsafe(24)
    helper = PartyHelper(
        family_id=party.family_id, party_id=party.id, name=payload.name.strip(), role=payload.role, email=(payload.email or "").strip().lower() or None,
        days_after=payload.days_after, token_hash=_hash(token), token_encrypted=encrypt_token(token), created_at=datetime.now(timezone.utc),
    )
    db.add(helper)
    # They plan together: the chat comes with them.
    party.planner_chat = True
    await _sync_chats(db, party)
    await db.commit()
    mailed = await _mail_helper(db, party, helper, "helper", await _helper_link(db, helper, request)) if await configured_url(db) else False
    return {"mailed": mailed, "party": await _detail(db, party, request)}


@router.post("/{party_id}/helpers/{helper_id}/link")
async def helper_link(party_id: uuid.UUID, helper_id: uuid.UUID, request: Request, user: PartyActor, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    helper = await db.get(PartyHelper, helper_id)
    if helper is None or helper.party_id != party.id:
        raise HTTPException(status_code=404, detail="Helper not found")
    return {"link": await _helper_link(db, helper, request)}


@router.delete("/{party_id}/helpers/{helper_id}")
async def remove_helper(party_id: uuid.UUID, helper_id: uuid.UUID, request: Request, user: PartyActor, db: DB) -> dict:
    """Their link stops working at once."""
    party = await _mine(db, user, party_id)
    await db.execute(delete(PartyHelper).where(PartyHelper.id == helper_id, PartyHelper.party_id == party.id))
    await db.commit()
    return await _detail(db, party, request)


def _plan_open(party: Party, user: object) -> None:
    if _plan_kept_from(party, user):
        raise HTTPException(status_code=403, detail="The helpers keep this from you")


@router.put("/{party_id}/plan/hidden")
async def hide_plan(party_id: uuid.UUID, payload: PlanHiddenIn, request: Request, user: PartyActor, db: DB) -> dict:
    """Whom the plan is kept from. It's the helpers' to choose."""
    party = await _mine(db, user, party_id)
    if not isinstance(user, HelperActor):
        raise HTTPException(status_code=403, detail="Only the helpers choose this")
    adults = {a for a in (await db.execute(select(User.id).where(User.family_id == party.family_id))).scalars().all()}
    party.plan_hidden = [str(x) for x in payload.user_ids if x in adults] or None
    # Those it's kept from aren't in the chat about it either.
    await _sync_chats(db, party)
    await db.commit()
    return await _detail(db, party, request)


@router.post("/{party_id}/plan", status_code=status.HTTP_201_CREATED)
async def add_plan_item(party_id: uuid.UUID, payload: PlanItemIn, request: Request, user: PartyActor, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    _plan_open(party, user)
    db.add(PartyPlanItem(family_id=party.family_id, party_id=party.id, created_at=datetime.now(timezone.utc), **{**payload.model_dump(), "title": payload.title.strip()}))
    await db.commit()
    return await _detail(db, party, request)


async def _plan_item(db: AsyncSession, party: Party, item_id: uuid.UUID) -> PartyPlanItem:
    item = await db.get(PartyPlanItem, item_id)
    if item is None or item.party_id != party.id:
        raise HTTPException(status_code=404, detail="Not found")
    return item


@router.put("/{party_id}/plan/{item_id}")
async def change_plan_item(party_id: uuid.UUID, item_id: uuid.UUID, payload: PlanItemChange, request: Request, user: PartyActor, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    _plan_open(party, user)
    item = await _plan_item(db, party, item_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None or key == "minutes":
            setattr(item, key, value)
    await db.commit()
    return await _detail(db, party, request)


@router.delete("/{party_id}/plan/{item_id}")
async def delete_plan_item(party_id: uuid.UUID, item_id: uuid.UUID, request: Request, user: PartyActor, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    _plan_open(party, user)
    await db.delete(await _plan_item(db, party, item_id))
    await db.commit()
    return await _detail(db, party, request)


# --- Suppliers ---------------------------------------------------------------------------------


@router.get("/{party_id}/vendors/search")
async def search_vendors(party_id: uuid.UUID, user: PartyActor, db: DB, q: str = Query(min_length=2, max_length=200)) -> dict:
    """Through the server's own search, when the admin has turned it on: only the words go out."""
    from app.services import recipe_search

    await _mine(db, user, party_id)
    url = await recipe_search.get_url(db)
    if not url:
        return {"enabled": False, "hits": []}
    try:
        hits = await recipe_search.search(url, q, user.language or "en", recipe=False)
    except Exception as exc:  # the search engine's trouble isn't the party's
        raise HTTPException(status_code=502, detail="The search didn't answer") from exc
    return {"enabled": True, "hits": [{"title": h.title, "url": h.url, "site": h.site, "snippet": h.snippet} for h in hits]}


@router.post("/{party_id}/vendors", status_code=status.HTTP_201_CREATED)
async def add_vendor(party_id: uuid.UUID, payload: VendorIn, request: Request, user: PartyActor, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    if (await db.execute(select(func.count()).select_from(PartyVendor).where(PartyVendor.party_id == party.id))).scalar_one() >= 200:
        raise HTTPException(status_code=409, detail="Too many")
    db.add(PartyVendor(family_id=party.family_id, party_id=party.id, created_at=datetime.now(timezone.utc), **{**payload.model_dump(), "name": payload.name.strip()}))
    await db.commit()
    return await _detail(db, party, request)


async def _vendor(db: AsyncSession, party: Party, vendor_id: uuid.UUID) -> PartyVendor:
    vendor = await db.get(PartyVendor, vendor_id)
    if vendor is None or vendor.party_id != party.id:
        raise HTTPException(status_code=404, detail="Not found")
    return vendor


@router.put("/{party_id}/vendors/{vendor_id}")
async def change_vendor(party_id: uuid.UUID, vendor_id: uuid.UUID, payload: VendorChange, request: Request, user: PartyActor, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    vendor = await _vendor(db, party, vendor_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None or key == "price":
            setattr(vendor, key, value)
    await db.commit()
    return await _detail(db, party, request)


@router.delete("/{party_id}/vendors/{vendor_id}")
async def delete_vendor(party_id: uuid.UUID, vendor_id: uuid.UUID, request: Request, user: PartyActor, db: DB) -> dict:
    """What's gone to the budget stays there: it's what the party cost."""
    party = await _mine(db, user, party_id)
    await db.delete(await _vendor(db, party, vendor_id))
    await db.commit()
    return await _detail(db, party, request)


@router.post("/{party_id}/vendors/{vendor_id}/budget")
async def vendor_to_budget(party_id: uuid.UUID, vendor_id: uuid.UUID, request: Request, user: PartyActor, db: DB) -> dict:
    """The chosen supplier's price among the party's costs: once."""
    party = await _mine(db, user, party_id)
    vendor = await _vendor(db, party, vendor_id)
    if vendor.price is None:
        raise HTTPException(status_code=422, detail="It has no price")
    if vendor.expense_id is None:
        expense = PartyExpense(family_id=party.family_id, party_id=party.id, title=vendor.name[:120], amount=vendor.price, paid_by=user.id, created_at=datetime.now(timezone.utc))
        db.add(expense)
        await db.flush()
        vendor.expense_id = expense.id
    vendor.status = "booked"
    await db.commit()
    return await _detail(db, party, request)


@router.post("/{party_id}/guests/import")
async def import_guests(party_id: uuid.UUID, payload: GuestImportIn, request: Request, user: PartyActor, db: DB) -> dict:
    """A guest list brought in: everyone invited, with their own link. Who's already there stays as they are."""
    party = await _mine(db, user, party_id)
    now = datetime.now(timezone.utc)
    existing = (await db.execute(select(PartyGuest).where(PartyGuest.party_id == party.id))).scalars().all()
    seen = {(g.email or "").lower() for g in existing if g.email} | {_name({"first_name": g.first_name, "last_name": g.last_name}).lower() for g in existing if not g.email}
    added = 0
    for row in payload.guests:
        email = (row.email or "").strip().lower() or None
        who = email or _name({"first_name": row.first_name.strip(), "last_name": row.last_name.strip()}).lower()
        if who in seen:
            continue
        seen.add(who)
        key = secrets.token_urlsafe(18)
        db.add(PartyGuest(
            family_id=party.family_id, party_id=party.id, key_hash=_hash(key), key_encrypted=encrypt_token(key), created_at=now, updated_at=now, pending=True, coming=False,
            first_name=row.first_name.strip(), last_name=row.last_name.strip(), email=email, updates=bool(email), allergies=row.allergies.strip(),
        ))
        added += 1
    await db.commit()
    return {"added": added, "skipped": len(payload.guests) - added, "party": await _detail(db, party, request)}


@router.put("/{party_id}/guests/{guest_id}/table")
async def seat_guest(party_id: uuid.UUID, guest_id: uuid.UUID, payload: SeatIn, request: Request, user: PartyActor, db: DB) -> dict:
    """A guest and their company at a table, or without one."""
    party = await _mine(db, user, party_id)
    guest = await db.get(PartyGuest, guest_id)
    if guest is None or guest.party_id != party.id:
        raise HTTPException(status_code=404, detail="Guest not found")
    if payload.table_id is not None and payload.table_id not in [t["id"] for t in party.tables or []]:
        raise HTTPException(status_code=404, detail="Table not found")
    guest.table_id = payload.table_id
    # Those together sit together.
    for g in await _group(db, party, guest.group_id):
        g.table_id = payload.table_id
    await db.commit()
    return await _detail(db, party, request)


@router.post("/{party_id}/guests/{guest_id}/link")
async def guest_link(party_id: uuid.UUID, guest_id: uuid.UUID, request: Request, user: PartyActor, db: DB) -> dict:
    """A guest's own link, for the hosts to send themselves. Asked for one at a time, so the keys stay
    out of the party's data. A guest from before keys were kept gets a new one."""
    party = await _mine(db, user, party_id)
    guest = await db.get(PartyGuest, guest_id)
    if guest is None or guest.party_id != party.id:
        raise HTTPException(status_code=404, detail="Guest not found")
    if guest.key_encrypted:
        key = decrypt_token(guest.key_encrypted)
    else:
        key = secrets.token_urlsafe(24)
        guest.key_hash, guest.key_encrypted = _hash(key), encrypt_token(key)
        await db.commit()
    return {"link": f"{await _link(db, party, request)}?key={key}"}


@router.delete("/{party_id}/guests/{guest_id}")
async def delete_guest(party_id: uuid.UUID, guest_id: uuid.UUID, request: Request, user: PartyActor, db: DB) -> dict:
    party = await _mine(db, user, party_id)
    gone = await db.get(PartyGuest, guest_id)
    group_id = gone.group_id if gone is not None and gone.party_id == party.id else None
    await db.execute(delete(PartyGuest).where(PartyGuest.id == guest_id, PartyGuest.party_id == party.id))
    left = await _group(db, party, group_id)
    if len(left) == 1:
        left[0].group_id = None
    await db.commit()
    return await _detail(db, party, request)


@router.put("/{party_id}/guests/{guest_id}/group")
async def group_guest(party_id: uuid.UUID, guest_id: uuid.UUID, payload: GroupIn, request: Request, user: PartyActor, db: DB) -> dict:
    """Two guests who belong together, each keeping their own reply and link – or one on their own again."""
    party = await _mine(db, user, party_id)
    guest = await db.get(PartyGuest, guest_id)
    if guest is None or guest.party_id != party.id:
        raise HTTPException(status_code=404, detail="Guest not found")
    if payload.with_id is None:
        left = [g for g in await _group(db, party, guest.group_id) if g.id != guest.id]
        guest.group_id = None
        if len(left) == 1:
            left[0].group_id = None
    else:
        other = await db.get(PartyGuest, payload.with_id)
        if other is None or other.party_id != party.id or other.id == guest.id:
            raise HTTPException(status_code=404, detail="Guest not found")
        group_id = guest.group_id or other.group_id or secrets.token_hex(8)
        members = {g.id: g for g in [guest, other, *await _group(db, party, guest.group_id), *await _group(db, party, other.group_id)]}.values()
        table = next((g.table_id for g in members if g.table_id), None)
        for g in members:
            g.group_id = group_id
            g.table_id = g.table_id or table
        _no_doubles(list(members))
    await db.commit()
    return await _detail(db, party, request)


def _clean_guest(payload: GuestIn, party: Party) -> dict:
    data = {k: (v.strip() if isinstance(v, str) else v) for k, v in payload.model_dump().items()}
    data.pop("for_group", None)
    # Whoever they bring, as far as the hosts allow: no one, one, or the family.
    allowed = {"none": 0, "one": 1}.get(party.bring, 20)
    dishes = {m["id"] for m in party.menu or []}
    data["menu_choice"] = data.get("menu_choice") if data.get("menu_choice") in dishes else None
    data["wants_speech"] = bool(data.get("wants_speech") and party.speech_signup)
    data["speech_note"] = data.get("speech_note", "") if data["wants_speech"] else ""
    data["companions"] = [
        {"first_name": c["first_name"].strip(), "last_name": c["last_name"].strip(), "child": bool(c["child"]), "allergies": c["allergies"].strip(), "menu_choice": c["menu_choice"] if c["menu_choice"] in dishes else None}
        for c in payload.model_dump()["companions"] if c["first_name"].strip()
    ][:allowed] or None
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


# --- A helper's way in --------------------------------------------------------------------------


@helpers.post("/{token}/enter")
async def helper_enter(token: str, request: Request, response: Response, db: DB) -> dict:
    """A helper's personal link: this browser may plan that party until the link ends."""
    ip = login_throttle.client_ip(request)
    if login_throttle.ip_retry_after(ip):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    helper = (await db.execute(select(PartyHelper).where(PartyHelper.token_hash == _hash(token)))).scalar_one_or_none()
    party = await db.get(Party, helper.party_id) if helper else None
    if helper is None or party is None:
        login_throttle.record_ip_failure(ip)
        raise HTTPException(status_code=404, detail="This link isn't valid")
    ends = _helper_ends(helper, party)
    now = datetime.now(timezone.utc)
    if now >= ends:
        raise HTTPException(status_code=410, detail="This link has ended")
    helper.last_seen = now
    await db.commit()
    response.headers.update(NO_STORE)
    response.set_cookie(HELPER_COOKIE, token, httponly=True, samesite="lax", secure=get_settings().cookie_secure, max_age=int((ends - now).total_seconds()), path="/")
    return {"party_id": party.id, "title": party.title, "name": helper.name, "role": helper.role, "language": await _host_language(db, party), "ends_at": ends}


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
                names.append(f"{g.first_name} {g.last_name}".strip())
                names.extend(_name(c) for c in g.companions or [])
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
        "page_theme": party.page_theme, "mail": await _mail_ready(db, party),
        "date_poll": party.date_poll, "date_options": party.date_options or [],
        "stage": _stage(party), "portal_token": decrypt_token(party.portal_token_encrypted) if _stage(party) == "portal" else None,
        "page_custom": await _custom(db, party, party.page_custom_id),
        "invite_image": _version(party.invite_image_key),
        "layout": party.layout, "layouts": _layouts(party), "assets": _assets_out(party), "phase": party.phase, "playlist_url": party.playlist_url,
        "tally": _tally(party, guests, names=party.show_guests == "names") if party.date_poll and party.show_guests != "none" else None,
        "language": (host.language if host else None) or "en",
        "title": party.title, "kind": party.kind, "emoji": party.emoji, "color": party.color, "family_name": family.name if family else "",
        "starts_at": party.starts_at, "ends_at": party.ends_at, "place": party.place, "address": party.address, "theme": party.theme,
        "invitation": party.invitation, "rsvp_by": party.rsvp_by, "bring": party.bring, "open": _open_for_replies(party),
        "guests": seen, "wishes": wishes, "thanks": thanks, "mine": _guest_out(mine) if mine else None,
        "together": [{"name": g.first_name, "pending": g.pending} for g in guests if mine and mine.group_id and g.group_id == mine.group_id and g.id != mine.id],
        "menu": party.menu or [], "speech_signup": party.speech_signup, "practical": party.practical or {}, "guest_chat": party.guest_chat,
    }


async def _custom(db: AsyncSession, party: Party, theme_id: uuid.UUID | None) -> dict | None:
    theme = await db.get(PartyTheme, theme_id) if theme_id else None
    return _theme_out(theme) if theme is not None and theme.family_id == party.family_id else None


@public.get("/{token}/assets/{asset_id}")
async def public_asset(token: str, asset_id: str, request: Request, db: DB) -> Response:
    party = await _open(db, token, request)
    return _picture(party.family_id, next((a["key"] for a in party.assets or [] if a["id"] == asset_id), None))


@public.get("/{token}/picture")
async def public_invite_picture(token: str, request: Request, db: DB) -> Response:
    party = await _open(db, token, request)
    return _picture(party.family_id, party.invite_image_key)


@public.get("/{token}/themes/{theme_id}/{slot}")
async def public_theme_picture(token: str, theme_id: uuid.UUID, slot: str, request: Request, db: DB) -> Response:
    """A picture of the party's own theme (the invitation's or the thank-you's)."""
    party = await _open(db, token, request)
    theme = await db.get(PartyTheme, theme_id)
    if theme is None or theme.id != party.page_custom_id or slot not in ("header", "background"):
        raise HTTPException(status_code=404, detail="Not found")
    return _picture(party.family_id, getattr(theme, f"{slot}_key"))


class SubscribeIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(default="", max_length=80)
    email: str = Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@public.post("/{token}/subscribe")
async def subscribe(token: str, payload: SubscribeIn, request: Request, db: DB, key: str | None = None) -> dict:
    """From the save-the-date: a name and an e-mail for the updates (the invitation when it's out).
    The key kept in the browser turns it into the reply later."""
    party = await _open(db, token, request)
    if not await _mail_ready(db, party):
        raise HTTPException(status_code=409, detail="E-mail isn't set up on this server")
    guest = None
    if key:
        guest = (await db.execute(select(PartyGuest).where(PartyGuest.party_id == party.id, PartyGuest.key_hash == _hash(key)))).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if guest is None:
        count = (await db.execute(select(func.count()).select_from(PartyGuest).where(PartyGuest.party_id == party.id))).scalar_one()
        if count >= 500:
            raise HTTPException(status_code=409, detail="Too many replies")
        key = secrets.token_urlsafe(18)
        guest = PartyGuest(family_id=party.family_id, party_id=party.id, key_hash=_hash(key), key_encrypted=encrypt_token(key), created_at=now, coming=False, pending=True)
        db.add(guest)
    guest.first_name, guest.last_name = payload.first_name.strip(), payload.last_name.strip()
    guest.email, guest.updates, guest.updated_at = payload.email.strip().lower(), True, now
    await db.commit()
    await mail_guests(db, party, "subscribed", guests=[guest], base=await public_base(db, request))
    return {"key": key, "mine": _guest_out(guest)}


@public.post("/{token}/reply")
async def reply(token: str, payload: GuestIn, request: Request, db: DB, key: str | None = None) -> dict:
    """The guest's reply – or, with the key their browser kept, a change to it."""
    party = await _open(db, token, request)
    if not _open_for_replies(party):
        raise HTTPException(status_code=409, detail="The party is over")
    now = datetime.now(timezone.utc)
    data = _clean_guest(payload, party)
    data.pop("invited", None)
    guest = None
    if key:
        guest = (await db.execute(select(PartyGuest).where(PartyGuest.party_id == party.id, PartyGuest.key_hash == _hash(key)))).scalar_one_or_none()
    if guest is None:
        count = (await db.execute(select(func.count()).select_from(PartyGuest).where(PartyGuest.party_id == party.id))).scalar_one()
        if count >= 500:
            raise HTTPException(status_code=409, detail="Too many replies")
        key = secrets.token_urlsafe(18)
        guest = PartyGuest(family_id=party.family_id, party_id=party.id, key_hash=_hash(key), key_encrypted=encrypt_token(key), created_at=now)
        db.add(guest)
    asked_now = data.get("updates") and not guest.updates
    guest.pending = False
    for k, v in data.items():
        setattr(guest, k, v)
    guest.updated_at = now
    await db.flush()
    members = await _group(db, party, guest.group_id)
    if members:
        # Their +1 is the one they're together with: no other, and nobody counted twice.
        if party.bring == "one":
            guest.companions = None
        _no_doubles(members)
        if payload.for_group:
            for other in members:
                if other.id != guest.id and other.pending:
                    other.coming, other.pending, other.updated_at = guest.coming, False, now
                    if party.date_poll:
                        other.date_votes = guest.date_votes
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


async def _guest_in_chat(db: AsyncSession, party: Party, key: str) -> tuple[PartyGuest, Conversation]:
    guest = (await db.execute(select(PartyGuest).where(PartyGuest.party_id == party.id, PartyGuest.key_hash == _hash(key)))).scalar_one_or_none()
    conv = await _party_chat(db, party, "guests") if party.guest_chat else None
    if guest is None or conv is None:
        raise HTTPException(status_code=404, detail="Your own link is needed")
    return guest, conv


@public.get("/{token}/chat")
async def guest_reads_chat(token: str, request: Request, response: Response, db: DB, key: str) -> dict:
    party = await _open(db, token, request)
    guest, conv = await _guest_in_chat(db, party, key)
    response.headers.update(NO_STORE)
    return await _chat_page(db, party, conv, (None, f"{guest.first_name} {guest.last_name}".strip()))


@public.post("/{token}/chat", status_code=status.HTTP_201_CREATED)
async def guest_writes_chat(token: str, payload: ChatIn, request: Request, db: DB, key: str) -> dict:
    party = await _open(db, token, request)
    guest, conv = await _guest_in_chat(db, party, key)
    await _chat_post(db, party, conv, payload.body, None, f"{guest.first_name} {guest.last_name}".strip())
    return {"done": True}


@public.post("/{token}/checkin")
async def check_in(token: str, payload: CheckinIn, request: Request, db: DB, key: str) -> dict:
    """A thumb up or down before the party, by the guest's own link. Down is a changed reply, and the
    hosts hear of it at once."""
    from app.services.notify import notify

    party = await _open(db, token, request)
    if "checkin" not in _pages(party):
        raise HTTPException(status_code=404, detail="This party has no check-in")
    guest = (await db.execute(select(PartyGuest).where(PartyGuest.party_id == party.id, PartyGuest.key_hash == _hash(key)))).scalar_one_or_none()
    if guest is None:
        raise HTTPException(status_code=404, detail="Your own link is needed")
    now = datetime.now(timezone.utc)
    was_coming = guest.coming
    guest.checkin, guest.checkin_on, guest.coming, guest.pending, guest.updated_at = "yes" if payload.going else "no", now, payload.going, False, now
    if payload.message.strip():
        guest.message = payload.message.strip()
    await db.commit()
    if not payload.going and was_coming:
        name = f"{guest.first_name} {guest.last_name}".strip()
        language = await _host_language(db, party)
        line = {"sv": "{name} kan inte komma", "nb": "{name} kan ikke komme", "da": "{name} kan ikke komme", "fi": "{name} ei pääse"}.get(language, "{name} can't come").format(name=name)
        body = f"{line}: {guest.message}" if payload.message.strip() else line
        for adult in (await db.execute(select(User).where(User.family_id == party.family_id, User.role.in_(["admin", "adult"])))).scalars().all():
            await notify(db, adult, {"title": f"{party.emoji} {party.title}", "body": body, "route": f"/parties?id={party.id}", "kind": "party_task"}, pref="calendar_family")
        await db.commit()
    return {"mine": _guest_out(guest)}


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


async def _helper_link(db: AsyncSession, helper: PartyHelper, request: Request | None) -> str:
    return f"{await public_base(db, request)}/party-help/{decrypt_token(helper.token_encrypted)}"


async def _mail_helper(db: AsyncSession, party: Party, helper: PartyHelper, kind: str, base_link: str, **values) -> bool:
    """A mail to a helper, if they have an address and the server can send."""
    from app.services import mailer

    conf = await mailer.for_family(db, await db.get(Family, party.family_id))
    if conf is None or not helper.email:
        return False
    language = await _host_language(db, party)
    subject, body = _MAIL.get(language, _MAIL["en"])[kind]
    colors, header = await _mail_look(db, party, base_link.split("/party-help/")[0])
    fields = {"title": party.title, "name": helper.name, "link": base_link, "role": _ROLES.get(language, _ROLES["en"])[helper.role], "until": _helper_ends(helper, party).astimezone(_tz()).strftime("%Y-%m-%d"), **values}
    try:
        await mailer.send_with(conf, helper.email, _fill(subject, fields), _fill(body, fields), party_mail.render(colors=colors, title=party.title, emoji=party.emoji, text=_fill(body, fields), header=header))
    except mailer.MailError:
        return False
    return True


async def _mail_helper_task(db: AsyncSession, party: Party, task: PartyTask) -> None:
    helper = await db.get(PartyHelper, task.helper_id)
    if helper is not None and await public_base(db):
        await _mail_helper(db, party, helper, "helper_task", await _helper_link(db, helper, None), task=task.title)


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
        if task.helper_id:
            await _mail_helper_task(db, party, task)
            continue
        for adult in adults:
            if task.who and task.who != adult.id:
                continue
            await notify(db, adult, {"title": f"{party.emoji} {party.title}", "body": task.title, "route": f"/parties?id={party.id}", "kind": "party_task"}, pref="calendar_family")
            sent += 1
    await db.commit()
    # The guests who asked for updates: the day before, at the same morning hour.
    tomorrow = today + timedelta(days=1)
    base = await public_base(db)
    if not base:
        return sent  # the links wouldn't lead anywhere: the mails wait for the server's address
    for party in (await db.execute(select(Party).where(Party.guests_reminded_on.is_(None), Party.date_poll == False))).scalars().all():  # noqa: E712
        if _local(party.starts_at).date() != tomorrow:
            continue
        party.guests_reminded_on = today
        coming = (await db.execute(select(PartyGuest).where(PartyGuest.party_id == party.id, PartyGuest.coming == True, PartyGuest.updates == True))).scalars().all()  # noqa: E712
        await db.commit()
        sent += await mail_guests(db, party, "remind", guests=coming, base=base)
    # Those who haven't replied: once, the set number of days before the last day to reply.
    for party in (await db.execute(select(Party).where(Party.rsvp_reminded_on.is_(None), Party.rsvp_remind_days.is_not(None), Party.rsvp_remind_days > 0, Party.phase == "invite", Party.thanks_published == False, Party.date_poll == False))).scalars().all():  # noqa: E712
        start = _local(party.starts_at).date()
        last = party.rsvp_by or start - timedelta(days=7)
        if not last - timedelta(days=party.rsvp_remind_days) <= today <= last or today >= start:
            continue
        party.rsvp_reminded_on = today
        waiting = (await db.execute(select(PartyGuest).where(PartyGuest.party_id == party.id, PartyGuest.pending == True, PartyGuest.updates == True))).scalars().all()  # noqa: E712
        await db.commit()
        sent += await mail_guests(db, party, "remind_rsvp", guests=waiting, base=base)
    return sent


async def run_party_thanks(db: AsyncSession, now: datetime | None = None) -> int:
    """The thank-you at its set time, once there's something to say: published, and sent to those
    who came (the link then shows it)."""
    now = now or datetime.now(timezone.utc)
    base = await public_base(db)
    if not base:
        return 0
    sent = 0
    for party in (await db.execute(select(Party).where(Party.thanks_at.is_not(None), Party.thanks_at <= now, Party.thanks_published == False))).scalars().all():  # noqa: E712
        if not (party.thanks_text.strip() or party.thanks_album_id) or "thanks" not in _pages(party):
            continue
        party.thanks_published = True
        await db.commit()
        sent += await mail_guests(db, party, "thanks", guests=await _came(db, party), base=base, text=party.thanks_text or "")
    return sent


# --- The party day's portal, through its own link ---------------------------------------------

portal = APIRouter(prefix="/api/party-portal", tags=["party-portal"])
PORTAL_PHOTOS = 1000


async def _portal(db: AsyncSession, token: str, request: Request) -> Party:
    ip = login_throttle.client_ip(request)
    if login_throttle.ip_retry_after(ip):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    party = (await db.execute(select(Party).where(Party.portal_token_hash == _hash(token)))).scalar_one_or_none()
    if party is None or not _portal_live(party):
        login_throttle.record_ip_failure(ip)
        raise HTTPException(status_code=404, detail="This link isn't valid")
    return party


@portal.get("/{token}/chat")
async def portal_reads_chat(token: str, request: Request, response: Response, db: DB, me: str | None = None) -> dict:
    """During the party, for those at it: the QR code is their way in, and they write under a name."""
    party = await _portal(db, token, request)
    conv = await _party_chat(db, party, "guests") if party.guest_chat else None
    if conv is None:
        raise HTTPException(status_code=404, detail="This party has no chat")
    response.headers.update(NO_STORE)
    return await _chat_page(db, party, conv, (None, me))


@portal.post("/{token}/chat", status_code=status.HTTP_201_CREATED)
async def portal_writes_chat(token: str, payload: ChatIn, request: Request, db: DB) -> dict:
    party = await _portal(db, token, request)
    conv = await _party_chat(db, party, "guests") if party.guest_chat else None
    if conv is None:
        raise HTTPException(status_code=404, detail="This party has no chat")
    if not payload.name.strip():
        raise HTTPException(status_code=422, detail="Your name, please")
    await _chat_post(db, party, conv, payload.body, None, payload.name.strip())
    return {"done": True}


@portal.get("/{token}")
async def portal_page(token: str, request: Request, response: Response, db: DB) -> dict:
    """The day's page: what, when and where, the plan, the poster, and the photos so far. Before it
    opens, the QR code leads to a countdown and nothing else."""
    early = (await db.execute(select(Party).where(Party.portal_token_hash == _hash(token)))).scalar_one_or_none()
    if early is not None and "portal" in _pages(early) and not _portal_live(early) and not _past_portal(early, datetime.now(timezone.utc)):
        response.headers.update(NO_STORE)
        own = await _custom(db, early, early.page_custom_id)
        return {"locked": True, "title": early.title, "emoji": early.emoji, "opens_at": early.portal_at, "language": await _host_language(db, early), "page_theme": early.page_theme, "page_custom": {**own, "header": None, "background": None} if own else None}
    party = await _portal(db, token, request)
    response.headers.update(NO_STORE)
    family = await db.get(Family, party.family_id)
    steps = (await db.execute(select(PartyStep).where(PartyStep.party_id == party.id).order_by(PartyStep.at))).scalars().all()
    photos = []
    if party.portal_gallery and party.portal_album_id:
        photos = [str(m.id) for m in (await db.execute(select(MediaItem).where(MediaItem.album_id == party.portal_album_id, MediaItem.kind == "image").order_by(MediaItem.created_at.desc()))).scalars()][:300]
    return {
        "title": party.title, "kind": party.kind, "emoji": party.emoji, "family_name": family.name if family else "", "language": await _host_language(db, party), "practical": party.practical or {}, "guest_chat": party.guest_chat,
        "starts_at": party.starts_at, "ends_at": party.ends_at, "place": party.place, "address": party.address, "theme": party.theme, "invitation": party.invitation,
        "page_theme": party.page_theme, "page_custom": await _custom(db, party, party.page_custom_id), "invite_image": _version(party.invite_image_key),
        "layout": party.portal_layout, "assets": _assets_out(party), "playlist_url": party.playlist_url,
        "steps": [{"at": s.at, "title": s.title} for s in steps if not s.hidden], "gallery": party.portal_gallery, "photos": photos,
    }


@portal.post("/{token}/photos", status_code=status.HTTP_201_CREATED)
async def portal_upload(token: str, request: Request, file: UploadFile, db: DB, name: str = Query(default="", max_length=60)) -> dict:
    """A guest's photo (or short film) from the party, into the family's album for it."""
    from app.routers.albums import ALLOWED_TYPES, store_upload

    party = await _portal(db, token, request)
    album = await db.get(Album, party.portal_album_id) if party.portal_album_id else None
    host = await db.get(User, party.created_by) if party.created_by else None
    if album is None or host is None:
        raise HTTPException(status_code=409, detail="The portal has no album")
    count = (await db.execute(select(func.count()).select_from(MediaItem).where(MediaItem.album_id == album.id))).scalar_one()
    if count >= PORTAL_PHOTOS:
        raise HTTPException(status_code=409, detail="The album is full")
    original = file.filename or "photo"
    file.filename = f"{name.strip()[:60]} – {original}" if name.strip() else original
    out = await store_upload(file, album, host, db, ALLOWED_TYPES)
    return {"id": str(out.id)}


@portal.get("/{token}/photos/{item_id}")
async def portal_photo(token: str, item_id: uuid.UUID, request: Request, db: DB, variant: str = Query(default="thumb", pattern=r"^(thumb|view)$")) -> Response:
    party = await _portal(db, token, request)
    item = await db.get(MediaItem, item_id)
    if not party.portal_gallery or item is None or item.album_id != party.portal_album_id or item.kind != "image":
        raise HTTPException(status_code=404, detail="Not found")
    storage = get_storage()
    key = item.storage_key.rsplit(".", 1)[0] + ("_thumb.jpg" if variant == "thumb" else "_web.jpg")
    if not storage.exists(item.family_id, key):
        raise HTTPException(status_code=404, detail="Not found")
    return Response(content=storage.open(item.family_id, key).read_bytes(), media_type="image/jpeg", headers=NO_STORE)


@portal.get("/{token}/picture")
async def portal_invite_picture(token: str, request: Request, db: DB) -> Response:
    party = await _portal(db, token, request)
    return _picture(party.family_id, party.invite_image_key)


@portal.get("/{token}/assets/{asset_id}")
async def portal_asset(token: str, asset_id: str, request: Request, db: DB) -> Response:
    party = await _portal(db, token, request)
    return _picture(party.family_id, next((a["key"] for a in party.assets or [] if a["id"] == asset_id), None))


@portal.get("/{token}/themes/{theme_id}/{slot}")
async def portal_theme_picture(token: str, theme_id: uuid.UUID, slot: str, request: Request, db: DB) -> Response:
    party = await _portal(db, token, request)
    theme = await db.get(PartyTheme, theme_id)
    if theme is None or theme.id != party.page_custom_id or slot not in ("header", "background"):
        raise HTTPException(status_code=404, detail="Not found")
    return _picture(party.family_id, getattr(theme, f"{slot}_key"))

"""Demo families: a ready-made family with sample data in every app, in the chosen language, so
people can try Smooth Family before setting up their own. Dates are relative to today, so the
demo always looks current. Demo members sign in with one tap (no passwords are ever shown).
"""
import secrets
import uuid
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.holidays import BY_LANGUAGE
from app.models import (
    ChatMessage,
    Conversation,
    ConversationMember,
    Document,
    EmergencyCard,
    ExposedDevice,
    EventPlan,
    Family,
    FamilyEvent,
    FamilyReward,
    GuestAccess,
    ListItem,
    ListModel,
    Medication,
    Notification,
    PackingList,
    Person,
    Pet,
    PetCare,
    Recipe,
    RecipeIngredient,
    SavingsJar,
    ShopItem,
    ShopPurchase,
    SmarthomeFlow,
    Task,
    TaskCompletion,
    ThanksStar,
    Trip,
    TripCheck,
    TripPackingItem,
    User,
    WishItem,
)
from app.security import hash_password
from app.services.calendar_view import app_event_key, title_key
from app.services.schedule import upcoming_week
from app.services import ha_sim
from app.services.vault import family_fernet

LANGS = ("en", "sv", "nb", "da", "fi")

# Members: (key, name, role, colour)
MEMBERS = [
    ("anna", "Anna", "admin", "#4F7A5B"),
    ("erik", "Erik", "adult", "#3B6EA8"),
    ("maja", "Maja", "child", "#C2703D"),
    ("leo", "Leo", "child", "#8A5BB0"),
]

T = {
    "family": {"en": "The Demo family", "sv": "Familjen Demo", "nb": "Familien Demo", "da": "Familien Demo", "fi": "Demo-perhe"},
    "tasks": {
        "en": ["Empty the dishwasher", "Take out the recycling", "Tidy your room", "Feed the cat", "Water the plants"],
        "sv": ["Töm diskmaskinen", "Gå ut med återvinningen", "Städa ditt rum", "Mata katten", "Vattna blommorna"],
        "nb": ["Tøm oppvaskmaskinen", "Ta ut resirkuleringen", "Rydd rommet ditt", "Mat katten", "Vann blomstene"],
        "da": ["Tøm opvaskemaskinen", "Gå ud med genbruget", "Ryd op på dit værelse", "Giv katten mad", "Vand blomsterne"],
        "fi": ["Tyhjennä astianpesukone", "Vie kierrätys", "Siivoa huoneesi", "Ruoki kissa", "Kastele kukat"],
    },
    "list": {"en": "Groceries", "sv": "Inköpslista", "nb": "Handleliste", "da": "Indkøbsliste", "fi": "Ostoslista"},
    "items": {
        "en": ["Milk", "Bread", "Bananas", "Pasta", "Tomatoes", "Coffee"],
        "sv": ["Mjölk", "Bröd", "Bananer", "Pasta", "Tomater", "Kaffe"],
        "nb": ["Melk", "Brød", "Bananer", "Pasta", "Tomater", "Kaffe"],
        "da": ["Mælk", "Brød", "Bananer", "Pasta", "Tomater", "Kaffe"],
        "fi": ["Maito", "Leipä", "Banaanit", "Pasta", "Tomaatit", "Kahvi"],
    },
    "events": {
        "en": ["Football practice", "Parents' meeting at school", "Dinner at grandma's"],
        "sv": ["Fotbollsträning", "Föräldramöte i skolan", "Middag hos mormor"],
        "nb": ["Fotballtrening", "Foreldremøte på skolen", "Middag hos mormor"],
        "da": ["Fodboldtræning", "Forældremøde på skolen", "Middag hos mormor"],
        "fi": ["Jalkapallotreenit", "Vanhempainilta koulussa", "Päivällinen mummolla"],
    },
    "chat": {
        "en": ["Who's picking up Leo today?", "I can do it after work 👍", "Can we have tacos tonight?", "Yes! Add it to the list 🌮"],
        "sv": ["Vem hämtar Leo idag?", "Jag kan efter jobbet 👍", "Kan vi äta tacos ikväll?", "Ja! Skriv upp det på listan 🌮"],
        "nb": ["Hvem henter Leo i dag?", "Jeg kan etter jobb 👍", "Kan vi spise taco i kveld?", "Ja! Skriv det på listen 🌮"],
        "da": ["Hvem henter Leo i dag?", "Jeg kan efter arbejde 👍", "Kan vi få tacos i aften?", "Ja! Skriv det på listen 🌮"],
        "fi": ["Kuka hakee Leon tänään?", "Minä voin töiden jälkeen 👍", "Voisimmeko syödä tacoja tänä iltana?", "Joo! Lisää se listaan 🌮"],
    },
    "recipe": {
        "en": ("Pancakes", ["Whisk the flour and half of the milk.", "Add the rest of the milk and the eggs.", "Fry thin pancakes in butter."], ["plain flour", "milk", "eggs", "butter"]),
        "sv": ("Pannkakor", ["Vispa mjölet med hälften av mjölken.", "Vispa i resten av mjölken och äggen.", "Stek tunna pannkakor i smör."], ["vetemjöl", "mjölk", "ägg", "smör"]),
        "nb": ("Pannekaker", ["Visp melet med halvparten av melken.", "Visp inn resten av melken og eggene.", "Stek tynne pannekaker i smør."], ["hvetemel", "melk", "egg", "smør"]),
        "da": ("Pandekager", ["Pisk melet med halvdelen af mælken.", "Pisk resten af mælken og æggene i.", "Steg tynde pandekager i smør."], ["hvedemel", "mælk", "æg", "smør"]),
        "fi": ("Ohukaiset", ["Vatkaa jauhot ja puolet maidosta.", "Lisää loput maidosta ja munat.", "Paista ohuita lettuja voissa."], ["vehnäjauhoja", "maitoa", "kananmunaa", "voita"]),
    },
    "grandma": {"en": "Grandma", "sv": "Mormor", "nb": "Mormor", "da": "Mormor", "fi": "Mummo"},
    "wishes": {
        "en": ["LEGO castle", "Book about horses", "Football boots"],
        "sv": ["LEGO-slott", "Bok om hästar", "Fotbollsskor"],
        "nb": ["LEGO-slott", "Bok om hester", "Fotballsko"],
        "da": ["LEGO-slot", "Bog om heste", "Fodboldstøvler"],
        "fi": ["LEGO-linna", "Kirja hevosista", "Jalkapallokengät"],
    },
    "shop": {
        "en": ["Choose Friday's film", "30 min extra screen time", "Pick tonight's dessert"],
        "sv": ["Välja fredagsfilm", "30 min extra skärmtid", "Välja kvällens efterrätt"],
        "nb": ["Velge fredagsfilm", "30 min ekstra skjermtid", "Velge kveldens dessert"],
        "da": ["Vælge fredagsfilm", "30 min ekstra skærmtid", "Vælge aftenens dessert"],
        "fi": ["Valitse perjantain elokuva", "30 min lisää ruutuaikaa", "Valitse illan jälkiruoka"],
    },
    "jar": {"en": "Bike", "sv": "Cykel", "nb": "Sykkel", "da": "Cykel", "fi": "Polkupyörä"},
    "goal": {"en": "Cinema together", "sv": "Bio tillsammans", "nb": "Kino sammen", "da": "Biograf sammen", "fi": "Yhdessä elokuviin"},
    "pet": {
        "en": ("Walk Sixten", "Rabies vaccination", "Allergy tablet"),
        "sv": ("Gå ut med Sixten", "Rabiesvaccin", "Allergitablett"),
        "nb": ("Gå tur med Sixten", "Rabiesvaksine", "Allergitablett"),
        "da": ("Gå tur med Sixten", "Rabiesvaccine", "Allergitablet"),
        "fi": ("Vie Sixten lenkille", "Raivotautirokotus", "Allergiatabletti"),
    },
    "packing": {
        "en": ["Shin guards", "Water bottle", "Football boots"],
        "sv": ["Benskydd", "Vattenflaska", "Fotbollsskor"],
        "nb": ["Leggbeskyttere", "Vannflaske", "Fotballsko"],
        "da": ["Benskinner", "Vandflaske", "Fodboldstøvler"],
        "fi": ["Säärisuojat", "Vesipullo", "Jalkapallokengät"],
    },
    "emergency": {
        "en": ("Nuts (carries an antihistamine)", "Bed at 19:30 after a story. Likes the night light on.", "Gran", "Dad", "Mum", "Main Street 1"),
        "sv": ("Nötter (har antihistamin med sig)", "Läggning 19.30 efter en saga. Vill ha nattlampan tänd.", "Mormor", "Pappa", "Mamma", "Storgatan 1"),
        "nb": ("Nøtter (har med antihistamin)", "Legger seg 19.30 etter en historie. Vil ha nattlampen på.", "Mormor", "Pappa", "Mamma", "Storgata 1"),
        "da": ("Nødder (har antihistamin med)", "Sengetid 19.30 efter en historie. Vil have natlampen tændt.", "Mormor", "Far", "Mor", "Storegade 1"),
        "fi": ("Pähkinät (antihistamiini mukana)", "Nukkumaan 19.30 sadun jälkeen. Haluaa yövalon päälle.", "Mummo", "Isä", "Äiti", "Isokatu 1"),
    },
    "passport": {"en": "Passport", "sv": "Pass", "nb": "Pass", "da": "Pas", "fi": "Passi"},
    "babysitter": {"en": "Babysitter Sara", "sv": "Barnvakt Sara", "nb": "Barnevakt Sara", "da": "Babysitter Sara", "fi": "Lapsenvahti Sara"},
    "devices": {
        "en": ["Kitchen ceiling", "Living room lamp", "Hall", "Kids' room", "Coffee machine", "Living room blinds", "Thermostat", "Robot vacuum", "Movie night", "Good night", "Kitchen Sonos", "Bathroom Sonos"],
        "sv": ["Köket tak", "Vardagsrumslampa", "Hallen", "Barnrummet", "Kaffebryggare", "Persienner vardagsrum", "Termostat", "Robotdammsugare", "Filmkväll", "God natt", "Kök Sonos", "Badrum Sonos"],
        "nb": ["Kjøkkentak", "Stuelampe", "Gangen", "Barnerommet", "Kaffetrakter", "Persienner stue", "Termostat", "Robotstøvsuger", "Filmkveld", "God natt", "Kjøkken Sonos", "Bad Sonos"],
        "da": ["Køkkenloft", "Stuelampe", "Gangen", "Børneværelset", "Kaffemaskine", "Persienner stue", "Termostat", "Robotstøvsuger", "Filmaften", "Godnat", "Køkken Sonos", "Bad Sonos"],
        "fi": ["Keittiön katto", "Olohuoneen lamppu", "Eteinen", "Lastenhuone", "Kahvinkeitin", "Olohuoneen kaihtimet", "Termostaatti", "Robotti-imuri", "Leffailta", "Hyvää yötä", "Keittiö Sonos", "Kylpyhuone Sonos"],
    },
    "flows": {
        "en": ("Morning music", "Movie night", "All off when we leave", "Everyone is out – the lights are off.", "Night light"),
        "sv": ("Morgonmusik", "Filmkväll", "Allt av när vi går", "Alla har gått – lamporna är släckta.", "Nattlampa"),
        "nb": ("Morgenmusikk", "Filmkveld", "Alt av når vi går", "Alle har gått – lysene er slått av.", "Nattlampe"),
        "da": ("Morgenmusik", "Filmaften", "Alt slukket, når vi går", "Alle er gået – lyset er slukket.", "Natlampe"),
        "fi": ("Aamumusiikki", "Leffailta", "Kaikki pois, kun lähdemme", "Kaikki ovat lähteneet – valot on sammutettu.", "Yövalo"),
    },
    "trip": {
        "en": ("Ski week", "Sälen"),
        "sv": ("Sportlov i fjällen", "Sälen"),
        "nb": ("Vinterferie på fjellet", "Hafjell"),
        "da": ("Skiferie", "Sälen"),
        "fi": ("Hiihtoloma", "Levi"),
    },
    "star": {
        "en": "For walking Sixten in the rain",
        "sv": "För att du gick ut med Sixten i regnet",
        "nb": "For at du gikk tur med Sixten i regnet",
        "da": "Fordi du gik tur med Sixten i regnen",
        "fi": "Kun veit Sixtenin lenkille sateessa",
    },
    "note": {
        "en": ("Welcome to the demo!", "Look around – everything here is sample data and can be changed or removed."),
        "sv": ("Välkommen till demon!", "Titta runt – allt här är exempeldata och går att ändra eller ta bort."),
        "nb": ("Velkommen til demoen!", "Se deg rundt – alt her er eksempeldata og kan endres eller fjernes."),
        "da": ("Velkommen til demoen!", "Kig rundt – alt her er eksempeldata og kan ændres eller fjernes."),
        "fi": ("Tervetuloa demoon!", "Katsele ympärillesi – kaikki täällä on esimerkkidataa, jota voi muuttaa tai poistaa."),
    },
}


DEMO_PLACES = {
    "en": (59.33, 18.06, "Stockholm"),
    "sv": (59.33, 18.06, "Stockholm"),
    "nb": (59.91, 10.75, "Oslo"),
    "da": (55.68, 12.57, "København"),
    "fi": (60.17, 24.94, "Helsinki"),
}


def _t(key: str, lang: str):
    return T[key].get(lang, T[key]["en"])


async def create_demo_family(db: AsyncSession, language: str = "en", invitation_id: uuid.UUID | None = None) -> tuple[Family, list[User]]:
    lang = language if language in LANGS else "en"
    now = datetime.now(timezone.utc)
    today = date.today()
    # The weather card shows the capital of the demo's language (SMHI covers the Nordics).
    lat, lon, place = DEMO_PLACES.get(lang, DEMO_PLACES["en"])
    family = Family(
        name=_t("family", lang), kind="demo", invitation_id=invitation_id, passkeys_enabled=False, totp_policy="off",
        currency="€" if lang == "fi" else "kr", weather_lat=lat, weather_lon=lon, weather_place=place,
        holiday_country=BY_LANGUAGE.get(lang),
    )
    db.add(family)
    await db.flush()

    # Usernames are unique on the server, so each demo gets its own; nobody signs in with them.
    suffix = secrets.token_hex(3)
    users: dict[str, User] = {}
    for key, name, role, color in MEMBERS:
        user = User(
            family_id=family.id,
            username=f"demo-{suffix}-{key}",
            display_name=name,
            role=role,
            color=color,
            language=lang,
            password_hash=hash_password(secrets.token_urlsafe(24)),
        )
        db.add(user)
        users[key] = user
    await db.flush()
    anna, erik, maja, leo = users["anna"], users["erik"], users["maja"], users["leo"]
    for child in (maja, leo):
        child.allowance_points_per_unit = 10

    # Tasks, with two weeks of approved completions and one waiting for approval.
    titles = _t("tasks", lang)
    tasks = [
        Task(family_id=family.id, created_by=anna.id, title=titles[0], points=10, recurrence="daily", assignee_id=maja.id),
        Task(family_id=family.id, created_by=anna.id, title=titles[1], points=15, recurrence="weekly", weekdays=[today.weekday()], weekday=today.weekday(), assignee_id=leo.id),
        Task(family_id=family.id, created_by=anna.id, title=titles[2], points=20, recurrence="weekly", weekdays=[5], weekday=5),
        Task(family_id=family.id, created_by=anna.id, title=titles[3], points=5, recurrence="daily", assignee_id=leo.id),
        Task(family_id=family.id, created_by=erik.id, title=titles[4], points=10, recurrence="weekly", weekdays=[2], weekday=2),
    ]
    db.add_all(tasks)
    await db.flush()
    for days_ago in range(1, 15):
        day = today - timedelta(days=days_ago)
        db.add(TaskCompletion(family_id=family.id, task_id=tasks[0].id, user_id=maja.id, completed_date=day, points_awarded=10, status="approved", reviewed_by=anna.id, reviewed_at=now))
        if days_ago % 2 == 0:
            db.add(TaskCompletion(family_id=family.id, task_id=tasks[3].id, user_id=leo.id, completed_date=day, points_awarded=5, status="approved", reviewed_by=erik.id, reviewed_at=now))
    db.add(TaskCompletion(family_id=family.id, task_id=tasks[3].id, user_id=leo.id, completed_date=today, points_awarded=5, status="pending"))

    # Shopping list
    shopping = ListModel(family_id=family.id, name=_t("list", lang), created_by=anna.id)
    db.add(shopping)
    await db.flush()
    for i, name in enumerate(_t("items", lang)):
        db.add(ListItem(list_id=shopping.id, family_id=family.id, name=name, position=i, done=i == 5))

    # Calendar: the next few days
    events = []
    for i, (title, days, hour, who) in enumerate(zip(_t("events", lang), (1, 3, 6), (17, 18, 16), ([maja.id], [anna.id, erik.id], []))):
        start = datetime.combine(today + timedelta(days=days), time(hour), tzinfo=timezone.utc)
        events.append(FamilyEvent(family_id=family.id, created_by=anna.id, title=title, start=start, end=start + timedelta(hours=1, minutes=30), member_ids=[str(x) for x in who]))
    db.add_all(events)
    await db.flush()
    # Football: Erik drives, nobody picks up yet, and a packing list with the water bottle packed.
    practice = events[0]
    packing = _t("packing", lang)
    db.add(PackingList(family_id=family.id, title_key=title_key(practice.title), items=packing))
    db.add(EventPlan(family_id=family.id, key=app_event_key(practice.id), title=practice.title, start=practice.start, needs_ride=True, drop_off_by=erik.id, checked=[packing[1]]))

    # Family chat
    conv = Conversation(family_id=family.id, name="Family", created_by=anna.id)
    db.add(conv)
    await db.flush()
    for user in users.values():
        db.add(ConversationMember(conversation_id=conv.id, user_id=user.id, joined_at=now - timedelta(days=1)))
    for i, (text, sender) in enumerate(zip(_t("chat", lang), (anna, erik, maja, anna))):
        db.add(ChatMessage(family_id=family.id, conversation_id=conv.id, sender_id=sender.id, body=text, created_at=now - timedelta(minutes=90 - i * 20)))

    # A recipe
    name, steps, ingredients = _t("recipe", lang)
    recipe = Recipe(family_id=family.id, name=name, servings=4, steps=steps, created_by=anna.id)
    db.add(recipe)
    await db.flush()
    for (ingredient, amount, unit) in zip(ingredients, (2.5, 6, 3, None), ("dl", "dl", None, None)):
        db.add(RecipeIngredient(recipe_id=recipe.id, family_id=family.id, name=ingredient, amount=amount, unit=unit, category="other"))

    # Birthdays and wish lists
    soon = today + timedelta(days=9)
    people = [
        Person(family_id=family.id, user_id=maja.id, name="Maja", birth_month=soon.month, birth_day=soon.day, birth_year=today.year - 10, created_by=anna.id),
        Person(family_id=family.id, user_id=leo.id, name="Leo", birth_month=3, birth_day=14, birth_year=today.year - 7, created_by=anna.id),
        Person(family_id=family.id, name=_t("grandma", lang), birth_month=(today + timedelta(days=40)).month, birth_day=(today + timedelta(days=40)).day, created_by=anna.id),
    ]
    db.add_all(people)
    await db.flush()
    wishes = _t("wishes", lang)
    db.add(WishItem(family_id=family.id, person_id=people[0].id, title=wishes[0], created_by=maja.id, reserved_by=erik.id))
    db.add(WishItem(family_id=family.id, person_id=people[0].id, title=wishes[1], created_by=maja.id))
    db.add(WishItem(family_id=family.id, person_id=people[1].id, title=wishes[2], created_by=anna.id))

    # Reward shop, with a purchase waiting for approval
    items = [ShopItem(family_id=family.id, title=title, price=price, created_by=anna.id) for title, price in zip(_t("shop", lang), (50, 80, 30))]
    db.add_all(items)
    await db.flush()
    db.add(ShopPurchase(family_id=family.id, item_id=items[0].id, user_id=maja.id, title=items[0].title, price=items[0].price, status="pending"))

    # A savings jar for Maja, a family goal
    jar = SavingsJar(family_id=family.id, user_id=maja.id, name=_t("jar", lang), pct=30, target=Decimal("150"), created_by=anna.id)
    db.add(jar)
    db.add(FamilyReward(family_id=family.id, created_by=anna.id, title=_t("goal", lang), points_required=500, starts_at=now - timedelta(days=14)))
    await db.flush()
    # The jar is filled from Maja's earnings the first time the jars are looked at.

    # A dog: a walk the children take turns on, a vaccination coming up, and Leo's allergy tablet.
    walk, vaccine, tablet = _t("pet", lang)
    dog = Pet(family_id=family.id, name="Sixten", species="dog", birth_date=today.replace(year=today.year - 4) - timedelta(days=20), created_by=anna.id)
    db.add(dog)
    await db.flush()
    db.add(Person(family_id=family.id, pet_id=dog.id, name="Sixten", birth_month=dog.birth_date.month, birth_day=dog.birth_date.day, birth_year=dog.birth_date.year, created_by=anna.id))
    db.add(PetCare(family_id=family.id, pet_id=dog.id, kind="vaccination", title=vaccine, date=today - timedelta(days=355), next_due=today + timedelta(days=10), created_by=anna.id))
    db.add(Task(family_id=family.id, created_by=anna.id, title=walk, points=10, recurrence="daily", pet_id=dog.id, rotation_user_ids=[str(maja.id), str(leo.id)], rotation_mode="done", assignee_id=maja.id))
    db.add(Medication(family_id=family.id, user_id=leo.id, name=tablet, dose="1", times=["07:30"], start_date=today - timedelta(days=30), created_by=anna.id))

    # Emergency cards, Maja's passport running out and a babysitter's link for tonight.
    allergy, routine, gran, dad, mum, street = _t("emergency", lang)
    contacts = [{"name": "Anna", "phone": "070-000 00 01", "relation": mum}, {"name": "Erik", "phone": "070-000 00 02", "relation": dad}]
    db.add(EmergencyCard(family_id=family.id, user_id=None, address=street, contacts=contacts, updated_by=anna.id))
    db.add(EmergencyCard(family_id=family.id, user_id=leo.id, allergies=allergy, routines=routine, contacts=[*contacts, {"name": gran, "phone": "070-000 00 03", "relation": gran}], updated_by=anna.id))
    fernet = await family_fernet(db, family)
    db.add(
        Document(
            family_id=family.id, user_id=maja.id, kind="passport", title=_t("passport", lang), created_by=anna.id,
            number_encrypted=fernet.encrypt(b"AA0012345").decode(), number_last4="2345",
            issued_date=today - timedelta(days=5 * 365 - 50), expiry_date=today + timedelta(days=50), remind_days=90, reminded_for=today + timedelta(days=50),
        )
    )
    db.add(
        GuestAccess(
            family_id=family.id, name=_t("babysitter", lang), token_hash=secrets.token_hex(32), list_ids=[str(shopping.id)],
            expires_at=now + timedelta(hours=6), created_by=anna.id,
        )
    )

    # A simulated smart home: devices, who is home, and a few flows to try.
    names = dict(zip([entity for entity, _ in ha_sim.DEMO_DEVICES], _t("devices", lang)))
    await ha_sim.set_up(db, family.id, names)
    base = ha_sim.address(family.id)
    for user, share in ((anna, "home"), (erik, "travel"), (maja, "home"), (leo, "home")):
        user.ha_person_entity = f"person.{user.username.rsplit('-', 1)[1]}"
        user.ha_travel_entity = f"sensor.home_{user.username.rsplit('-', 1)[1]}_direction_of_travel"
        user.presence_share = share
    ha_sim.move_person(base, "person.erik", "not_home", "towards", announce=False)
    devices = {d.entity_id: d.id for d in (await db.execute(select(ExposedDevice).where(ExposedDevice.family_id == family.id))).scalars()}
    music, movie, all_off, all_off_text, night_light = _t("flows", lang)
    lights_off = [{"type": "device", "device_id": str(devices[e]), "action": "turn_off", "value": None} for e in ("light.kitchen", "light.living_room", "light.hall", "light.kids_room")]
    db.add_all([
        SmarthomeFlow(
            family_id=family.id, owner_id=anna.id, name=music,
            trigger={"type": "time", "at": "07:00", "days": [0, 1, 2, 3, 4]},
            conditions=[{"type": "home", "who": "somebody"}],
            actions=[{"type": "media", "device_ids": [str(devices["media_player.kitchen_sonos"]), str(devices["media_player.bathroom_sonos"])], "media_content_id": "FV:2/1", "media_content_type": "favorite_item_id", "title": "Morning", "volume": 20}],
        ),
        SmarthomeFlow(
            family_id=family.id, owner_id=erik.id, name=movie, shared=True, on_today=True, trigger={"type": "button"},
            actions=[{"type": "device", "device_id": str(devices["scene.movie_night"]), "action": "activate", "value": None}],
        ),
        SmarthomeFlow(
            family_id=family.id, owner_id=anna.id, name=all_off, shared=True, trigger={"type": "presence", "event": "last_leaves", "user_id": None},
            actions=[*lights_off, {"type": "notify", "to": "family", "text": all_off_text}],
        ),
        SmarthomeFlow(
            family_id=family.id, owner_id=leo.id, name=night_light, approved=False, on_today=True, trigger={"type": "button"},
            actions=[{"type": "device", "device_id": str(devices["light.kids_room"]), "action": "brightness", "value": 10}],
        ),
    ])

    # A ski trip in three weeks, with the children's packing started.
    from app.routers.trips import CHECKLIST, TEMPLATES

    trip_name, place = _t("trip", lang)
    trip = Trip(family_id=family.id, name=trip_name, destination=place, start_date=today + timedelta(days=21), end_date=today + timedelta(days=27), member_ids=[], budget=Decimal("25000"), created_by=anna.id)
    db.add(trip)
    await db.flush()
    for i, text in enumerate(CHECKLIST[lang]):
        db.add(TripCheck(family_id=family.id, trip_id=trip.id, text=text, position=i))
    for child in (maja, leo):
        for j, text in enumerate(TEMPLATES["ski"][lang]):
            db.add(TripPackingItem(family_id=family.id, trip_id=trip.id, user_id=child.id, text=text, done=child is maja and j < 3))

    # A thank-you star at this week's Söndagskollen.
    db.add(ThanksStar(family_id=family.id, week_start=upcoming_week(today), from_user=anna.id, to_user=maja.id, message=_t("star", lang)))

    # The family's devices (3.1.0): a phone, a computer, a tablet on an older app and one not used lately.
    from app.config import get_settings
    from app.models import ClientDevice

    current = get_settings().app_version or "3.1.0"
    for user, kind, browser, system, version, days in (
        (anna, "mobile", "Safari", "iOS", current, 0), (erik, "computer", "Firefox", "Windows", current, 0),
        (maja, "tablet", "Chrome", "Android", "3.0.4", 0), (leo, "tablet", "Safari", "iPadOS", current, 3),
    ):
        seen = now - timedelta(days=days, minutes=5)
        db.add(ClientDevice(family_id=family.id, user_id=user.id, device_key=secrets.token_urlsafe(24), kind=kind, browser=browser, os=system, app_version=version, first_seen=seen, last_seen=seen))

    title, body = _t("note", lang)
    for user in (anna, erik):
        db.add(Notification(family_id=family.id, user_id=user.id, kind="demo", title=title, body=body, route="/"))
    await db.commit()
    return family, list(users.values())

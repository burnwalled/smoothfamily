"""Database models. UUID primary keys, all rows scoped to a family (tenant)."""
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import JSON, BigInteger, Boolean, Date, DateTime, Float, ForeignKey, Integer, LargeBinary, Numeric, String, Text, Uuid, UniqueConstraint
from sqlalchemy import false, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.apps import allowed_apps
from app.database import Base


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Family(Base):
    __tablename__ = "families"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120))
    currency: Mapped[str] = mapped_column(String(8), default="kr")
    shopping_task_points: Mapped[int] = mapped_column(Integer, default=25)
    # Children's completed tasks wait for an adult's approval (on by default).
    child_approval: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    # What the meal plan covers besides dinners (3.2.0): lunchboxes per weekday (0 = none), made
    # from the dinner the evening before, and lunch on Saturday and Sunday.
    meal_lunchboxes: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    meal_weekend_lunch: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # How much the family may keep on the server, set by the server admin (2.8.2); None = no ceiling.
    storage_quota_mb: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Sign-in policy chosen at setup: passkeys on/off, authenticator codes off|optional|required.
    passkeys_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    totp_policy: Mapped[str] = mapped_column(String(10), default="optional", server_default="optional")
    # The waste collection calendar (iCal) from the municipality or waste company.
    waste_ical_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    # Where the weather card's forecast is for (SMHI); only these coordinates are sent.
    weather_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    weather_lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    weather_place: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Söndagskollen: remind the family on Sunday afternoon.
    week_review_reminder: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    # The family's own key for documents (numbers and files), itself encrypted with the server key.
    # It travels inside the passphrase-protected move file, so a move to another server keeps it.
    vault_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The electricity price area (SE1–SE4) for the price card and cheap-hour flows.
    electricity_area: Mapped[str | None] = mapped_column(String(3), nullable=True)
    # Local AI: None = the default (on for the family running the server, off for others), else the
    # family admin's choice. A hosted family also needs the server admin to allow it.
    ai_enabled: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # Look up unknown barcodes in Open Food Facts (only the barcode is sent). Off by default.
    barcode_lookup: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # The family's own backup key (2.9.0, public half, base64): its backups only it can open.
    backup_public_key: Mapped[str | None] = mapped_column(String(60), nullable=True)
    # The family admin's setup guide was finished or skipped (2.9.0).
    guide_done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # owner: the family running the server | hosted: invited by the server admin | demo: sample data
    kind: Mapped[str] = mapped_column(String(10), default="owner", server_default="owner")
    # active | suspended (members can't sign in)
    status: Mapped[str] = mapped_column(String(10), default="active", server_default="active")
    # The invitation a hosted or demo family came from.
    invitation_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("invitations.id", ondelete="SET NULL", use_alter=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    members: Mapped[list["User"]] = relationship(back_populates="family")


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    username: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="adult")  # admin | adult | child
    color: Mapped[str] = mapped_column(String(20), default="#4F7A5B")
    # Per-user preferences: display language (en|sv|nb|da|fi) and UI theme.
    language: Mapped[str] = mapped_column(String(5), default="en")
    theme: Mapped[str] = mapped_column(String(20), default="forest")
    notification_prefs: Mapped[dict] = mapped_column(
        JSON,
        default=lambda: {
            "chat": True,
            "approvals": True,
            "calendar_mine": True,
            "calendar_family": False,
        },
    )
    avatar_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Own menu: section keys in the chosen order (missing ones follow in default order) and hidden ones.
    nav_order: Mapped[list] = mapped_column(JSON, default=list)
    nav_hidden: Mapped[list] = mapped_column(JSON, default=list)
    # Whether the menu is grouped (Family, Points, Home) on phones and on computers.
    nav_group_mobile: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    nav_group_desktop: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    # The little ones' mode (#easy): big pictures, routines and stickers instead of the app.
    easy_mode: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # An adult the admin lets change the family's settings (2.8.0): everyday, children, sharing.
    can_manage_family: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # Smart home devices on this user's Today card (device ids); None = all they may control.
    smarthome_favorites: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # Apps (menu sections) the family admin lets this member use; None = the role's default.
    app_access: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # Manages the server: families, invitations, backups (never sees other families' content).
    is_server_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    allowance_rate: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)  # older: money per point
    # How many points make one unit of money (e.g. 10 points = 1 kr); takes precedence over allowance_rate.
    allowance_points_per_unit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # How the allowance is earned: "points" (points per unit) or "goal" (a fixed amount for every
    # week/month in which at least allowance_min_points were approved). The current setup applies
    # to periods starting on/after allowance_min_points_since; earlier periods keep the points rate.
    allowance_mode: Mapped[str] = mapped_column(String(10), default="points", server_default="points")
    allowance_period: Mapped[str] = mapped_column(String(10), default="week", server_default="week")
    allowance_min_points: Mapped[int | None] = mapped_column(Integer, nullable=True)
    allowance_amount: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    # The child's school on skolmaten.se (the name in its address), for the school lunch card.
    school: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # The morning summary push: on/off, local time ("07:00") and on which days (weekdays|all).
    morning_summary: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    morning_time: Mapped[str] = mapped_column(String(5), default="07:00", server_default="07:00")
    morning_days: Mapped[str] = mapped_column(String(10), default="weekdays", server_default="weekdays")
    # Presence via Home Assistant: the admin links a person.* entity (and optionally a Proximity
    # "direction of travel" sensor); the member chooses what to share: off | home | travel.
    ha_person_entity: Mapped[str | None] = mapped_column(String(200), nullable=True)
    ha_travel_entity: Mapped[str | None] = mapped_column(String(200), nullable=True)
    presence_share: Mapped[str] = mapped_column(String(10), default="off", server_default="off")

    @property
    def apps(self) -> list[str]:
        """The apps this member may use (see app/apps.py)."""
        return allowed_apps(self.role, self.app_access)
    allowance_min_points_since: Mapped[date | None] = mapped_column(Date, nullable=True)
    ical_token: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True, unique=True)
    # Authenticator app (TOTP): active secret, secret awaiting confirmation, and the
    # last accepted 30 s step (a code can't be used twice). Secrets are Fernet-encrypted.
    totp_secret_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    totp_pending_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    totp_last_step: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    family: Mapped[Family] = relationship(back_populates="members")


class CalendarFeed(Base):
    __tablename__ = "calendar_feeds"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(120))
    url: Mapped[str] = mapped_column(Text)
    color: Mapped[str] = mapped_column(String(20), default="#4F7A5B")
    visible_to: Mapped[list] = mapped_column(JSON, default=list)
    details_for: Mapped[list] = mapped_column(JSON, default=list)
    # A member's own calendar (their Google/iCloud …): its events are theirs in the app (2.8.4).
    member_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class FamilyEvent(Base):
    """An event created in the app, shown to the whole family next to the iCal feeds."""
    __tablename__ = "family_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(200))
    # All-day events are stored as midnight UTC with an exclusive end (like iCal DTEND).
    start: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    all_day: Mapped[bool] = mapped_column(Boolean, default=False)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    color: Mapped[str] = mapped_column(String(20), default="#C2703D")
    # Members the event concerns (user ids as strings); empty = the whole family.
    member_ids: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    points: Mapped[int] = mapped_column(Integer, default=10)
    # none = one-off task (due_date), daily, weekly (weekdays 0=Mon, every interval_weeks weeks
    # counted from anchor_date), monthly (day_of_month), yearly (month + day_of_month).
    recurrence: Mapped[str] = mapped_column(String(20), default="none")
    weekday: Mapped[int | None] = mapped_column(Integer, nullable=True)  # first of weekdays (older clients)
    weekdays: Mapped[list] = mapped_column(JSON, default=list)
    interval_weeks: Mapped[int] = mapped_column(Integer, default=1)
    anchor_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    day_of_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    property_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("properties.id"), nullable=True)
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("property_projects.id"), nullable=True)
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("vehicles.id"), nullable=True)
    requires_approval: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Taking turns: the members in order; assignee_id is kept on whose turn it is. Mode "done":
    # the next one when it has been done; "weekly": the next one every week.
    rotation_user_ids: Mapped[list] = mapped_column(JSON, default=list)
    rotation_mode: Mapped[str] = mapped_column(String(10), default="done", server_default="done")
    # A picture (emoji) shown to the little ones instead of reading the title.
    picture: Mapped[str | None] = mapped_column(String(16), nullable=True)
    rotation_index: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    pet_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("pets.id", ondelete="SET NULL", use_alter=True), nullable=True)
    # 2.9.0: a medicine's dose (one task per time of day, made from the medicine), the last day a
    # task is due (a course of medicine), and packing before a trip or a calendar event.
    medication_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("medications.id", ondelete="SET NULL", use_alter=True), nullable=True, index=True)
    dose_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    until_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    trip_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("trips.id", ondelete="SET NULL", use_alter=True), nullable=True, index=True)
    event_key: Mapped[str | None] = mapped_column(String(400), nullable=True)
    # Several can do it together (3.0.3): the points are shared between those who did it.
    shared: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    completions: Mapped[list["TaskCompletion"]] = relationship(back_populates="task")


class TaskSuggestion(Base):
    """A task a family member (usually a child) proposes; an adult turns it into a real task or declines."""
    __tablename__ = "task_suggestions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(10), default="pending")  # pending | approved | rejected
    task_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class FamilyReward(Base):
    """A family goal: when everyone's approved points (since starts_at) reach points_required, it unlocks."""
    __tablename__ = "family_rewards"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    points_required: Mapped[int] = mapped_column(Integer)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    unlocked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    redeemed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class TaskCompletion(Base):
    __tablename__ = "task_completions"
    # One per person and day (3.0.3: a task done together has one for each who did it).
    __table_args__ = (UniqueConstraint("task_id", "completed_date", "user_id", name="uq_completion_task_date_user"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    completed_date: Mapped[date] = mapped_column(Date, index=True)
    points_awarded: Mapped[int] = mapped_column(Integer)
    # This one's share of a task done together (3.0.3) – given when an adult approves; None = all.
    share: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(10), default="approved")  # pending | approved | rejected
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    task: Mapped[Task] = relationship(back_populates="completions")


class AllowancePayout(Base):
    __tablename__ = "allowance_payouts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    amount: Mapped[float] = mapped_column(Numeric(10, 2))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The savings jar it was taken from; None = Spend (or before the jars existed).
    jar_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("savings_jars.id", ondelete="SET NULL"), nullable=True)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class HomeProfile(Base):
    __tablename__ = "home_profiles"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), unique=True, index=True)
    dwelling_type: Mapped[str] = mapped_column(String(20), default="apartment")  # apartment | rowhouse | villa | farm
    has_garden: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(40))  # kitchen | bathroom | toilet | bedroom | living_room | hallway | laundry_room | garage | garden | other
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class MealPlan(Base):
    __tablename__ = "meal_plans"
    __table_args__ = (UniqueConstraint("family_id", "week_start", name="uq_mealplan_family_week"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    week_start: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    meals: Mapped[list["Meal"]] = relationship(
        back_populates="plan", cascade="all, delete-orphan", order_by="Meal.weekday"
    )


class Meal(Base):
    __tablename__ = "meals"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    meal_plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("meal_plans.id"), index=True)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    weekday: Mapped[int] = mapped_column(Integer)  # 0 = Monday
    # dinner | lunchbox (taken along, the leftovers of the evening before) | lunch (3.2.0)
    slot: Mapped[str] = mapped_column(String(10), default="dinner", server_default="dinner")
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    servings: Mapped[int] = mapped_column(Integer, default=4)
    steps: Mapped[list] = mapped_column(JSON, default=list)

    plan: Mapped[MealPlan] = relationship(back_populates="meals")
    ingredients: Mapped[list["MealIngredient"]] = relationship(
        back_populates="meal", cascade="all, delete-orphan"
    )


class MealIngredient(Base):
    __tablename__ = "meal_ingredients"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    meal_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("meals.id"), index=True)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    category: Mapped[str | None] = mapped_column(String(20), nullable=True)

    meal: Mapped[Meal] = relationship(back_populates="ingredients")


class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    servings: Mapped[int] = mapped_column(Integer, default=4)
    photo_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    steps: Mapped[list] = mapped_column(JSON, default=list)
    # The recipe book (2.8.4): where it came from, its kind, and the family's favourites.
    source_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    category: Mapped[str] = mapped_column(String(20), default="", server_default="")
    favorite: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class RecipeRating(Base):
    """One member's stars for a recipe (2.8.4)."""

    __tablename__ = "recipe_ratings"
    __table_args__ = (UniqueConstraint("recipe_id", "user_id", name="uq_recipe_rating"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    recipe_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    stars: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    recipe_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"), index=True)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    category: Mapped[str | None] = mapped_column(String(20), nullable=True)


class ListModel(Base):
    __tablename__ = "lists"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    allowed_user_ids: Mapped[list] = mapped_column(JSON, default=list)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    linked_task_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ListItem(Base):
    __tablename__ = "list_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    list_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lists.id", ondelete="CASCADE"), index=True)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    category: Mapped[str | None] = mapped_column(String(20), nullable=True)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    position: Mapped[int] = mapped_column(Integer, default=0)
    # Linked to a Home Assistant to-do list (2.8.4): the item's uid there ("-" = removed there), and
    # bought (ticked off there) but not yet answered for the pantry.
    ha_uid: Mapped[str | None] = mapped_column(String(100), nullable=True)
    pantry_pending: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ListHaLink(Base):
    """A list kept in step with one of Home Assistant's to-do lists (2.8.4)."""

    __tablename__ = "list_ha_links"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    list_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lists.id", ondelete="CASCADE"), unique=True)
    connection_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("smarthome_connections.id", ondelete="CASCADE"))
    entity_id: Mapped[str] = mapped_column(String(200))
    last_sync: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    name: Mapped[str] = mapped_column(String(80), default="")
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    members: Mapped[list["ConversationMember"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )
    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )


class ConversationMember(Base):
    __tablename__ = "conversation_members"
    __table_args__ = (UniqueConstraint("conversation_id", "user_id", name="uq_conv_member"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    conversation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    conversation: Mapped[Conversation] = relationship(back_populates="members")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("conversations.id"), nullable=True)
    sender_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    media_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("media_items.id"), nullable=True)
    gif_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    conversation: Mapped["Conversation | None"] = relationship(back_populates="messages")


class FeedbackReport(Base):
    """A bug report or wish sent from the app to the server admin (3.1.0; before, a GitHub issue).
    `issue_number` is the case number; `issue_url` only on the reports made as GitHub issues."""
    __tablename__ = "feedback_reports"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(10))  # bug | idea
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    has_screenshot: Mapped[bool] = mapped_column(Boolean, default=False)
    issue_number: Mapped[int] = mapped_column(Integer)
    issue_url: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    # new | planned | done | declined – set by the server admin, who may add a note to the reporter.
    status: Mapped[str] = mapped_column(String(12), default="new", server_default="new")
    screenshot_key: Mapped[str | None] = mapped_column(String(300), nullable=True)
    page: Mapped[str | None] = mapped_column(String(300), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(400), nullable=True)
    viewport: Mapped[str | None] = mapped_column(String(40), nullable=True)
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # When the server admin took it to the project's public repository.
    exported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    value: Mapped[str] = mapped_column(Text)


class Notification(Base):
    """The in-app notification centre: everything that is also (or instead) sent as push."""

    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    route: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"
    __table_args__ = (UniqueConstraint("endpoint", name="uq_push_subscriptions_endpoint"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    endpoint: Mapped[str] = mapped_column(Text)
    p256dh: Mapped[str] = mapped_column(String(500))
    auth: Mapped[str] = mapped_column(String(500))
    user_agent: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class UserAchievement(Base):
    __tablename__ = "user_achievements"
    __table_args__ = (UniqueConstraint("user_id", "achievement_id", name="uq_user_achievement"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    achievement_id: Mapped[str] = mapped_column(String(60))
    unlocked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class DashboardWidget(Base):
    """A widget instance on a user's personal dashboard.

    `type` identifies the widget component (e.g. "sl_departures"), `config`
    holds widget-specific settings as JSON (e.g. SL site id), and `position`
    determines ordering on the dashboard.
    """

    __tablename__ = "dashboard_widgets"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    type: Mapped[str] = mapped_column(String(40))
    position: Mapped[int] = mapped_column(Integer, default=0)
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Album(Base):
    __tablename__ = "albums"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(20), default="user", server_default="user")  # user | chat | receipts
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    items: Mapped[list["MediaItem"]] = relationship(back_populates="album", cascade="all, delete-orphan")


class MediaItem(Base):
    __tablename__ = "media_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    album_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("albums.id", ondelete="CASCADE"), index=True)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(String(10))  # image | video
    original_name: Mapped[str] = mapped_column(String(500))
    storage_key: Mapped[str] = mapped_column(String(500))
    content_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # When it was taken (EXIF), else when it was uploaded – for "on this day" memories.
    taken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    album: Mapped[Album] = relationship(back_populates="items")


class SmarthomeConnection(Base):
    """A Home Assistant: the family's main one (reached directly), or – since 2.8.4 – one in another
    home reached through the Smooth Family gateway (base_url gateway://<id>, no token here)."""

    __tablename__ = "smarthome_connections"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    provider: Mapped[str] = mapped_column(String(30))  # home_assistant
    base_url: Mapped[str] = mapped_column(String(500))
    token_encrypted: Mapped[str] = mapped_column(Text)
    # Which of the family's homes it is (Home → homes).
    property_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("properties.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(120), default="", server_default="")
    # The gateway's key and its one-time pairing code: hashes only.
    gateway_key_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    gateway_code_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    gateway_code_expires: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    gateway_last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    gateway_version: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # Where the gateway runs (3.1.0, told by gateway 1.3.0): "addon" (the Home Assistant app) or "docker".
    gateway_runs_in: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # The newer gateway version the family's admins were told about (3.0.1), once per version.
    gateway_update_told: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    devices: Mapped[list["ExposedDevice"]] = relationship(back_populates="connection", cascade="all, delete-orphan")


class ExposedDevice(Base):
    __tablename__ = "exposed_devices"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    connection_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("smarthome_connections.id", ondelete="CASCADE"))
    entity_id: Mapped[str] = mapped_column(String(200))
    display_name: Mapped[str] = mapped_column(String(200))
    domain: Mapped[str] = mapped_column(String(40))  # light, switch, cover
    position: Mapped[int] = mapped_column(Integer, default=0)
    allowed_user_ids: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    connection: Mapped[SmarthomeConnection] = relationship(back_populates="devices")


class Property(Base):
    __tablename__ = "properties"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    # What it is for the family: primary | secondary | cabin | rental | other
    kind: Mapped[str] = mapped_column(String(20), default="primary")
    # What kind of home (for the usual maintenance): villa | rowhouse | apartment | cabin | farm | other
    dwelling: Mapped[str] = mapped_column(String(12), default="villa", server_default="villa")
    address: Mapped[str | None] = mapped_column(String(300), nullable=True)
    built_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    area_m2: Mapped[float | None] = mapped_column(Float, nullable=True)
    purchase_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    purchase_price: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class PropertyReminder(Base):
    """Maintenance that comes back – sweeping the chimney, the gutters, the filters, the smoke
    alarm – told in advance, in the calendar, and (if chosen) a task for someone in the family."""

    __tablename__ = "property_reminders"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    property_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("properties.id", ondelete="CASCADE"), index=True)
    # maintenance | safety | inspection | season | insurance | warranty | other
    kind: Mapped[str] = mapped_column(String(12), default="maintenance")
    title: Mapped[str] = mapped_column(String(120))
    due_date: Mapped[date] = mapped_column(Date, index=True)
    repeat_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    remind_days: Mapped[int] = mapped_column(Integer, default=14)
    reminded_for: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_done: Mapped[date | None] = mapped_column(Date, nullable=True)
    # A thing in the home it is about (the heat pump's service, a warranty).
    item_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("property_items.id", ondelete="SET NULL"), nullable=True)
    # Becomes a task for this member when it is time; the task done = the maintenance done.
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    task_points: Mapped[int] = mapped_column(Integer, default=10)
    task_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class PropertyItem(Base):
    """A thing in the home: the fridge, the heat pump, the TV … with its warranty and manual."""

    __tablename__ = "property_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    property_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("properties.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    room: Mapped[str] = mapped_column(String(60), default="")
    brand: Mapped[str] = mapped_column(String(80), default="")
    model: Mapped[str] = mapped_column(String(120), default="")
    serial: Mapped[str] = mapped_column(String(80), default="")
    bought: Mapped[date | None] = mapped_column(Date, nullable=True)
    price: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    warranty_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    manual_url: Mapped[str] = mapped_column(String(500), default="")
    receipt_media_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("media_items.id", ondelete="SET NULL"), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class PropertyMeter(Base):
    """A meter for electricity, water, heating or gas – typed in, or read from a Home Assistant
    sensor (read only). Readings are the meter's total; use per month is the difference."""

    __tablename__ = "property_meters"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    property_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("properties.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    unit: Mapped[str] = mapped_column(String(10))
    ha_entity: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class PropertyProject(Base):
    __tablename__ = "property_projects"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    property_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("properties.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="planned")
    budget: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    started_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    finished_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class PropertyExpense(Base):
    __tablename__ = "property_expenses"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    property_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("properties.id"), index=True)
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("property_projects.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(200))
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    expense_date: Mapped[date] = mapped_column(Date)
    category: Mapped[str] = mapped_column(String(20), default="other")
    receipt_media_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("media_items.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class UtilityReading(Base):
    __tablename__ = "utility_readings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    property_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("properties.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    reading_date: Mapped[date] = mapped_column(Date)
    value: Mapped[float] = mapped_column(Numeric(14, 3))
    unit: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class PropertyRecurringCost(Base):
    __tablename__ = "property_recurring_costs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    property_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("properties.id"), index=True)
    kind: Mapped[str] = mapped_column(String(30))
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    period: Mapped[str] = mapped_column(String(20))
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class MediaLink(Base):
    __tablename__ = "media_links"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    media_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("media_items.id"), index=True)
    target_type: Mapped[str] = mapped_column(String(20))
    target_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    # car | motorcycle | moped | bicycle | ebike | boat | jetski | snowmobile | atv | tractor | mower |
    # robot_mower | caravan | trailer | robot | other
    kind: Mapped[str] = mapped_column(String(12), default="car", server_default="car")
    # What the meter counts: km, engine hours, or nothing (a bike without a computer, a trailer).
    meter: Mapped[str] = mapped_column(String(6), default="km", server_default="km")
    # Not every vehicle has one (a bike, a mower).
    registration: Mapped[str] = mapped_column(String(40), default="", server_default="")
    make: Mapped[str | None] = mapped_column(String(80), nullable=True)
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mileage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # petrol | diesel | electric | hybrid | plugin | gas | other – litres or kWh for consumption.
    fuel: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # What it cost, for the cost of owning it.
    purchase_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    purchase_price: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    # Charging at home: the spot price of the family's area plus `charge_extra` per kWh (grid fee,
    # energy tax), or a fixed price per kWh.
    charge_price_mode: Mapped[str] = mapped_column(String(6), default="spot", server_default="spot")
    charge_fixed_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    charge_extra: Mapped[float | None] = mapped_column(Float, nullable=True)
    # A Home Assistant sensor with the odometer or engine hours (read only), e.g. from the car's own
    # integration – the readings then come by themselves.
    ha_meter_entity: Mapped[str | None] = mapped_column(String(200), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Members who may see the vehicle (user ids); empty = everyone with the Vehicles app.
    allowed_user_ids: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class VehicleExpense(Base):
    __tablename__ = "vehicle_expenses"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("vehicles.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    expense_date: Mapped[date] = mapped_column(Date)
    category: Mapped[str] = mapped_column(String(20), default="other")
    mileage_at: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Fuel or charging: how much (litres or kWh), for the consumption.
    volume: Mapped[float | None] = mapped_column(Float, nullable=True)
    volume_unit: Mapped[str | None] = mapped_column(String(5), nullable=True)
    # Charging: home | public
    charge_place: Mapped[str | None] = mapped_column(String(6), nullable=True)
    receipt_media_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("media_items.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class VehicleReminder(Base):
    """Inspection, service, tyres, insurance, tax …: due on a date and/or at a mileage, told in
    advance; marking it done sets the next one when it repeats."""

    __tablename__ = "vehicle_reminders"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("vehicles.id", ondelete="CASCADE"), index=True)
    # inspection | service | tyres | insurance | tax | other
    kind: Mapped[str] = mapped_column(String(12))
    title: Mapped[str] = mapped_column(String(120), default="")
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    due_mileage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    repeat_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    repeat_km: Mapped[int | None] = mapped_column(Integer, nullable=True)
    remind_days: Mapped[int] = mapped_column(Integer, default=14)
    # What has been told already (a new due date or mileage is told again).
    reminded_for: Mapped[date | None] = mapped_column(Date, nullable=True)
    reminded_km: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_done: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class VehicleTyre(Base):
    """A set of tyres (or wheels): which season, whether it is on, where the other one is kept."""

    __tablename__ = "vehicle_tyres"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("vehicles.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    # summer | winter | studded | allyear
    season: Mapped[str] = mapped_column(String(8), default="summer")
    size: Mapped[str] = mapped_column(String(40), default="")
    bought: Mapped[date | None] = mapped_column(Date, nullable=True)
    tread_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    mounted: Mapped[bool] = mapped_column(Boolean, default=False)
    mounted_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Where it is when not on: the garage, a tyre hotel …
    storage: Mapped[str] = mapped_column(String(120), default="")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class VehicleMileage(Base):
    """The odometer over time (km): typed in, or from a fuel or service receipt."""

    __tablename__ = "vehicle_mileage"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    vehicle_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("vehicles.id", ondelete="CASCADE"), index=True)
    reading_date: Mapped[date] = mapped_column(Date)
    mileage: Mapped[int] = mapped_column(Integer)
    expense_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("vehicle_expenses.id", ondelete="CASCADE"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class WebAuthnCredential(Base):
    """A passkey registered by a user."""

    __tablename__ = "webauthn_credentials"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    credential_id: Mapped[bytes] = mapped_column(LargeBinary, unique=True)
    public_key: Mapped[bytes] = mapped_column(LargeBinary)
    sign_count: Mapped[int] = mapped_column(BigInteger, default=0)
    transports: Mapped[list | None] = mapped_column(JSON, nullable=True)
    name: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Person(Base):
    """Someone whose birthday the family keeps: a family member (user_id) or anyone else."""

    __tablename__ = "people"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # A pet's birthday (kept in step with the pet).
    pet_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("pets.id", ondelete="CASCADE"), nullable=True)
    name: Mapped[str] = mapped_column(String(120))
    birth_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    birth_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    birth_year: Mapped[int | None] = mapped_column(Integer, nullable=True)  # optional: shows the age
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class WishItem(Base):
    """A wish on someone's list, or (kind "idea") a gift idea only adults see.

    Reservations ("I'm buying this") are hidden from the person the wish is for."""

    __tablename__ = "wish_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    person_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("people.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(10), default="wish")  # wish | idea
    title: Mapped[str] = mapped_column(String(200))
    url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reserved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # Reserved through a share link by someone outside the app (a name and a secret to undo it).
    reserved_by_guest: Mapped[str | None] = mapped_column(String(80), nullable=True)
    guest_key_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class WishShare(Base):
    """A link that shows one person's wish list to relatives outside the app (only a hash of the
    token is kept). They can reserve wishes; gift ideas are never shown."""

    __tablename__ = "wish_shares"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    person_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("people.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ShopItem(Base):
    """A reward a member can buy with their own points, e.g. "Choose Friday's film" for 50 p."""

    __tablename__ = "shop_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[int] = mapped_column(Integer)
    # At most limit_count purchases per member and limit_period (week | month); None = no limit.
    limit_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    limit_period: Mapped[str | None] = mapped_column(String(10), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Receipt(Base):
    """A receipt kept in the vault (2.8.4): what it was for (a home, a vehicle, a category), and its
    warranty and last day to return it. The photo lives in the family's receipts album."""

    __tablename__ = "receipts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    media_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("media_items.id", ondelete="SET NULL"), nullable=True)
    store: Mapped[str] = mapped_column(String(120), default="")
    amount: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="")
    purchased_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    # food | home | vehicle | clothes | children | health | leisure | electronics | gifts | travel | other
    category: Mapped[str] = mapped_column(String(20), default="other")
    property_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("properties.id", ondelete="SET NULL"), nullable=True)
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The receipt's own lines, read by the local AI: searchable.
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    warranty_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    return_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reminded_return: Mapped[date | None] = mapped_column(Date, nullable=True)
    reminded_warranty: Mapped[date | None] = mapped_column(Date, nullable=True)
    # A child's things shared with the other home (2.8.4): whose, and the other home's share in %.
    child_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    split_pct: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class EconomyEntry(Base):
    """An amount in the household's economy (2.8.5) that lives nowhere else: an income, a cost
    without a home or vehicle (a subscription), or a bank row put under a category. Private ones
    are only seen by their maker."""

    __tablename__ = "economy_entries"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    kind: Mapped[str] = mapped_column(String(3), default="out")  # out | in
    # food, housing … salary …, or home:<id> / vehicle:<id>
    category: Mapped[str] = mapped_column(String(60))
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    day: Mapped[date] = mapped_column(Date)
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    recurring: Mapped[str | None] = mapped_column(String(10), nullable=True)  # monthly | quarterly | yearly
    private: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    source: Mapped[str] = mapped_column(String(10), default="manual", server_default="manual")  # manual | bank
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class EconomyBudget(Base):
    """The family's budget for a category, per month (2.8.5)."""

    __tablename__ = "economy_budgets"
    __table_args__ = (UniqueConstraint("family_id", "category", name="uq_economy_budget"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    category: Mapped[str] = mapped_column(String(60))
    monthly: Mapped[float] = mapped_column(Numeric(12, 2))


class ShopPurchase(Base):
    """A member's purchase; pending until an adult approves (points are held meanwhile)."""

    __tablename__ = "shop_purchases"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("shop_items.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120))  # as bought, if the item changes later
    price: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(10), default="pending")  # pending | approved | rejected
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class SavingsJar(Base):
    """A jar a parent sets up for a child ("Skateboard", "Give"): a share of new earnings goes in,
    and an optional target makes it a savings goal. Spend is not a row: it gets what is left."""

    __tablename__ = "savings_jars"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(60))
    pct: Mapped[int] = mapped_column(Integer, default=0)  # share of new earnings, percent
    target: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    reached_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Removed jars are kept for the history; their money went back to Spend.
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    # A goal the child proposed (2.8.3): no money goes in until an adult approves it.
    pending: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class JarEntry(Base):
    """A movement in a child's jars: allocation of new earnings, a payout, a bonus from a parent
    ("interest"), a move between jars, or an adjustment. jar_id None = Spend."""

    __tablename__ = "jar_entries"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    jar_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("savings_jars.id", ondelete="CASCADE"), nullable=True, index=True)
    amount: Mapped[float] = mapped_column(Numeric(10, 2))
    kind: Mapped[str] = mapped_column(String(12))  # allocation | payout | bonus | move | adjust
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Invitation(Base):
    """A one-time link from the server admin that lets a new family set itself up (or try the
    demo first). Only a hash of the token is stored."""

    __tablename__ = "invitations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(120))  # who it is for, e.g. "The Anderssons"
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    family_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("families.id", ondelete="SET NULL"), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    demo_family_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("families.id", ondelete="SET NULL"), nullable=True)


class ServerLog(Base):
    """What the server admin did (invitations, families, backups). A family's admin can read the
    entries about their own family."""

    __tablename__ = "server_log"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_name: Mapped[str] = mapped_column(String(120), default="")
    action: Mapped[str] = mapped_column(String(40))
    family_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)  # no FK: kept after a family is deleted
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)


class Pet(Base):
    __tablename__ = "pets"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    species: Mapped[str] = mapped_column(String(20), default="other")  # dog | cat | rabbit | … | other
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class PetCare(Base):
    """A vet visit, vaccination, deworming … and when it is due next (adults are reminded)."""

    __tablename__ = "pet_care"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    pet_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("pets.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20), default="vet")  # vet | vaccination | deworming | grooming | other
    title: Mapped[str] = mapped_column(String(120))
    date: Mapped[date | None] = mapped_column(Date, nullable=True)
    next_due: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Medication(Base):
    """A medicine for a member or a pet: dose, times of day and an optional end date (a course)."""

    __tablename__ = "medications"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    pet_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("pets.id", ondelete="CASCADE"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    dose: Mapped[str] = mapped_column(String(120), default="")
    times: Mapped[list] = mapped_column(JSON, default=list)  # ["08:00", "20:00"], local time
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Tell the adults when a dose hasn't been ticked off an hour after its time.
    alert_adults: Mapped[bool] = mapped_column(Boolean, default=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    # A child's or a pet's dose is a task (2.9.0) worth this many points; an adult's own stays private.
    points: Mapped[int] = mapped_column(Integer, default=5, server_default="5")
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class MedicationDose(Base):
    """One scheduled dose: reminded, taken (by whom) or missed."""

    __tablename__ = "medication_doses"
    __table_args__ = (UniqueConstraint("medication_id", "scheduled_at", name="uq_dose_medication_time"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    medication_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("medications.id", ondelete="CASCADE"), index=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reminded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    taken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    taken_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    missed_alerted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EventPlan(Base):
    """Who drives and the packing list ticks for one calendar event (app or subscribed).

    `key` names the occurrence: "app:<event id>" or "feed:<feed id>:<uid>:<start>"."""

    __tablename__ = "event_plans"
    __table_args__ = (UniqueConstraint("family_id", "key", name="uq_event_plan_key"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    key: Mapped[str] = mapped_column(String(400))
    title: Mapped[str] = mapped_column(String(200))
    start: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    needs_ride: Mapped[bool] = mapped_column(Boolean, default=False)
    drop_off_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    pick_up_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # Packing list items ticked off for this occurrence.
    checked: Mapped[list] = mapped_column(JSON, default=list)
    ride_alerted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class PackingList(Base):
    """What to bring to an event, kept per title so every "Football practice" gets the same list."""

    __tablename__ = "packing_lists"
    __table_args__ = (UniqueConstraint("family_id", "title_key", name="uq_packing_title"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    title_key: Mapped[str] = mapped_column(String(200))
    items: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class WeekReview(Base):
    """Söndagskollen for the week starting `week_start` (a Monday): the family's plan and when it was done."""

    __tablename__ = "week_reviews"
    __table_args__ = (UniqueConstraint("family_id", "week_start", name="uq_week_review"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    week_start: Mapped[date] = mapped_column(Date)
    activity: Mapped[str | None] = mapped_column(String(200), nullable=True)
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    done_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ThanksStar(Base):
    """A thank-you star given at Söndagskollen."""

    __tablename__ = "thanks_stars"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    week_start: Mapped[date] = mapped_column(Date, index=True)
    from_user: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    to_user: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    message: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class WasteSchedule(Base):
    """A waste collection entered by hand, for municipalities without a calendar to subscribe to:
    a date it is collected and every how many weeks, optionally only some months (garden waste)."""

    __tablename__ = "waste_schedules"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    anchor_date: Mapped[date] = mapped_column(Date)
    interval_weeks: Mapped[int] = mapped_column(Integer, default=2)
    # Months it is collected (1–12); empty = all year.
    months: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Document(Base):
    """An important paper: passport, insurance, warranty, vaccination … with an expiry reminder."""

    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    # Whose it is; None = the household (home insurance, a warranty, a contract).
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(20), default="other")
    title: Mapped[str] = mapped_column(String(120))
    # The number (passport no., policy no.) encrypted with the family's key; the last four are shown.
    number_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    number_last4: Mapped[str | None] = mapped_column(String(8), nullable=True)
    issued_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # When it expires, or for a vaccination when the next dose is due.
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    remind_days: Mapped[int] = mapped_column(Integer, default=30)
    # The expiry date a reminder has been sent for (a new date gets a new reminder).
    reminded_for: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Only the owner sees it (for a child's document: the child and the adults).
    private: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Belongs to a vehicle: shown with it in Vehicles (to those who may see both).
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True, index=True)
    property_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("properties.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class DocumentFile(Base):
    """A scan or photo of a document, stored encrypted with the family's key."""

    __tablename__ = "document_files"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    storage_key: Mapped[str] = mapped_column(String(300))
    filename: Mapped[str] = mapped_column(String(200))
    content_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class VaultLogin(Base):
    """An account in the vault's password manager (2.8.1). The username, password and note are
    encrypted with the family's key; a child's logins are seen by the adults, an adult's only by them
    and those they share it with."""

    __tablename__ = "vault_logins"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    url: Mapped[str] = mapped_column(String(500), default="")
    username_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    password_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The adults an adult has shared the login with: they may see and copy it, not change it.
    shared_with: Mapped[list] = mapped_column(JSON, default=list)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class CoParent(Base):
    """A child's other parent (2.8.3): an account of their own kind – not a family member. They see
    only their children's schedule between the homes, calendar, emergency card and handover list,
    and write with the family's adults. Signs in with its own session, which no other part of the
    app accepts."""

    __tablename__ = "coparents"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    child_ids: Mapped[list] = mapped_column(JSON, default=list)
    # Set when they accept the invitation.
    username: Mapped[str | None] = mapped_column(String(120), unique=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(200), nullable=True)
    invite_token_hash: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    invite_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class CoParentMessage(Base):
    """A message between a co-parent and the family's adults about the child."""

    __tablename__ = "coparent_messages"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    coparent_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("coparents.id", ondelete="CASCADE"), index=True)
    # Written by an adult in the family; None = by the co-parent.
    sender_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)


class VaultFile(Base):
    """Any file kept in the vault (2.8.2), encrypted with the family's key. Seen by the family, or
    only by the one who put it there."""

    __tablename__ = "vault_files"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(200))
    content_type: Mapped[str] = mapped_column(String(150))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    storage_key: Mapped[str] = mapped_column(String(300))
    private: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class VaultShare(Base):
    """A link out of the vault (2.8.1): a photo, an album, a document's file, a receipt or – once –
    a login, for someone without an account. Runs out after the hours chosen; only the hash of its
    code is kept."""

    __tablename__ = "vault_shares"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(10))  # media | album | document | login
    target_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    # Whom it is for (shown to the family, not to the guest).
    label: Mapped[str] = mapped_column(String(80), default="")
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Opened once, then gone (a login always is).
    one_time: Mapped[bool] = mapped_column(Boolean, default=False)
    allow_download: Mapped[bool] = mapped_column(Boolean, default=False)
    views: Mapped[int] = mapped_column(Integer, default=0)
    first_opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class EmergencyCard(Base):
    """The important facts for a babysitter or grandparent: per member, or the household (user None)."""

    __tablename__ = "emergency_cards"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True, unique=True)
    allergies: Mapped[str] = mapped_column(Text, default="")
    medicines: Mapped[str] = mapped_column(Text, default="")
    health_centre: Mapped[str] = mapped_column(String(300), default="")
    insurance: Mapped[str] = mapped_column(String(200), default="")
    # [{name, phone, relation}]
    contacts: Mapped[list] = mapped_column(JSON, default=list)
    routines: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    # Household card: the address to give the emergency services.
    address: Mapped[str] = mapped_column(String(300), default="")
    updated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class GuestAccess(Base):
    """A time-limited link for a babysitter or grandparent – not an account. It shows the
    emergency cards, optionally the calendar and chosen lists; nothing else."""

    __tablename__ = "guest_access"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    show_calendar: Mapped[bool] = mapped_column(Boolean, default=True)
    list_ids: Mapped[list] = mapped_column(JSON, default=list)
    # A link for a child's other parent (2.7.5): only these children's calendar, custody schedule,
    # emergency card and handover list – nothing else of the family's.
    child_ids: Mapped[list] = mapped_column(JSON, default=list, server_default="[]")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class GuestVisit(Base):
    """When a guest link was opened (at most one row per half hour)."""

    __tablename__ = "guest_visits"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    guest_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("guest_access.id", ondelete="CASCADE"), index=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    user_agent: Mapped[str] = mapped_column(String(200), default="")


class SmarthomeFlow(Base):
    """A member's own automation (#44): When → If → Do, run by Smooth Family through the family's
    Home Assistant connection. Only devices the owner may control can be used."""

    __tablename__ = "smarthome_flows"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # Shared flows are seen (and their buttons pressed) by the whole family.
    shared: Mapped[bool] = mapped_column(Boolean, default=False)
    # A child's flow waits for an adult's approval before it runs.
    approved: Mapped[bool] = mapped_column(Boolean, default=True)
    # A button flow shown on the owner's Today card.
    on_today: Mapped[bool] = mapped_column(Boolean, default=False)
    trigger: Mapped[dict] = mapped_column(JSON, default=dict)
    conditions: Mapped[list] = mapped_column(JSON, default=list)
    actions: Mapped[list] = mapped_column(JSON, default=list)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(300), nullable=True)
    # app: Smooth Family runs it | ha: published to Home Assistant as automation smooth_family_<id>
    run_in: Mapped[str] = mapped_column(String(4), default="app", server_default="app")
    ha_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class KioskScreen(Base):
    """A kitchen display (#50): a tablet signed in with its own link. It shows the family's day and
    can press shared flow buttons – nothing private (no chat, money or documents)."""

    __tablename__ = "kiosk_screens"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # The admin lets this screen scan groceries into the pantry and take stock (#69).
    pantry_scan: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # The admin lets the children in the little ones' mode open their routines here (2.5.5).
    easy_mode: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    # What the screen shows (2.8.2); None = all of it.
    widgets: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # The screensaver (3.0.3): photos | flipclock | calm | fox | dark, after this many minutes untouched.
    screensaver: Mapped[str] = mapped_column(String(12), default="photos", server_default="photos")
    idle_minutes: Mapped[int] = mapped_column(Integer, default=5, server_default="5")
    # The night (3.0.4): the screen dims from night_from to night_to (whole hours), if night_dim.
    night_dim: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    night_from: Mapped[int] = mapped_column(Integer, default=22, server_default="22")
    night_to: Mapped[int] = mapped_column(Integer, default=6, server_default="6")
    # The language the screen speaks (3.0.4); None = the family admin's.
    language: Mapped[str | None] = mapped_column(String(5), nullable=True)
    # Its colour theme (3.0.4); None = the app's first (forest).
    theme: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # The smart home devices it may control (3.0.4): ExposedDevice ids; None = none.
    devices: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # The app version the screen last ran (3.1.0).
    app_version: Mapped[str | None] = mapped_column(String(40), nullable=True)


class ClientDevice(Base):
    """A browser or phone a member uses the app on (3.1.0): what kind, which browser and system, the
    app version it runs and when it was last seen – for the overview of the family's devices. Known by
    a random cookie of its own; nothing else (no address, no place) is kept."""

    __tablename__ = "client_devices"
    __table_args__ = (UniqueConstraint("user_id", "device_key", name="uq_client_device"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    device_key: Mapped[str] = mapped_column(String(64))
    # mobile | tablet | computer
    kind: Mapped[str] = mapped_column(String(12), default="computer", server_default="computer")
    browser: Mapped[str] = mapped_column(String(40), default="", server_default="")
    os: Mapped[str] = mapped_column(String(40), default="", server_default="")
    app_version: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # Added to the home screen (runs as an app of its own).
    installed: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Trip(Base):
    """A trip or holiday (#70): shown in the calendar, with an itinerary, packing per person, a
    budget and a checklist before leaving."""

    __tablename__ = "trips"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    destination: Mapped[str] = mapped_column(String(200), default="")
    start_date: Mapped[date] = mapped_column(Date, index=True)
    end_date: Mapped[date] = mapped_column(Date)
    # Who is going (user ids); empty = the whole family.
    member_ids: Mapped[list] = mapped_column(JSON, default=list)
    budget: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    reminded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class TripItem(Base):
    """A part of the itinerary: travel, a stay or an activity."""

    __tablename__ = "trip_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    trip_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("trips.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(10), default="activity")  # travel | stay | activity | other
    title: Mapped[str] = mapped_column(String(200))
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    place: Mapped[str] = mapped_column(String(300), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    # A ticket or booking in the document vault.
    document_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class TripPackingItem(Base):
    """Something to pack – for one traveller, or for everyone (user None)."""

    __tablename__ = "trip_packing"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    trip_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("trips.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    text: Mapped[str] = mapped_column(String(120))
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class TripExpense(Base):
    __tablename__ = "trip_expenses"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    trip_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("trips.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    amount: Mapped[float] = mapped_column(Numeric(10, 2))
    paid_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class TripCheck(Base):
    """The checklist before leaving: water off, plants, pet sitter …"""

    __tablename__ = "trip_checks"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    trip_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("trips.id", ondelete="CASCADE"), index=True)
    text: Mapped[str] = mapped_column(String(120))
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    position: Mapped[int] = mapped_column(Integer, default=0)


class PantryItem(Base):
    """Something the family has at home (#69): where it is, how much and until when it keeps."""

    __tablename__ = "pantry_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    place: Mapped[str] = mapped_column(String(10), default="pantry")  # freezer | fridge | pantry
    name: Mapped[str] = mapped_column(String(120))
    amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str] = mapped_column(String(20), default="")
    best_before: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    # The best-before date a "use soon" reminder was sent for (a new date gets a new one).
    reminded_for: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Scanned in: the same barcode in the same place is one item with an amount.
    barcode: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    added_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class AiJob(Base):
    """A task for the local AI (Ollama on a computer at home), queued until that computer is on.

    The result is only a suggestion: it is applied when a member has looked at it."""

    __tablename__ = "ai_jobs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # receipt | recipe | quick_add | cook_ideas
    kind: Mapped[str] = mapped_column(String(20))
    # queued | running | done | applied | dismissed | failed | cancelled | expired
    status: Mapped[str] = mapped_column(String(10), default="queued", index=True)
    input: Mapped[dict] = mapped_column(JSON, default=dict)
    # A picture for the job (receipt, cookbook page), removed once the job has run.
    file_key: Mapped[str | None] = mapped_column(String(300), nullable=True)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)



class PantryProduct(Base):
    """What a barcode is, as the family named it the first time it was scanned – so the next scan
    fills in the name, unit, place and how long it keeps by itself."""

    __tablename__ = "pantry_products"
    __table_args__ = (UniqueConstraint("family_id", "barcode", name="uq_pantry_product"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    barcode: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(120))
    unit: Mapped[str] = mapped_column(String(20), default="")
    place: Mapped[str] = mapped_column(String(10), default="pantry")
    keeps_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Routine(Base):
    """A little one's routine (morning, evening, the preschool bag …): picture steps in order. It is
    a task of its own – done when every step is – so points, approval, Today and the kitchen display
    work as for any task."""

    __tablename__ = "routines"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(80))
    picture: Mapped[str] = mapped_column(String(16), default="⭐")
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class RoutineStep(Base):
    __tablename__ = "routine_steps"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    routine_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("routines.id", ondelete="CASCADE"), index=True)
    picture: Mapped[str] = mapped_column(String(16))
    label: Mapped[str] = mapped_column(String(80))
    position: Mapped[int] = mapped_column(Integer, default=0)


class RoutineStepDone(Base):
    __tablename__ = "routine_step_done"
    __table_args__ = (UniqueConstraint("step_id", "day", name="uq_routine_step_day"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    step_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("routine_steps.id", ondelete="CASCADE"), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    done_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Sticker(Base):
    """A sticker for the little one's album: one for each routine or task done."""

    __tablename__ = "stickers"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    sticker: Mapped[str] = mapped_column(String(16))
    # What it was for: one per task (a routine is a task) and day.
    task_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    day: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class CustodySchedule(Base):
    """A child who lives in two homes (2.7.5): when they are here and when in the other home."""

    __tablename__ = "custody_schedules"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    # What the other home is called, e.g. "Dad's" or "Mamma".
    other_home: Mapped[str] = mapped_column(String(60))
    # week (week on, week off) | 223 (2-2-3) | weekend (every other weekend away) | custom (only the exceptions)
    pattern: Mapped[str] = mapped_column(String(10), default="week")
    # A day the pattern starts on with the child here (for "weekend": a Friday the child is away).
    anchor_date: Mapped[date] = mapped_column(Date)
    handover_time: Mapped[str] = mapped_column(String(5), default="17:00")
    # The child's tasks wait while they are in the other home.
    pause_tasks: Mapped[bool] = mapped_column(Boolean, default=True)
    # What goes along at a handover; ticked off and cleared again after each one.
    handover_list_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("lists.id", ondelete="SET NULL"), nullable=True)
    reminded_for: Mapped[date | None] = mapped_column(Date, nullable=True)
    cleared_for: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class CustodyException(Base):
    """Days that don't follow the pattern: holidays, a swapped weekend …"""

    __tablename__ = "custody_exceptions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    schedule_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("custody_schedules.id", ondelete="CASCADE"), index=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    # here | other
    place: Mapped[str] = mapped_column(String(5))
    note: Mapped[str] = mapped_column(String(120), default="")


class BankRule(Base):
    """A bank transaction text the family has placed before: it goes to the same place next time."""

    __tablename__ = "bank_rules"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    # Lower case; the transaction's text contains it.
    pattern: Mapped[str] = mapped_column(String(80))
    # vehicle | property | ignore
    target: Mapped[str] = mapped_column(String(10))
    target_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    category: Mapped[str] = mapped_column(String(60), default="other")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class BankImported(Base):
    """A transaction already imported (only a hash of date, amount and text – never the row)."""

    __tablename__ = "bank_imported"
    __table_args__ = (UniqueConstraint("family_id", "digest", name="uq_bank_imported"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=_uuid)
    family_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("families.id"), index=True)
    digest: Mapped[str] = mapped_column(String(64))
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

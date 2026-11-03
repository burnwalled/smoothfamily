"""Pydantic v2 request/response schemas."""
import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, field_validator, model_validator


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Auth & family ---

SUPPORTED_LANGUAGES = r"^(en|sv|nb|da|fi)$"
SUPPORTED_THEMES = r"^(forest|ocean|sunset|lavender|midnight|sand|berry|citrus|aurora)$"
# Menu sections a user can reorder or hide ("today" can't be hidden).
NavSection = Literal[
    "today", "calendar", "tasks", "chat", "allowance", "lists", "food", "smarthome", "property", "vehicles", "photos", "achievements", "birthdays", "shop", "medicine", "pets", "week", "documents", "emergency", "trips", "pantry", "health"
]
# Apps the family admin can turn on or off per member (see app/apps.py).
AppKey = Literal["calendar", "tasks", "chat", "allowance", "lists", "food", "smarthome", "property", "vehicles", "photos", "achievements", "birthdays", "shop", "medicine", "pets", "week", "documents", "emergency", "trips", "pantry", "health"]


def _clean(value):
    return value.strip() if isinstance(value, str) else value


def _clean_username(value):
    return value.strip().lower() if isinstance(value, str) else value


# a–z, 0–9 and . _ - @ (so an e-mail address works as a username); never spaces inside. Capitals
# and stray spaces around it are tidied ("Kalle " → "kalle").
Username = Annotated[str, BeforeValidator(_clean_username), Field(min_length=2, max_length=60, pattern=r"^[a-z0-9_.@-]+$")]
Email = Annotated[str, BeforeValidator(_clean), Field(max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]


class SetupRequest(BaseModel):
    family_name: str = Field(min_length=1, max_length=120)
    display_name: str = Field(min_length=1, max_length=120)
    username: Username
    password: str = Field(min_length=8, max_length=200)
    # Admin contact address – also the push-service contact (Apple rejects placeholder addresses).
    email: Email
    setup_code: str | None = Field(default=None, max_length=200)
    # Sign-in policy for the family (can be changed later in Family admin → Security).
    passkeys_enabled: bool = True
    totp_policy: str = Field(default="optional", pattern=r"^(off|optional|required)$")
    # The language the admin set the family up in – also the first choice of public holidays.
    language: str | None = Field(default=None, pattern=r"^(en|sv|nb|da|fi)$")


class LoginRequest(BaseModel):
    username: str
    password: str


class MemberCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)
    username: Username
    password: str = Field(min_length=4, max_length=200)  # shorter is fine for child accounts
    role: str = Field(default="adult", pattern=r"^(admin|adult|child)$")
    color: str = "#4F7A5B"
    # A child's birthday (3.0.1): kept in Birthdays, and 6 or younger starts in the little ones' mode.
    birth_date: date | None = None
    # The app's language for the new member (3.0.4); None = the admin's own.
    language: str | None = Field(default=None, pattern=SUPPORTED_LANGUAGES)


class MemberPatch(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    role: str | None = Field(default=None, pattern=r"^(admin|adult|child)$")
    color: str | None = None
    allowance_rate: float | None = Field(default=None, ge=0, le=999999.99)
    # Adults only: may change the family's settings (everyday, children, sharing).
    can_manage_family: bool | None = None
    # The app's language (3.0.4): a parent chooses it for a child.
    language: str | None = Field(default=None, pattern=SUPPORTED_LANGUAGES)


class MemberPasswordReset(BaseModel):
    password: str = Field(min_length=4, max_length=200)


class MemberOut(ORMModel):
    id: uuid.UUID
    username: str
    display_name: str
    role: str
    color: str
    allowance_rate: float | None = None
    # Set by the family admin; None = the role's default. `apps` is what the member may use.
    app_access: list[str] | None = None
    apps: list[str] = []
    # The little ones' mode: pictures and routines instead of the app.
    easy_mode: bool = False
    # Changes the family's settings (the admin always does).
    can_manage_family: bool = False
    language: str = "en"
    # "preset:<name>" or an uploaded picture's key (3.0.4: a parent sets a child's).
    avatar_key: str | None = None


class AppAccessIn(BaseModel):
    # None goes back to the role's default.
    apps: list[AppKey] | None


class NotificationPrefs(BaseModel):
    chat: bool = True
    approvals: bool = True
    calendar_mine: bool = True
    calendar_family: bool = False
    # The weekly "memory" (photos from this week in earlier years).
    memories: bool = True


class MeOut(MemberOut):
    family_id: uuid.UUID
    family_name: str
    language: str
    theme: str
    notification_prefs: NotificationPrefs
    avatar_key: str | None = None
    email: str | None = None
    nav_order: list[str] = []
    nav_hidden: list[str] = []
    nav_group_mobile: bool = False
    nav_group_desktop: bool = True
    is_server_admin: bool = False
    # owner | hosted | demo – hosted and demo families have no smart home (it needs the server
    # to be in the same home as Home Assistant).
    family_kind: str = "owner"
    smarthome_available: bool = True
    # A hosted family's Home Assistant only comes through the gateway (2.8.4).
    smarthome_gateway_only: bool = False
    # Hosted and demo families: the family whose home the server runs in.
    host_family_name: str | None = None
    morning_summary: bool = False
    morning_time: str = "07:00"
    morning_days: str = "weekdays"


class PreferencesUpdate(BaseModel):
    """Per-user UI preferences. Only provided fields are changed."""

    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    # Empty string clears the address.
    email: str | None = Field(default=None, max_length=255, pattern=r"^$|[^@\s]+@[^@\s]+\.[^@\s]+$")
    language: str | None = Field(default=None, pattern=SUPPORTED_LANGUAGES)
    theme: str | None = Field(default=None, pattern=SUPPORTED_THEMES)
    notification_prefs: NotificationPrefs | None = None
    nav_order: list[NavSection] | None = Field(default=None, max_length=20)
    nav_hidden: list[NavSection] | None = Field(default=None, max_length=20)
    nav_group_mobile: bool | None = None
    nav_group_desktop: bool | None = None
    morning_summary: bool | None = None
    morning_time: str | None = Field(default=None, pattern=r"^([01][0-9]|2[0-3]):[0-5][0-9]$")
    morning_days: str | None = Field(default=None, pattern=r"^(weekdays|all)$")

    @field_validator("nav_order", "nav_hidden")
    @classmethod
    def _unique(cls, value: list[str] | None) -> list[str] | None:
        return list(dict.fromkeys(value)) if value is not None else None

    @field_validator("nav_hidden")
    @classmethod
    def _today_stays(cls, value: list[str] | None) -> list[str] | None:
        if value is not None and "today" in value:
            raise ValueError("The Today page can't be hidden")
        return value


class SetupStatus(BaseModel):
    needs_setup: bool
    requires_code: bool = False
    passkeys_enabled: bool = False
    # The shortest password the setup accepts.
    password_min: int = 12


class MfaChallengeOut(BaseModel):
    """Password was right; the client must now send an authenticator code
    (or, with totp_setup_required, first enrol one) together with mfa_token."""

    mfa_required: bool = True
    totp_setup_required: bool = False
    mfa_token: str


# --- Calendar ---

class FeedCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    url: str = Field(min_length=8)
    color: str = "#4F7A5B"
    visible_to: list[uuid.UUID] = []
    details_for: list[uuid.UUID] = []
    # Whose own calendar it is (None = the family's, e.g. the school's).
    member_id: uuid.UUID | None = None


class FeedUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    color: str | None = None
    visible_to: list[uuid.UUID] | None = None
    details_for: list[uuid.UUID] | None = None
    # Sent as null to make it the family's again; left out keeps it.
    member_id: uuid.UUID | None = None


class FeedOut(ORMModel):
    id: uuid.UUID
    name: str
    url: str
    color: str
    visible_to: list[uuid.UUID] = []
    details_for: list[uuid.UUID] = []
    member_id: uuid.UUID | None = None


class PackingItem(BaseModel):
    text: str
    done: bool = False


class PackTask(BaseModel):
    """A packing task made from a trip or a calendar event (2.9.0)."""

    task_id: uuid.UUID
    user_id: uuid.UUID | None
    day: date | None
    done: bool


class EventOut(BaseModel):
    # Exactly one of feed_id (iCal subscription) and event_id (created in the app) is set.
    feed_id: uuid.UUID | None = None
    event_id: uuid.UUID | None = None
    feed_name: str
    color: str
    title: str | None = None
    start: datetime
    end: datetime
    all_day: bool
    busy: bool = False
    location: str | None = None
    description: str | None = None
    created_by: uuid.UUID | None = None
    # Members an app event concerns; empty = everyone.
    member_ids: list[uuid.UUID] = []
    # Set for a birthday (from Birthdays): whose it is.
    birthday_person_id: uuid.UUID | None = None
    # Set for a document's expiry date (from Documents).
    document_id: uuid.UUID | None = None
    # Set for a trip (from Trips).
    trip_id: uuid.UUID | None = None
    # A vehicle's inspection, service … (Vehicles).
    vehicle_id: uuid.UUID | None = None
    # A home's maintenance (Property).
    property_id: uuid.UUID | None = None
    # A public holiday of the family's country (3.4.0) – an eve (julafton) is marked too.
    holiday: bool = False
    holiday_eve: bool = False
    # Names the occurrence for who drives and the packing list (not for busy or birthday events).
    key: str | None = None
    needs_ride: bool = False
    drop_off_by: uuid.UUID | None = None
    pick_up_by: uuid.UUID | None = None
    packing: list[PackingItem] = []
    # The day it's time to pack: a task per member going (2.9.0).
    pack_tasks: list["PackTask"] = []


class FamilyEventIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    start: datetime
    end: datetime
    all_day: bool = False
    location: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    color: str = Field(default="#C2703D", pattern=r"^#[0-9A-Fa-f]{6}$")
    member_ids: list[uuid.UUID] = Field(default=[], max_length=50)


class FamilyEventOut(ORMModel):
    id: uuid.UUID
    created_by: uuid.UUID
    title: str
    start: datetime
    end: datetime
    all_day: bool
    location: str | None
    description: str | None
    color: str
    member_ids: list[uuid.UUID]


# --- Tasks & gamification ---

class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    points: int = Field(default=10, ge=1, le=1000)
    assignee_id: uuid.UUID | None = None
    recurrence: str = Field(default="none", pattern=r"^(none|daily|weekly|monthly|yearly)$")
    weekday: int | None = Field(default=None, ge=0, le=6)
    weekdays: list[int] = Field(default=[], max_length=7)
    interval_weeks: int = Field(default=1, ge=1, le=8)
    interval_days: int = Field(default=1, ge=1, le=30)
    interval_months: int = Field(default=1, ge=1, le=12)
    month_nth: int | None = Field(default=None, ge=-1, le=4)
    month: int | None = Field(default=None, ge=1, le=12)
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    due_date: date | None = None
    property_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    vehicle_id: uuid.UUID | None = None
    requires_approval: bool = False
    # Taking turns (see Task.rotation_user_ids); at least two members to rotate.
    rotation_user_ids: list[uuid.UUID] = Field(default=[], max_length=20)
    rotation_mode: str = Field(default="done", pattern=r"^(done|weekly)$")
    pet_id: uuid.UUID | None = None
    picture: str | None = Field(default=None, max_length=16)
    # Several can do it together; the points are shared (3.0.3).
    shared: bool = False
    # Done by exercising this many minutes that day (3.4.0, Health).
    exercise_minutes: int | None = Field(default=None, ge=5, le=600)


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    points: int | None = Field(default=None, ge=1, le=1000)
    assignee_id: uuid.UUID | None = None
    recurrence: str | None = Field(default=None, pattern=r"^(none|daily|weekly|monthly|yearly)$")
    weekday: int | None = Field(default=None, ge=0, le=6)
    weekdays: list[int] | None = Field(default=None, max_length=7)
    interval_weeks: int | None = Field(default=None, ge=1, le=8)
    interval_days: int | None = Field(default=None, ge=1, le=30)
    interval_months: int | None = Field(default=None, ge=1, le=12)
    month_nth: int | None = Field(default=None, ge=-1, le=4)
    month: int | None = Field(default=None, ge=1, le=12)
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    due_date: date | None = None
    property_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    vehicle_id: uuid.UUID | None = None
    requires_approval: bool | None = None
    active: bool | None = None
    rotation_user_ids: list[uuid.UUID] | None = Field(default=None, max_length=20)
    rotation_mode: str | None = Field(default=None, pattern=r"^(done|weekly)$")
    pet_id: uuid.UUID | None = None
    picture: str | None = Field(default=None, max_length=16)
    # Several can do it together; the points are shared (3.0.3).
    shared: bool | None = None
    exercise_minutes: int | None = Field(default=None, ge=5, le=600)


class TaskOut(ORMModel):
    id: uuid.UUID
    title: str
    description: str | None
    points: int
    assignee_id: uuid.UUID | None
    recurrence: str
    weekday: int | None
    weekdays: list[int] = []
    interval_weeks: int = 1
    interval_days: int = 1
    interval_months: int = 1
    month_nth: int | None = None
    anchor_date: date | None = None
    month: int | None
    day_of_month: int | None
    due_date: date | None
    property_id: uuid.UUID | None
    project_id: uuid.UUID | None
    vehicle_id: uuid.UUID | None
    requires_approval: bool
    active: bool
    rotation_user_ids: list[uuid.UUID] = []
    rotation_mode: str = "done"
    pet_id: uuid.UUID | None = None
    picture: str | None = None
    # Made from another app (2.9.0): a medicine's dose, or packing before a trip or an event.
    medication_id: uuid.UUID | None = None
    dose_time: str | None = None
    until_date: date | None = None
    trip_id: uuid.UUID | None = None
    event_key: str | None = None
    shared: bool = False
    exercise_minutes: int | None = None


class TaskHistoryItem(BaseModel):
    task_id: uuid.UUID
    title: str
    completed_date: date
    points_awarded: int
    status: str


class TodayTask(BaseModel):
    task: TaskOut
    done: bool
    done_by: str | None = None
    completion_status: str | None = None
    review_note: str | None = None
    unlocked: list[str] = []
    # Ticked off by mistake (3.1.1): whether the one asking may undo it.
    can_undo: bool = False


class TaskSuggestionIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


class TaskSuggestionOut(ORMModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str = ""
    title: str
    description: str | None
    status: str
    task_id: uuid.UUID | None
    review_note: str | None
    created_at: datetime
    reviewed_at: datetime | None


class TaskSuggestionReject(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class TasksAttentionOut(BaseModel):
    """What adults should look at: completions to approve and task suggestions."""
    approvals: int
    suggestions: int


class WeekDayTasks(BaseModel):
    day: date
    items: list[TodayTask]


class ApprovalOut(BaseModel):
    completion_id: uuid.UUID
    task_id: uuid.UUID
    task_title: str
    user_id: uuid.UUID
    user_name: str
    completed_date: date
    created_at: datetime
    points: int


class ApprovalAction(BaseModel):
    action: str = Field(pattern=r"^(approve|reject)$")
    note: str | None = Field(default=None, max_length=500)


class AllowanceMe(BaseModel):
    rate: float | None
    points_per_unit: int | None = None
    currency: str
    earned_week: float
    earned_month: float
    earned_lifetime: float
    payouts_total: float
    balance: float
    points_week: int = 0
    points_lifetime: int = 0
    # Completed but not yet approved by an adult.
    points_pending: int = 0
    # points: points per unit; goal: `amount` for each period (week|month) reaching `min_points`.
    mode: str = "points"
    period: str = "week"
    min_points: int | None = None
    amount: float | None = None
    period_points: int = 0
    period_reached: bool = True
    period_earned: float = 0


class AllowanceOverviewItem(BaseModel):
    user_id: uuid.UUID
    display_name: str
    color: str = "#4F7A5B"
    rate: float | None
    points_per_unit: int | None = None
    currency: str
    earned_week: float = 0
    earned_lifetime: float
    payouts_total: float
    balance: float
    points_week: int = 0
    points_pending: int = 0
    mode: str = "points"
    period: str = "week"
    min_points: int | None = None
    amount: float | None = None
    period_points: int = 0
    period_reached: bool = True
    period_earned: float = 0


class AllowanceRateIn(BaseModel):
    mode: str = Field(default="points", pattern=r"^(points|goal)$")
    # points mode: None = no allowance for this child.
    points_per_unit: int | None = Field(default=None, ge=1, le=100000)
    # goal mode: points needed per period, and the amount that period then earns.
    min_points: int | None = Field(default=None, ge=1, le=1_000_000)
    amount: float | None = Field(default=None, gt=0, le=1_000_000)
    period: str = Field(default="week", pattern=r"^(week|month)$")

    @model_validator(mode="after")
    def _goal_complete(self):
        if self.mode == "goal" and (self.min_points is None or self.amount is None):
            raise ValueError("A point goal needs both points and an amount")
        return self


class AllowancePayoutCreate(BaseModel):
    user_id: uuid.UUID
    amount: float = Field(gt=0)
    note: str | None = Field(default=None, max_length=500)
    # With savings jars: the jar it is taken from (None = Spend).
    jar_id: uuid.UUID | None = None


class AllowancePayoutOut(ORMModel):
    id: uuid.UUID
    user_id: uuid.UUID
    amount: float
    note: str | None
    jar_id: uuid.UUID | None = None
    paid_at: datetime


class FamilySettingsPatch(BaseModel):
    currency: str | None = Field(default=None, min_length=1, max_length=8)
    shopping_task_points: int | None = Field(default=None, ge=0, le=1000)
    child_approval: bool | None = None


class FamilySettingsOut(BaseModel):
    currency: str
    shopping_task_points: int
    child_approval: bool = True


class ChatConversationOut(BaseModel):
    peer_key: str
    peer_type: str
    peer_user_id: uuid.UUID | None = None
    peer_name: str
    peer_color: str | None = None
    last_message_snippet: str | None = None
    last_message_at: datetime | None = None
    unread_count: int
    # v2 extras
    conversation_id: uuid.UUID | None = None
    conversation_name: str | None = None
    member_ids: list[uuid.UUID] = []
    is_creator: bool = False


class ChatMessageOut(BaseModel):
    id: uuid.UUID
    sender_id: uuid.UUID
    sender_name: str
    sender_color: str
    recipient_id: uuid.UUID | None = None
    body: str
    media_id: uuid.UUID | None = None
    gif_id: str | None = None
    created_at: datetime


class ChatMessagesPage(BaseModel):
    items: list[ChatMessageOut]
    next_before: uuid.UUID | None = None


class ChatMessageCreate(BaseModel):
    peer: str = Field(min_length=1, max_length=50)
    body: str = Field(default="", max_length=4000)  # may be empty when an image or GIF is attached
    media_id: uuid.UUID | None = None
    gif_id: str | None = Field(default=None, max_length=64, pattern=r"^[A-Za-z0-9]+$")


class GiphySettingIn(BaseModel):
    api_key: str = Field(min_length=10, max_length=200)


class GiphySettingOut(BaseModel):
    configured: bool


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=4, max_length=200)


class ChatReadRequest(BaseModel):
    peer: str = Field(min_length=1, max_length=50)


class ConversationCreate(BaseModel):
    name: str | None = Field(default=None, max_length=80)
    member_ids: list[uuid.UUID] = []


class ConversationMembersUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=80)
    add_member_ids: list[uuid.UUID] = []
    remove_member_ids: list[uuid.UUID] = []


class ICalTokenOut(BaseModel):
    token: str
    url: str | None = None


class ExternalUrlIn(BaseModel):
    external_url: str | None = Field(default=None, max_length=500)


class ExternalUrlOut(BaseModel):
    external_url: str | None = None  # set by the server admin
    env_url: str | None = None  # PUBLIC_URL from the server's environment
    effective: str | None = None  # what links use


class PushVapidKeyOut(BaseModel):
    public_key: str


class PushSubscriptionKeys(BaseModel):
    p256dh: str = Field(min_length=1, max_length=500)
    auth: str = Field(min_length=1, max_length=500)


class PushSubscriptionIn(BaseModel):
    endpoint: str = Field(min_length=1)
    keys: PushSubscriptionKeys


class PushSubscriptionDelete(BaseModel):
    endpoint: str = Field(min_length=1)


class PushSubscriptionOut(ORMModel):
    id: uuid.UUID
    endpoint: str
    user_agent: str | None
    created_at: datetime


class LeaderboardEntry(BaseModel):
    user_id: uuid.UUID
    display_name: str
    color: str
    points_week: int
    points_total: int
    streak_days: int


# --- Dashboard widgets ---

WIDGET_TYPES = r"^(calendar_today|tasks_today|leaderboard|sl_departures|shopping_list|smart_home|chat_unread|family_goals|waste_collection|school_lunch|weather|presence|electricity|memories|pantry_soon|upcoming|custody)$"


class WidgetCreate(BaseModel):
    type: str = Field(pattern=WIDGET_TYPES)
    config: dict = Field(default_factory=dict)


class WidgetUpdate(BaseModel):
    position: int | None = Field(default=None, ge=0)
    config: dict | None = None


class WidgetOut(ORMModel):
    id: uuid.UUID
    type: str
    position: int
    config: dict


class WidgetReorderItem(BaseModel):
    id: uuid.UUID
    position: int = Field(ge=0)


# --- SL public transport (Trafiklab SL Transport API) ---

class SlSite(BaseModel):
    id: int
    name: str


class TransitStop(BaseModel):
    # A provider's own id for the stop (SL's are numbers).
    id: str
    name: str


class TransitProviderOut(BaseModel):
    id: str
    name: str
    area: str
    needs_key: bool
    # It can be used on this server (no key needed, or the server admin added one).
    available: bool
    # The one for the member's language.
    suggested: bool = False


class TransitKeyOut(BaseModel):
    id: str
    name: str
    area: str
    key: str  # none | required | optional
    configured: bool
    signup: str | None


class TransitKeyIn(BaseModel):
    provider: str = Field(max_length=20)
    # None (or empty) removes it.
    api_key: str | None = Field(default=None, max_length=300)


class SlDeparture(BaseModel):
    line: str
    destination: str
    transport_mode: str
    scheduled: datetime
    expected: datetime
    state: str
    # True when SL isn't answering and these are the last known departures.
    stale: bool = False


# --- Home profile & AI chores ---

class HomeProfileIn(BaseModel):
    dwelling_type: str = Field(default="apartment", pattern=r"^(apartment|rowhouse|villa|farm)$")
    has_garden: bool = False
    notes: str | None = Field(default=None, max_length=500)


class HomeProfileOut(ORMModel):
    dwelling_type: str
    has_garden: bool
    notes: str | None


class RoomCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: str = Field(
        pattern=r"^(kitchen|bathroom|toilet|bedroom|living_room|hallway|laundry_room|garage|garden|other)$"
    )


class RoomOut(ORMModel):
    id: uuid.UUID
    name: str
    category: str


class PromptOut(BaseModel):
    prompt: str


class ChoreImportItem(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    points: int = Field(default=10, ge=1, le=1000)
    recurrence: str = Field(pattern=r"^(daily|weekly|none)$")
    weekday: int | None = Field(default=None, ge=0, le=6)
    due_date: date | None = None
    assignee: str | None = None


class ChoreImportRequest(BaseModel):
    chores: list[ChoreImportItem] = Field(min_length=1, max_length=100)


class ImportResult(BaseModel):
    imported: int
    skipped: list[str] = []


LIST_CATEGORIES_REGEX = r"^(produce|bread|dairy|meat_fish|frozen|pantry|snacks|beverages|household|other)$"


# --- Meal planning & shopping list ---

class IngredientImport(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    amount: float | None = Field(default=None, ge=0)
    unit: str | None = Field(default=None, max_length=20)
    category: str | None = Field(default=None, pattern=LIST_CATEGORIES_REGEX)


class MealImportItem(BaseModel):
    weekday: int = Field(ge=0, le=6)
    slot: Literal["dinner", "lunchbox", "lunch"] = "dinner"
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    servings: int = Field(default=4, ge=1, le=20)
    ingredients: list[IngredientImport] = []
    steps: list[str] = []

    @field_validator("steps")
    @classmethod
    def validate_steps(cls, v: list[str]) -> list[str]:
        return [s.strip() for s in v if s.strip()][:10]


class MealPlanImportRequest(BaseModel):
    week_start: date
    meals: list[MealImportItem] = Field(min_length=1, max_length=21)


class IngredientOut(ORMModel):
    name: str
    amount: float | None
    unit: str | None
    category: str | None


class MealOut(ORMModel):
    id: uuid.UUID
    weekday: int
    slot: str = "dinner"
    name: str
    description: str | None
    servings: int
    ingredients: list[IngredientOut]
    steps: list[str] = []


class MealPlanOut(ORMModel):
    id: uuid.UUID
    week_start: date
    meals: list[MealOut]


class RecipeIngredientIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    amount: float | None = Field(default=None, ge=0)
    unit: str | None = Field(default=None, max_length=20)
    category: str | None = Field(default=None, pattern=LIST_CATEGORIES_REGEX)


RECIPE_CATEGORIES = ("", "everyday", "weekend", "vegetarian", "fish", "soup", "salad", "baking", "dessert", "breakfast", "kids", "party", "other")


class RecipeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    servings: int = Field(default=4, ge=1, le=20)
    ingredients: list[RecipeIngredientIn] = []
    steps: list[str] = []
    source_url: str | None = Field(default=None, max_length=2000, pattern=r"^$|^https?://")
    category: str = Field(default="", pattern="^(" + "|".join(RECIPE_CATEGORIES) + ")$")


class RecipeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    servings: int | None = Field(default=None, ge=1, le=20)
    source_url: str | None = Field(default=None, max_length=2000, pattern=r"^$|^https?://")
    category: str | None = Field(default=None, pattern="^(" + "|".join(RECIPE_CATEGORIES) + ")$")
    favorite: bool | None = None
    ingredients: list[RecipeIngredientIn] | None = None
    steps: list[str] | None = None


class RecipeIngredientOut(ORMModel):
    name: str
    amount: float | None
    unit: str | None
    category: str | None


class RecipeOut(ORMModel):
    id: uuid.UUID
    name: str
    description: str | None
    servings: int
    photo_key: str | None
    ingredients: list[RecipeIngredientOut] = []
    steps: list[str] = []
    source_url: str | None = None
    category: str = ""
    favorite: bool = False
    # The family's stars (2.8.4): the average, how many rated, and mine (0 = not rated).
    rating: float | None = None
    ratings: int = 0
    my_rating: int = 0


class PlanFromRecipe(BaseModel):
    week_start: date
    weekday: int = Field(ge=0, le=6)
    slot: Literal["dinner", "lunchbox", "lunch"] = "dinner"


class PlanMealIn(BaseModel):
    """One meal of the week set by hand (3.2.0, e.g. from the Sunday check-in): a name, or nothing to
    take it away."""

    week_start: date
    weekday: int = Field(ge=0, le=6)
    slot: Literal["dinner", "lunchbox", "lunch"] = "dinner"
    name: str | None = Field(default=None, max_length=200)


class MealSettings(BaseModel):
    lunchboxes: int = Field(default=0, ge=0, le=10)
    weekend_lunch: bool = False


class ListCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    allowed_user_ids: list[uuid.UUID] = []
    archived: bool = False


class ListUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    allowed_user_ids: list[uuid.UUID] | None = None
    archived: bool | None = None
    linked_task_id: uuid.UUID | None = None


class ListOut(ORMModel):
    id: uuid.UUID
    name: str
    allowed_user_ids: list[uuid.UUID]
    created_by: uuid.UUID
    linked_task_id: uuid.UUID | None
    archived: bool
    # Items not ticked yet (filled in when listing the lists).
    open_items: int = 0


class ListItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    category: str | None = Field(default=None, pattern=LIST_CATEGORIES_REGEX)


class ListItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    category: str | None = Field(default=None, pattern=LIST_CATEGORIES_REGEX)
    done: bool | None = None
    position: int | None = Field(default=None, ge=0)


class ListItemOut(ORMModel):
    id: uuid.UUID
    list_id: uuid.UUID
    name: str
    category: str | None
    done: bool
    position: int


class ListItemReorder(BaseModel):
    id: uuid.UUID
    position: int = Field(ge=0)


# --- Achievements ---

class AchievementProgress(BaseModel):
    current: int
    target: int


class AchievementOut(BaseModel):
    id: str
    tier: str
    icon: str
    unlocked_at: datetime | None
    progress: AchievementProgress


class LevelInfo(BaseModel):
    level: int
    points: int
    points_in_level: int
    points_to_next: int


class AchievementsResponse(BaseModel):
    achievements: list[AchievementOut]
    level: LevelInfo


# --- Report a problem (GitHub issues) ---

class FeedbackStatusOut(BaseModel):
    enabled: bool


class FeedbackIn(BaseModel):
    type: str = Field(pattern=r"^(bug|idea)$")
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=5000)
    page: str | None = Field(default=None, max_length=300)
    user_agent: str | None = Field(default=None, max_length=400)
    viewport: str | None = Field(default=None, max_length=40)
    # data:image/png|jpeg|webp;base64,… (max 6 MB decoded)
    screenshot: str | None = Field(default=None, max_length=9_000_000)


class FeedbackOut(BaseModel):
    id: uuid.UUID
    type: str
    title: str
    description: str
    reporter_name: str
    created_at: datetime
    has_screenshot: bool
    # The case number.
    issue_number: int
    # new | planned | done | declined
    status: str = "new"
    admin_note: str | None = None
    updated_at: datetime | None = None
    # Only on the reports made as GitHub issues before 3.1.0.
    issue_url: str | None = None


class FeedbackAdminOut(FeedbackOut):
    """What the server admin sees: the family, the reporter's role and the report's context."""
    family_name: str
    reporter_role: str
    page: str | None = None
    browser: str = ""
    viewport: str | None = None
    exported_at: datetime | None = None


class FeedbackChange(BaseModel):
    status: str | None = Field(default=None, pattern=r"^(new|planned|done|declined)$")
    admin_note: str | None = Field(default=None, max_length=2000)


class FeedbackExportIn(BaseModel):
    ids: list[uuid.UUID] = Field(min_length=1, max_length=50)


class FeedbackExportOut(BaseModel):
    title: str
    body: str
    # GitHub's "new issue" page, filled in; without the body when it would be too long to send.
    url: str
    body_in_url: bool


# --- Family goals ---

class FamilyRewardIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    points_required: int = Field(ge=1, le=1_000_000)


class FamilyRewardUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    points_required: int | None = Field(default=None, ge=1, le=1_000_000)


class FamilyRewardOut(ORMModel):
    id: uuid.UUID
    title: str
    description: str | None
    points_required: int
    # Family points collected towards the goal (capped at points_required).
    points: int = 0
    starts_at: datetime
    unlocked_at: datetime | None
    redeemed_at: datetime | None

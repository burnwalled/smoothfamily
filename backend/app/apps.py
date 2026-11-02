"""Which apps (menu sections) a member may use.

The family admin sets this per member (`users.app_access`, NULL = the role's default). It is
enforced in the backend: the routers of an app a member may not use answer 403. Today and the
profile are always available, and admins always have every app so they can't lock themselves out.
"""

APPS: tuple[str, ...] = (
    "calendar",
    "tasks",
    "chat",
    "allowance",
    "lists",
    "food",
    "smarthome",
    "property",
    "vehicles",
    "photos",
    "achievements",
    "birthdays",
    "shop",
    "medicine",
    "pets",
    "week",
    "documents",
    "emergency",
    "trips",
    "pantry",
)

# Apps a role doesn't get unless the admin turns them on.
ROLE_DEFAULT_OFF: dict[str, frozenset[str]] = {
    "child": frozenset({"property", "vehicles", "documents"}),
}


def allowed_apps(role: str, app_access: list[str] | None) -> list[str]:
    if role == "admin":
        return list(APPS)
    if app_access is not None:
        return [app for app in APPS if app in app_access]
    off = ROLE_DEFAULT_OFF.get(role, frozenset())
    return [app for app in APPS if app not in off]

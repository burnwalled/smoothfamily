"""Application settings, read from environment variables (.env in Docker Compose)."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Smooth Family"
    # When set, first-run setup requires this code (protects a fresh install exposed to the internet).
    setup_code: str = ""
    # Public HTTPS address (e.g. https://family.example.com). Passkeys are bound to its host name;
    # when empty (dev) the browser's Origin header is used.
    public_url: str = ""
    # The SearXNG that ships with the server (2.8.4); empty when there is none.
    searxng_url: str = ""
    database_url: str = "postgresql+asyncpg://smooth:smooth@db:5432/smoothfamily"
    redis_url: str = "redis://redis:6379/0"
    # The one secret everything else hangs on; the server refuses to start with this placeholder.
    secret_key: str = "change-me-in-.env"
    data_dir: str = "./data"
    access_token_expire_minutes: int = 60 * 24 * 14  # 14 days
    cookie_secure: bool = False  # true when running behind TLS
    ical_cache_ttl_seconds: int = 900  # 15 min
    ical_fetch_timeout_seconds: int = 15
    # Media storage
    storage_provider: str = "local"
    media_root: str = "/data/media"
    media_max_size_bytes: int = 500 * 1024 * 1024  # 500 MB

    # SL (Stockholm public transport) via Trafiklab's keyless SL Transport API
    sl_api_base: str = "https://transport.integration.sl.se/v1"
    sl_fetch_timeout_seconds: int = 10
    sl_departures_cache_ttl_seconds: int = 30
    sl_empty_cache_ttl_seconds: int = 10  # empty answers are often SL hiccups
    sl_last_known_ttl_seconds: int = 4 * 3600  # how long last known departures may stand in
    sl_sites_cache_ttl_seconds: int = 86400  # site list changes rarely

    # Backups made from the app (same folder as backup.sh) and the time zone for schedules.
    backup_dir: str = "/data/backup"
    # Updates of Postgres, Redis, Caddy and SearXNG (2.9.0): the folder shared with update.sh.
    updates_dir: str = "/data/updates"
    # The release running (from the install), shown in Server settings.
    app_version: str = ""
    timezone: str = "Europe/Stockholm"

    # Live updates over Redis pub/sub (off in tests, which run without Redis).
    live_events: bool = True
    notifications_keep_days: int = 60


@lru_cache
def get_settings() -> Settings:
    return Settings()

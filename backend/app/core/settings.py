"""Settings loaded from environment variables.

All configuration goes through this single source of truth. Never read os.environ
directly in the rest of the code; import settings from here.
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # --- App ---
    APP_ENV: Literal["development", "staging", "production"] = "development"
    APP_URL: str = "http://localhost:3000"
    API_URL: str = "http://localhost:8000"
    LOG_LEVEL: str = "INFO"

    # --- Database ---
    DATABASE_URL: str

    # --- Redis ---
    REDIS_URL: str = "redis://localhost:6379/0"

    # --- Clerk ---
    CLERK_SECRET_KEY: SecretStr
    CLERK_PUBLISHABLE_KEY: str
    CLERK_WEBHOOK_SECRET: SecretStr
    CLERK_JWT_ISSUER: str

    # --- Stripe ---
    STRIPE_SECRET_KEY: SecretStr
    STRIPE_WEBHOOK_SECRET: SecretStr
    STRIPE_PRICE_STANDARD_MONTHLY: str
    STRIPE_PRICE_STANDARD_YEARLY: str
    STRIPE_PRICE_PREMIUM_MONTHLY: str
    STRIPE_PRICE_PREMIUM_YEARLY: str

    # --- Email ---
    RESEND_API_KEY: SecretStr
    EMAIL_FROM: str = "Boet <noreply@boet.se>"

    # --- Sentry ---
    SENTRY_DSN: str = ""

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def is_development(self) -> bool:
        return self.APP_ENV == "development"


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton. Use this everywhere instead of instantiating Settings()."""
    return Settings()  # type: ignore[call-arg]

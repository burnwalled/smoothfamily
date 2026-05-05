"""Tier service – determines which features are available for a family.

Features are checked at request time, not "activated" via data migration.
This means:
- Upgrading a tier is a single status change; features become available immediately.
- Downgrading is equally trivial; features become unavailable.
- Trials work identically to paid tiers (handled via effective_tier).

CRITICAL: Always check has_feature() in endpoints that gate functionality.
"""

from datetime import datetime, timezone
from enum import StrEnum

# Forward reference – Family model lives in families/models.py and will exist after Sprint 1
# from app.families.models import Family


class Tier(StrEnum):
    STANDARD = "standard"
    PREMIUM = "premium"


class Feature(StrEnum):
    # --- Standard tier ---
    CALENDAR = "calendar"
    DASHBOARD = "dashboard"
    CHORES = "chores"
    CHAT = "chat"
    PHOTOS = "photos"
    VACCINATIONS = "vaccinations"

    # --- Premium tier ---
    AI_CHEF = "ai_chef"
    AI_SHOPPING = "ai_shopping"
    PROPERTY_TOOL = "property_tool"
    VEHICLE_TOOL = "vehicle_tool"
    HANDOVER_EXPORT = "handover_export"
    HOME_AUTOMATION = "home_automation"


_FEATURES_BY_TIER: dict[Tier, set[Feature]] = {
    Tier.STANDARD: {
        Feature.CALENDAR,
        Feature.DASHBOARD,
        Feature.CHORES,
        Feature.CHAT,
        Feature.PHOTOS,
        Feature.VACCINATIONS,
    },
    Tier.PREMIUM: {
        # Premium gets everything Standard has plus the premium features
        Feature.CALENDAR,
        Feature.DASHBOARD,
        Feature.CHORES,
        Feature.CHAT,
        Feature.PHOTOS,
        Feature.VACCINATIONS,
        Feature.AI_CHEF,
        Feature.AI_SHOPPING,
        Feature.PROPERTY_TOOL,
        Feature.VEHICLE_TOOL,
        Feature.HANDOVER_EXPORT,
        Feature.HOME_AUTOMATION,
    },
}


class TierService:
    """Stateless service for tier and feature checks."""

    @staticmethod
    def get_effective_tier(family: object) -> Tier:
        """Compute the family's effective tier, taking trials into account.

        Premium-trial trumps everything else. Otherwise, the persisted tier wins.

        family: A Family instance (typed as object here to avoid circular imports;
                will be Family from app.families.models after Sprint 1).
        """
        # Premium trial active?
        premium_trial_ends_at: datetime | None = getattr(family, "premium_trial_ends_at", None)
        if premium_trial_ends_at and premium_trial_ends_at > datetime.now(tz=timezone.utc):
            return Tier.PREMIUM

        # Otherwise, persisted tier
        tier_str: str = getattr(family, "tier", "standard")
        return Tier(tier_str)

    @classmethod
    def has_feature(cls, family: object, feature: Feature) -> bool:
        """Check if a family has access to a feature based on their effective tier."""
        effective_tier = cls.get_effective_tier(family)
        return feature in _FEATURES_BY_TIER[effective_tier]

    @classmethod
    def is_premium_trial_eligible(cls, family: object) -> bool:
        """Check if a family is eligible to start their Premium trial.

        Eligibility rules (must ALL be true):
        - Has not used Premium trial before
        - Currently on Standard tier (effectively)
        - Has been actively paying for at least 30 days (first_paid_at is set
          and is at least 30 days ago)
        """
        if getattr(family, "has_used_premium_trial", False):
            return False

        effective_tier = cls.get_effective_tier(family)
        if effective_tier != Tier.STANDARD:
            return False

        if getattr(family, "subscription_status", None) != "active":
            return False

        first_paid_at: datetime | None = getattr(family, "first_paid_at", None)
        if first_paid_at is None:
            return False

        days_paying = (datetime.now(tz=timezone.utc) - first_paid_at).days
        return days_paying >= 30

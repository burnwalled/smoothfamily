"""Tests for the tier service – feature gating and trial eligibility."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.billing.tier_service import Feature, Tier, TierService


@dataclass
class FakeFamily:
    """Stand-in for the Family ORM model in tier tests."""

    tier: str = "standard"
    subscription_status: str = "active"
    has_used_premium_trial: bool = False
    first_paid_at: datetime | None = None
    premium_trial_ends_at: datetime | None = None


def test_standard_family_has_calendar() -> None:
    family = FakeFamily(tier="standard")
    assert TierService.has_feature(family, Feature.CALENDAR)


def test_standard_family_does_not_have_ai() -> None:
    family = FakeFamily(tier="standard")
    assert not TierService.has_feature(family, Feature.AI_CHEF)


def test_premium_family_has_ai() -> None:
    family = FakeFamily(tier="premium")
    assert TierService.has_feature(family, Feature.AI_CHEF)


def test_premium_family_still_has_standard_features() -> None:
    family = FakeFamily(tier="premium")
    assert TierService.has_feature(family, Feature.CALENDAR)
    assert TierService.has_feature(family, Feature.CHORES)


def test_active_premium_trial_grants_premium_features() -> None:
    """A Standard family with an active Premium trial should see Premium features."""
    family = FakeFamily(
        tier="standard",
        premium_trial_ends_at=datetime.now(tz=timezone.utc) + timedelta(days=15),
    )
    assert TierService.get_effective_tier(family) == Tier.PREMIUM
    assert TierService.has_feature(family, Feature.AI_CHEF)


def test_expired_premium_trial_falls_back_to_standard() -> None:
    family = FakeFamily(
        tier="standard",
        premium_trial_ends_at=datetime.now(tz=timezone.utc) - timedelta(days=1),
    )
    assert TierService.get_effective_tier(family) == Tier.STANDARD
    assert not TierService.has_feature(family, Feature.AI_CHEF)


def test_premium_trial_eligible_after_30_days_paying() -> None:
    family = FakeFamily(
        tier="standard",
        subscription_status="active",
        first_paid_at=datetime.now(tz=timezone.utc) - timedelta(days=31),
    )
    assert TierService.is_premium_trial_eligible(family)


def test_premium_trial_not_eligible_during_first_month() -> None:
    family = FakeFamily(
        tier="standard",
        subscription_status="active",
        first_paid_at=datetime.now(tz=timezone.utc) - timedelta(days=15),
    )
    assert not TierService.is_premium_trial_eligible(family)


def test_premium_trial_not_eligible_if_already_used() -> None:
    family = FakeFamily(
        tier="standard",
        subscription_status="active",
        first_paid_at=datetime.now(tz=timezone.utc) - timedelta(days=60),
        has_used_premium_trial=True,
    )
    assert not TierService.is_premium_trial_eligible(family)


def test_premium_trial_not_eligible_if_already_premium() -> None:
    family = FakeFamily(
        tier="premium",
        subscription_status="active",
        first_paid_at=datetime.now(tz=timezone.utc) - timedelta(days=60),
    )
    assert not TierService.is_premium_trial_eligible(family)


def test_premium_trial_not_eligible_during_initial_trial() -> None:
    """Family that's still in their Standard trial (no first_paid_at) is not eligible."""
    family = FakeFamily(
        tier="standard",
        subscription_status="trialing",
        first_paid_at=None,
    )
    assert not TierService.is_premium_trial_eligible(family)

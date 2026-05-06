import pytest
from fastapi import HTTPException

from app.dashboard.service import validate_layout_payload


def test_validate_layout_payload_accepts_known_widgets() -> None:
    validate_layout_payload(
        [
            {"widget_type": "calendar_upcoming", "size": "large"},
            {"widget_type": "chat_unread", "size": "medium"},
            {"widget_type": "lists_open", "size": "full"},
        ]
    )


def test_validate_layout_payload_rejects_unknown_widget() -> None:
    with pytest.raises(HTTPException, match="Unknown widget type"):
        validate_layout_payload([{"widget_type": "unknown_widget", "size": "large"}])


def test_validate_layout_payload_rejects_invalid_size() -> None:
    with pytest.raises(HTTPException, match="not allowed"):
        validate_layout_payload([{"widget_type": "calendar_upcoming", "size": "small"}])


def test_validate_layout_payload_rejects_duplicates() -> None:
    with pytest.raises(HTTPException, match="Duplicate widget"):
        validate_layout_payload(
            [
                {"widget_type": "chat_unread", "size": "medium"},
                {"widget_type": "chat_unread", "size": "large"},
            ]
        )

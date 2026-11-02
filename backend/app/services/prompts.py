"""Builds copy-paste prompts for any external AI (Claude, ChatGPT, Gemini ...).

The user pastes the prompt into their AI of choice and pastes the JSON answer
back into the app. No API key, no vendor lock-in, no cloud dependency.

Prompts are written in English (every major AI handles English instructions
best) but instruct the AI to write user-facing content in the user's language.
"""
from datetime import date

from app.models import HomeProfile, Room, User

LANGUAGE_NAMES = {"en": "English", "sv": "Swedish", "nb": "Norwegian", "da": "Danish", "fi": "Finnish"}

DWELLING_LABELS = {"apartment": "apartment", "rowhouse": "row house", "villa": "detached house (villa)", "farm": "farm"}

ROOM_LABELS = {
    "kitchen": "kitchen", "bathroom": "bathroom", "toilet": "toilet", "bedroom": "bedroom",
    "living_room": "living room", "hallway": "hallway", "laundry_room": "laundry room",
    "garage": "garage", "garden": "garden", "other": "other",
}

SEASONS = {12: "winter", 1: "winter", 2: "winter", 3: "spring", 4: "spring", 5: "spring",
           6: "summer", 7: "summer", 8: "summer", 9: "autumn", 10: "autumn", 11: "autumn"}


def content_language(code: str) -> str:
    return LANGUAGE_NAMES.get(code, "English")


def chores_prompt(profile: HomeProfile | None, rooms: list[Room], members: list[User], language: str) -> str:
    dwelling = DWELLING_LABELS.get(profile.dwelling_type, "home") if profile else "home"
    garden = profile.has_garden if profile else False
    notes = (profile.notes or "").strip() if profile else ""

    room_lines = "\n".join(
        f"- {room.name} ({ROOM_LABELS.get(room.category, room.category)})" for room in rooms
    ) or "- (no rooms specified)"
    member_lines = "\n".join(
        f"- {m.display_name} ({'child' if m.role == 'child' else 'adult'})" for m in members
    )
    example_name = members[0].display_name if members else "Name"

    parts = [
        "You are helping a family create recurring household chores.",
        "",
        f"Home: {dwelling}" + (" with a garden" if garden else ""),
        f"Current season: {SEASONS[date.today().month]}",
        "",
        "Rooms:",
        room_lines,
        "",
        "Family members:",
        member_lines,
    ]
    if notes:
        parts += ["", f"Additional context: {notes}"]
    parts += [
        "",
        "Create 10-20 suitable chores. Rules:",
        f"- Write all titles and descriptions in {content_language(language)}.",
        "- Mix daily and weekly chores.",
        "- Points 5-50 based on effort.",
        "- Children get simpler chores with fewer points.",
        '- "assignee" is the name of a family member from the list above, or null if anyone can do it.',
        '- "recurrence" is "daily" or "weekly". Weekly chores have "weekday" 0-6 (0 = Monday); spread them across the week.',
        "- Include season-appropriate chores when the home calls for them (e.g. mowing the lawn, shoveling snow).",
        "",
        "Reply with ONLY the following JSON, no other text:",
        "",
        "```json",
        "{",
        '  "chores": [',
        '    {"title": "Do the dishes", "description": "Dishes and wipe the counters", "points": 10, "recurrence": "daily", "weekday": null, "assignee": null},',
        '    {"title": "Mow the lawn", "description": "Whole garden incl. edges", "points": 30, "recurrence": "weekly", "weekday": 5, "assignee": "' + example_name + '"}',
        "  ]",
        "}",
        "```",
    ]
    return "\n".join(parts)


def meals_prompt(week_start: date, servings: int, preferences: str, member_count: int, language: str, lunchboxes: int = 0, weekend_lunch: bool = False) -> str:
    parts = [
        "You are helping a family plan a week of dinners" + (" and lunches." if lunchboxes or weekend_lunch else "."),
        "",
        f"Week starting Monday {week_start.isoformat()}.",
        f"Servings per dinner: {servings} (family of {member_count}).",
    ]
    if preferences.strip():
        parts += [f"Preferences and dietary restrictions: {preferences.strip()}"]
    parts += [
        "",
        "Create 7 dinners (Monday-Sunday). Rules:",
        f"- Write all names, descriptions and steps in {content_language(language)}.",
        "- Vary protein sources and cuisines; weekday-friendly Mon-Thu, a bit more festive Fri-Sun.",
        "- Ingredients with amounts in metric units (g, kg, dl, l, pcs, tbsp, tsp, pack, can).",
        '- "weekday" is 0-6 where 0 = Monday.',
        "- Only include ingredients that need to be bought or measured - not salt, pepper or water.",
        '- Each ingredient MUST include "category" using one of: produce, bread, dairy, meat_fish, frozen, pantry, snacks, beverages, household, other.',
        '- Each meal MUST include "steps": 4-8 short numbered instructions, simple enough that a child can cook the dish with light supervision.',
        '- Each meal has a "slot": "dinner" for the dinners.',
    ]
    if lunchboxes:
        parts += [
            f"- Lunchboxes: {lunchboxes} per weekday (Monday-Friday), taken to work or school and eaten cold or reheated.",
            "  The dinner the evening before is cooked as a big batch (Sunday's for Monday, Monday's for Tuesday, and so on to Thursday's for Friday):",
            "  dishes that keep and reheat well - stews, casseroles, soups, curries, chilli, bolognese, pasta or rice bakes, meatballs, lentil dishes -",
            f"  not dishes that go soggy or must be eaten at once. Give those dinners servings + {lunchboxes}, with the ingredients for all of it.",
            f'  Add each lunchbox as its own meal: "slot": "lunchbox", the weekday it is eaten, servings {lunchboxes}, the name of the dinner it comes from,',
            "  a description saying it is the leftovers from the evening before, no ingredients, and 1-2 steps on packing and reheating.",
        ]
    if weekend_lunch:
        parts += [
            '- Lunch on Saturday and Sunday too: "slot": "lunch", simple and quick (soups, omelettes, sandwiches, salads, pancakes), '
            f"servings {servings}, with their own ingredients.",
        ]
    parts += [
        "",
        "Reply with ONLY the following JSON, no other text:",
        "",
        "```json",
        "{",
        '  "meals": [',
        "    {",
        '      "weekday": 0,',
        '      "slot": "dinner",',
        '      "name": "Pasta carbonara",',
        '      "description": "Weeknight classic, ready in 25 min",',
        f'      "servings": {servings},',
        '      "ingredients": [',
        '        {"name": "spaghetti", "amount": 400, "unit": "g", "category": "pantry"},',
        '        {"name": "pancetta", "amount": 150, "unit": "g", "category": "meat_fish"},',
        '        {"name": "eggs", "amount": 4, "unit": "pcs", "category": "dairy"}',
        "      ],",
        '      "steps": [',
        '        "Boil a large pot of salted water and cook the spaghetti until al dente.",',
        '        "Fry the pancetta in a dry pan until crispy, then set aside.",',
        '        "Beat the eggs in a bowl and mix in grated parmesan.",',
        '        "Drain the pasta, saving a cup of pasta water.",',
        '        "Remove pan from heat, add pasta to pancetta, then pour in egg mixture.",',
        '        "Stir quickly, adding pasta water a little at a time until creamy.",',
        '        "Season with black pepper and serve immediately."',
        "      ]",
        "    }",
        "  ]",
        "}",
        "```",
    ]
    return "\n".join(parts)

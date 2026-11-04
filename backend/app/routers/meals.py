"""Weekly meal planning, recipes, and shopping-list generation into Lists."""
import uuid
from collections import defaultdict
from datetime import date
import io

from fastapi import APIRouter, Body, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.deps import DB, CurrentUser, require_app
from app.models import Family, ListItem, ListModel, Meal, MealIngredient, MealPlan, Recipe, RecipeIngredient, Task, User
from app.schemas import (
    ImportResult,
    MealSettings,
    PlanMealIn,
    PlanFromRecipe,
    MealPlanImportRequest,
    MealPlanOut,
    PromptOut,
    RecipeCreate,
    RecipeOut,
    RecipeUpdate,
)
from app.services.ai_import import extract_json
from app.services.prompts import meals_prompt
from app.services import recipe_search
from app.services.images import open_image
from app.services.recipe_import import RecipeImportError, fetch_image, import_recipe, parse_ingredient_lines, parse_step_lines, NOT_IMPORTABLE, not_importable
from app.services.storage import get_storage

router = APIRouter(prefix="/api/meals", tags=["meals"], dependencies=[require_app("food")])

CAT_ORDER = [
    "produce",
    "bread",
    "dairy",
    "meat_fish",
    "frozen",
    "pantry",
    "snacks",
    "beverages",
    "household",
    "other",
]

SHOPPING_LIST_NAME_BY_LANG = {
    "en": "Shopping list wk {week}",
    "sv": "Inköpslista v.{week}",
    "nb": "Handleliste uke {week}",
    "da": "Indkøbsliste uge {week}",
    "fi": "Ostoslista vk {week}",
}

KEYWORD_FALLBACK = {
    "produce": ["apple", "banana", "tomato", "onion", "potato", "carrot", "lettuce", "äpple", "tomat", "lök", "potatis", "morot"],
    "bread": ["bread", "flour", "bun", "bröd", "mjöl", "fralla"],
    "dairy": ["milk", "cheese", "yogurt", "cream", "butter", "mjölk", "ost", "yoghurt", "grädde", "smör"],
    "meat_fish": ["chicken", "beef", "pork", "fish", "salmon", "kyckling", "nöt", "fläsk", "fisk", "lax"],
    "frozen": ["frozen", "ice cream", "fryst", "glass"],
    "pantry": ["rice", "pasta", "beans", "lentils", "oil", "salt", "sugar", "ris", "bönor", "linser", "olja", "socker"],
    "snacks": ["chips", "candy", "cookie", "snacks", "godis", "kakor"],
    "beverages": ["juice", "soda", "coffee", "tea", "water", "läsk", "kaffe", "te"],
    "household": ["detergent", "soap", "paper", "toilet", "diskmedel", "tvål", "papper", "toalett"],
}


def _list_name_for_week(language: str, week_start: date) -> str:
    week = week_start.isocalendar()[1]
    pattern = SHOPPING_LIST_NAME_BY_LANG.get(language, SHOPPING_LIST_NAME_BY_LANG["en"])
    return pattern.format(week=week)


def _normalize_category(raw: str | None, ingredient_name: str) -> str:
    if raw and raw in CAT_ORDER:
        return raw
    lower = ingredient_name.casefold()
    tokens = [tok.strip(".,:;!?()[]{}\"'") for tok in lower.replace("-", " ").split() if tok.strip()]
    for category, words in KEYWORD_FALLBACK.items():
        for word in words:
            w = word.casefold()
            if " " in w:
                if w in lower:
                    return category
            elif w in tokens:
                return category
    return "other"


def _fmt_amount(amount: float) -> str:
    return str(int(amount)) if amount == int(amount) else f"{amount:g}"


def _recipe_to_out(recipe: Recipe, ingredients: list[RecipeIngredient]) -> RecipeOut:
    return RecipeOut(
        id=recipe.id,
        name=recipe.name,
        description=recipe.description,
        servings=recipe.servings,
        photo_key=recipe.photo_key,
        steps=recipe.steps or [],
        source_url=recipe.source_url,
        category=recipe.category or "",
        favorite=bool(recipe.favorite),
        ingredients=[
            {
                "name": i.name,
                "amount": i.amount,
                "unit": i.unit,
                "category": i.category,
            }
            for i in ingredients
        ],
    )


def _monday(d: date) -> date:
    if d.weekday() != 0:
        raise HTTPException(status_code=422, detail="week_start must be a Monday")
    return d


async def _load_plan(db, family_id: uuid.UUID, week_start: date) -> MealPlan | None:
    return (
        await db.execute(
            select(MealPlan)
            .execution_options(populate_existing=True)
            .options(selectinload(MealPlan.meals).selectinload(Meal.ingredients))
            .where(MealPlan.family_id == family_id, MealPlan.week_start == week_start)
        )
    ).scalar_one_or_none()


@router.get("/prompt", response_model=PromptOut)
async def get_meals_prompt(
    user: CurrentUser,
    db: DB,
    week_start: date = Query(...),
    servings: int = Query(default=4, ge=1, le=20),
    preferences: str = Query(default="", max_length=500),
) -> PromptOut:
    _monday(week_start)
    member_count = (
        await db.execute(select(func.count(User.id)).where(User.family_id == user.family_id))
    ).scalar_one()
    family = await db.get(Family, user.family_id)
    return PromptOut(prompt=meals_prompt(week_start, servings, preferences, member_count, user.language, family.meal_lunchboxes, family.meal_weekend_lunch))


@router.get("/settings", response_model=MealSettings)
async def get_meal_settings(user: CurrentUser, db: DB) -> MealSettings:
    """What the week's plan covers besides dinners (3.2.0)."""
    family = await db.get(Family, user.family_id)
    return MealSettings(lunchboxes=family.meal_lunchboxes, weekend_lunch=family.meal_weekend_lunch)


@router.put("/settings", response_model=MealSettings)
async def put_meal_settings(payload: MealSettings, user: CurrentUser, db: DB) -> MealSettings:
    family = await db.get(Family, user.family_id)
    family.meal_lunchboxes, family.meal_weekend_lunch = payload.lunchboxes, payload.weekend_lunch
    await db.commit()
    return payload


@router.get("/plan", response_model=MealPlanOut | None)
async def get_plan(user: CurrentUser, db: DB, week_start: date = Query(...)) -> MealPlan | None:
    return await _load_plan(db, user.family_id, _monday(week_start))


@router.delete("/plan", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plan(user: CurrentUser, db: DB, week_start: date = Query(...)) -> None:
    plan = await _load_plan(db, user.family_id, _monday(week_start))
    if plan is None:
        raise HTTPException(status_code=404, detail="No plan for that week")
    await db.delete(plan)
    await db.commit()


@router.post("/import", response_model=MealPlanOut)
async def import_plan(
    user: CurrentUser,
    db: DB,
    week_start: date = Query(...),
    raw: str = Body(..., media_type="text/plain"),
) -> MealPlan:
    """Accepts the raw AI answer, replaces any existing plan for the week."""
    week = _monday(week_start)
    try:
        data = extract_json(raw)
        if isinstance(data, list):
            data = {"meals": data}
        data["week_start"] = week.isoformat()
        request = MealPlanImportRequest.model_validate(data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except ValidationError as exc:
        first = exc.errors()[0]
        location = ".".join(str(part) for part in first["loc"])
        raise HTTPException(status_code=422, detail=f"Invalid format at '{location}': {first['msg']}")

    existing = await _load_plan(db, user.family_id, week)
    if existing is not None:
        await db.delete(existing)
        await db.flush()

    plan = MealPlan(family_id=user.family_id, created_by=user.id, week_start=week)
    db.add(plan)
    await db.flush()
    for meal_item in request.meals:
        meal = Meal(
            meal_plan_id=plan.id,
            family_id=user.family_id,
            weekday=meal_item.weekday,
            slot=meal_item.slot,
            name=meal_item.name,
            description=meal_item.description,
            servings=meal_item.servings,
            steps=meal_item.steps,
        )
        db.add(meal)
        await db.flush()
        for ingredient in meal_item.ingredients:
            db.add(
                MealIngredient(
                    meal_id=meal.id,
                    family_id=user.family_id,
                    name=ingredient.name.strip(),
                    amount=ingredient.amount,
                    unit=(ingredient.unit or None),
                    category=_normalize_category(ingredient.category, ingredient.name),
                )
            )
    await db.commit()
    return await _load_plan(db, user.family_id, week)


@router.get("/recipes", response_model=list[RecipeOut])
async def list_recipes(user: CurrentUser, db: DB) -> list[RecipeOut]:
    from app.models import RecipeRating

    recipes = (
        await db.execute(select(Recipe).where(Recipe.family_id == user.family_id).order_by(Recipe.created_at.desc()))
    ).scalars().all()
    stars: dict = {}
    for r in (await db.execute(select(RecipeRating).where(RecipeRating.family_id == user.family_id))).scalars().all():
        stars.setdefault(r.recipe_id, []).append(r)
    out: list[RecipeOut] = []
    for recipe in recipes:
        ingredients = (
            await db.execute(select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id))
        ).scalars().all()
        row = _recipe_to_out(recipe, list(ingredients))
        given = stars.get(recipe.id, [])
        if given:
            row.rating = round(sum(r.stars for r in given) / len(given), 1)
            row.ratings = len(given)
            row.my_rating = next((r.stars for r in given if r.user_id == user.id), 0)
        out.append(row)
    return out


class RatingIn(BaseModel):
    # 1–5 stars; 0 takes my rating away.
    stars: int = Field(ge=0, le=5)


@router.put("/recipes/{recipe_id}/rating", status_code=status.HTTP_204_NO_CONTENT)
async def rate_recipe(recipe_id: uuid.UUID, payload: RatingIn, user: CurrentUser, db: DB) -> None:
    """Everyone in the family rates on their own – children too."""
    from app.models import RecipeRating

    recipe = await db.get(Recipe, recipe_id)
    if recipe is None or recipe.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Recipe not found")
    mine = (await db.execute(select(RecipeRating).where(RecipeRating.recipe_id == recipe.id, RecipeRating.user_id == user.id))).scalar_one_or_none()
    if payload.stars == 0:
        if mine is not None:
            await db.delete(mine)
    elif mine is None:
        db.add(RecipeRating(recipe_id=recipe.id, user_id=user.id, family_id=user.family_id, stars=payload.stars))
    else:
        mine.stars = payload.stars
    await db.commit()


@router.get("/recipes/at-home")
async def recipes_at_home(user: CurrentUser, db: DB) -> dict:
    """For each recipe: how many of its ingredients the pantry has (staples count as had)."""
    from app.models import PantryItem
    from app.services.pantry_match import is_staple, matches

    if "pantry" not in user.apps:
        return {}
    stock = (await db.execute(select(PantryItem.name).where(PantryItem.family_id == user.family_id))).scalars().all()
    rows = (await db.execute(select(RecipeIngredient).where(RecipeIngredient.family_id == user.family_id))).scalars().all()
    out: dict[str, dict] = {}
    for ing in rows:
        entry = out.setdefault(str(ing.recipe_id), {"have": 0, "total": 0, "missing": []})
        entry["total"] += 1
        if is_staple(ing.name) or any(matches(ing.name, s) for s in stock):
            entry["have"] += 1
        elif len(entry["missing"]) < 5:
            entry["missing"].append(ing.name)
    return out


@router.post("/recipes", response_model=RecipeOut, status_code=status.HTTP_201_CREATED)
async def create_recipe(payload: RecipeCreate, user: CurrentUser, db: DB) -> RecipeOut:
    return await save_recipe(db, user, payload)


async def save_recipe(db, user, payload: RecipeCreate) -> RecipeOut:
    """A new recipe in the family's collection (also used for recipes the local AI read)."""
    recipe = Recipe(
        family_id=user.family_id,
        name=payload.name.strip(),
        description=payload.description,
        servings=payload.servings,
        steps=payload.steps,
        source_url=payload.source_url or None,
        category=payload.category,
        created_by=user.id,
    )
    db.add(recipe)
    await db.flush()
    for ingredient in payload.ingredients:
        db.add(
            RecipeIngredient(
                recipe_id=recipe.id,
                family_id=user.family_id,
                name=ingredient.name.strip(),
                amount=ingredient.amount,
                unit=ingredient.unit,
                category=_normalize_category(ingredient.category, ingredient.name),
            )
        )
    await db.commit()
    ingredients = (
        await db.execute(select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id))
    ).scalars().all()
    return _recipe_to_out(recipe, list(ingredients))


@router.patch("/recipes/{recipe_id}", response_model=RecipeOut)
async def update_recipe(recipe_id: uuid.UUID, payload: RecipeUpdate, user: CurrentUser, db: DB) -> RecipeOut:
    recipe = await db.get(Recipe, recipe_id)
    if recipe is None or recipe.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Recipe not found")
    data = payload.model_dump(exclude_unset=True)
    # Sorting the recipe book (category, favourite) is for every adult; the recipe itself for its maker.
    if recipe.created_by != user.id and user.role != "admin" and not (set(data) <= {"category", "favorite"} and user.role in ("admin", "adult")):
        raise HTTPException(status_code=403, detail="Only creator or admin can edit recipe")
    if "source_url" in data:
        data["source_url"] = data["source_url"] or None
    ingredients_payload = data.pop("ingredients", None)
    for field, value in data.items():
        setattr(recipe, field, value)

    if ingredients_payload is not None:
        old = (
            await db.execute(select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id))
        ).scalars().all()
        for row in old:
            await db.delete(row)
        for ingredient in ingredients_payload:
            db.add(
                RecipeIngredient(
                    recipe_id=recipe.id,
                    family_id=user.family_id,
                    name=ingredient["name"].strip(),
                    amount=ingredient.get("amount"),
                    unit=ingredient.get("unit"),
                    category=_normalize_category(ingredient.get("category"), ingredient["name"]),
                )
            )

    await db.commit()
    ingredients = (
        await db.execute(select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id))
    ).scalars().all()
    return _recipe_to_out(recipe, list(ingredients))


@router.delete("/recipes/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recipe(recipe_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    recipe = await db.get(Recipe, recipe_id)
    if recipe is None or recipe.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Recipe not found")
    if recipe.created_by != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Only creator or admin can delete recipe")
    await db.delete(recipe)
    await db.commit()


@router.post("/recipes/from-meal/{meal_id}", response_model=RecipeOut, status_code=status.HTTP_201_CREATED)
async def save_recipe_from_meal(meal_id: uuid.UUID, user: CurrentUser, db: DB) -> RecipeOut:
    meal = await db.get(Meal, meal_id)
    if meal is None or meal.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Meal not found")
    ingredients = (
        await db.execute(select(MealIngredient).where(MealIngredient.meal_id == meal.id))
    ).scalars().all()
    recipe = Recipe(
        family_id=user.family_id,
        name=meal.name,
        description=meal.description,
        servings=meal.servings,
        steps=meal.steps or [],
        created_by=user.id,
    )
    db.add(recipe)
    await db.flush()
    for ingredient in ingredients:
        db.add(
            RecipeIngredient(
                recipe_id=recipe.id,
                family_id=user.family_id,
                name=ingredient.name,
                amount=ingredient.amount,
                unit=ingredient.unit,
                category=_normalize_category(ingredient.category, ingredient.name),
            )
        )
    await db.commit()
    created_ingredients = (
        await db.execute(select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id))
    ).scalars().all()
    return _recipe_to_out(recipe, list(created_ingredients))


@router.post("/plan/from-recipe/{recipe_id}", response_model=MealPlanOut)
async def add_meal_from_recipe(recipe_id: uuid.UUID, payload: PlanFromRecipe, user: CurrentUser, db: DB) -> MealPlan:
    week = _monday(payload.week_start)
    recipe = await db.get(Recipe, recipe_id)
    if recipe is None or recipe.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Recipe not found")
    ingredients = (
        await db.execute(select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id))
    ).scalars().all()

    plan = await _load_plan(db, user.family_id, week)
    if plan is None:
        plan = MealPlan(family_id=user.family_id, created_by=user.id, week_start=week)
        db.add(plan)
        await db.flush()

    existing_meal = (
        await db.execute(select(Meal).where(Meal.meal_plan_id == plan.id, Meal.weekday == payload.weekday, Meal.slot == payload.slot))
    ).scalars().first()

    if existing_meal is None:
        existing_meal = Meal(
            meal_plan_id=plan.id,
            family_id=user.family_id,
            weekday=payload.weekday,
            slot=payload.slot,
            name=recipe.name,
            description=recipe.description,
            servings=recipe.servings,
            steps=recipe.steps or [],
        )
        db.add(existing_meal)
        await db.flush()
    else:
        existing_meal.name = recipe.name
        existing_meal.description = recipe.description
        existing_meal.servings = recipe.servings
        existing_meal.steps = recipe.steps or []
        old_ing = (
            await db.execute(select(MealIngredient).where(MealIngredient.meal_id == existing_meal.id))
        ).scalars().all()
        for row in old_ing:
            await db.delete(row)

    for ingredient in ingredients:
        db.add(
            MealIngredient(
                meal_id=existing_meal.id,
                family_id=user.family_id,
                name=ingredient.name,
                amount=ingredient.amount,
                unit=ingredient.unit,
                category=_normalize_category(ingredient.category, ingredient.name),
            )
        )

    await db.commit()
    return await _load_plan(db, user.family_id, week)


@router.put("/plan/meal", response_model=MealPlanOut | None)
async def set_meal(payload: PlanMealIn, user: CurrentUser, db: DB) -> MealPlan | None:
    """One meal written by hand (3.2.0) – "Tacos" on Friday – or taken away when the name is empty. A
    recipe of the same name in the book brings its ingredients and steps."""
    week = _monday(payload.week_start)
    name = (payload.name or "").strip()
    recipe = (
        (await db.execute(select(Recipe).where(Recipe.family_id == user.family_id, func.lower(Recipe.name) == name.lower()))).scalars().first()
        if name
        else None
    )
    if recipe is not None:
        return await add_meal_from_recipe(recipe.id, PlanFromRecipe(week_start=week, weekday=payload.weekday, slot=payload.slot), user, db)
    plan = await _load_plan(db, user.family_id, week)
    meal = next((m for m in plan.meals if m.weekday == payload.weekday and m.slot == payload.slot), None) if plan else None
    if not name:
        if meal is not None:
            await db.delete(meal)
            await db.commit()
        return await _load_plan(db, user.family_id, week)
    if plan is None:
        plan = MealPlan(family_id=user.family_id, created_by=user.id, week_start=week)
        db.add(plan)
        await db.flush()
    if meal is None:
        db.add(Meal(meal_plan_id=plan.id, family_id=user.family_id, weekday=payload.weekday, slot=payload.slot, name=name, steps=[]))
    elif meal.name != name:
        # Another dish: what belonged to the old one goes.
        meal.name, meal.description, meal.steps = name, None, []
        for row in list(meal.ingredients):
            await db.delete(row)
    await db.commit()
    return await _load_plan(db, user.family_id, week)


def _save_photo(recipe: Recipe, data: bytes) -> None:
    """A square 256 px JPEG of the picture becomes the recipe photo."""
    from PIL import Image

    img = open_image(data)
    img.draft("RGB", (1024, 1024))
    img = img.convert("RGB")
    w, h = img.size
    edge = min(w, h)
    left = (w - edge) // 2
    top = (h - edge) // 2
    cropped = img.crop((left, top, left + edge, top + edge)).resize((256, 256), Image.LANCZOS)

    buf = io.BytesIO()
    cropped.save(buf, "JPEG", quality=85)
    buf.seek(0)
    key = f"recipes/{recipe.id}/photo.jpg"
    get_storage().save(recipe.family_id, key, buf)
    recipe.photo_key = key


class RecipeFromUrl(BaseModel):
    url: str = Field(min_length=8, max_length=2000, pattern=r"^https?://")


class RecipeFromText(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    servings: int = Field(default=4, ge=1, le=20)
    ingredients: str = Field(default="", max_length=20000)
    steps: str = Field(default="", max_length=50000)
    source_url: str | None = Field(default=None, max_length=2000, pattern=r"^$|^https?://")


@router.post("/recipes/from-text", response_model=RecipeOut, status_code=status.HTTP_201_CREATED)
async def recipe_from_text(payload: RecipeFromText, user: CurrentUser, db: DB) -> RecipeOut:
    """For pages the link import can't read: ingredients and steps pasted as text, one per line."""
    recipe = Recipe(
        family_id=user.family_id,
        name=payload.name.strip(),
        source_url=payload.source_url or None,
        servings=payload.servings,
        steps=parse_step_lines(payload.steps),
        created_by=user.id,
    )
    db.add(recipe)
    await db.flush()
    for ingredient in parse_ingredient_lines(payload.ingredients):
        db.add(
            RecipeIngredient(
                recipe_id=recipe.id,
                family_id=user.family_id,
                name=ingredient.name,
                amount=ingredient.amount,
                unit=ingredient.unit,
                category=_normalize_category(None, ingredient.name),
            )
        )
    await db.commit()
    ingredients = (
        await db.execute(select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id))
    ).scalars().all()
    return _recipe_to_out(recipe, list(ingredients))


class RecipeHit(BaseModel):
    title: str
    url: str
    site: str
    snippet: str
    # False for a site whose recipes can't be imported right now (see NOT_IMPORTABLE).
    importable: bool = True


@router.get("/recipes/search/status")
async def recipe_search_status(user: CurrentUser, db: DB) -> dict:
    """Whether the server can search the web for recipes (its admin has set up SearXNG), and the sites
    whose recipes can't be imported right now (their buttons are greyed out)."""
    return {"enabled": await recipe_search.get_url(db) is not None, "not_importable": NOT_IMPORTABLE}


@router.get("/recipes/search", response_model=list[RecipeHit])
async def search_recipes(user: CurrentUser, db: DB, q: str = Query(min_length=2, max_length=120)) -> list[RecipeHit]:
    """Recipe pages on the web for the words – only the words leave the server."""
    url = await recipe_search.get_url(db)
    if url is None:
        raise HTTPException(status_code=404, detail="Recipe search isn't set up on this server")
    try:
        hits = await recipe_search.search(url, q, user.language or "en")
    except recipe_search.RecipeSearchError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [RecipeHit(**h.__dict__, importable=not not_importable(h.url)) for h in hits]


@router.post("/recipes/from-url", response_model=RecipeOut, status_code=status.HTTP_201_CREATED)
async def recipe_from_url(payload: RecipeFromUrl, user: CurrentUser, db: DB) -> RecipeOut:
    """Reads the recipe (schema.org) on the page and saves it, with its photo when possible."""
    unsupported = not_importable(payload.url)
    if unsupported:
        raise HTTPException(status_code=422, detail=f"{unsupported} – paste the recipe's text or let the local AI read a screenshot")
    try:
        parsed = await import_recipe(payload.url)
    except RecipeImportError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=422, detail="The page could not be read")
    recipe = Recipe(
        family_id=user.family_id,
        name=parsed.name,
        description=parsed.description,
        servings=parsed.servings,
        steps=parsed.steps,
        source_url=payload.url.strip(),
        created_by=user.id,
    )
    db.add(recipe)
    await db.flush()
    for ingredient in parsed.ingredients:
        db.add(
            RecipeIngredient(
                recipe_id=recipe.id,
                family_id=user.family_id,
                name=ingredient.name,
                amount=ingredient.amount,
                unit=ingredient.unit,
                category=_normalize_category(None, ingredient.name),
            )
        )
    if parsed.image_url:
        image = await fetch_image(parsed.image_url)
        if image is not None:
            try:
                _save_photo(recipe, image[0])
            except Exception:
                pass  # a broken picture doesn't stop the recipe
    await db.commit()
    ingredients = (
        await db.execute(select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id))
    ).scalars().all()
    return _recipe_to_out(recipe, list(ingredients))


@router.post("/recipes/{recipe_id}/photo", response_model=RecipeOut)
async def upload_recipe_photo(recipe_id: uuid.UUID, file: UploadFile, user: CurrentUser, db: DB) -> RecipeOut:
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=422, detail="Only image files are supported")
    recipe = await db.get(Recipe, recipe_id)
    if recipe is None or recipe.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Recipe not found")
    if recipe.created_by != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Only creator or admin can edit recipe")

    _save_photo(recipe, await file.read())
    await db.commit()

    ingredients = (
        await db.execute(select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id))
    ).scalars().all()
    return _recipe_to_out(recipe, list(ingredients))


@router.get("/recipes/{recipe_id}/photo")
async def get_recipe_photo(recipe_id: uuid.UUID, user: CurrentUser, db: DB):
    recipe = await db.get(Recipe, recipe_id)
    if recipe is None or recipe.family_id != user.family_id or not recipe.photo_key:
        raise HTTPException(status_code=404, detail="Recipe photo not found")
    storage = get_storage()
    path = storage.open(user.family_id, recipe.photo_key)

    def _iter():
        with open(path, "rb") as f:
            while chunk := f.read(65536):
                yield chunk

    return StreamingResponse(_iter(), media_type="image/jpeg")


@router.post("/plan/shopping-list", response_model=ImportResult)
async def generate_shopping_list(user: CurrentUser, db: DB, week_start: date = Query(...)) -> ImportResult:
    """Aggregate ingredients into a week-named list and linked one-off task."""
    week = _monday(week_start)
    plan = await _load_plan(db, user.family_id, week)
    if plan is None:
        raise HTTPException(status_code=404, detail="No plan for that week")

    list_name = _list_name_for_week(user.language, week)
    due_sunday = date.fromordinal(week.toordinal() + 6)

    family = await db.get(Family, user.family_id)

    shopping_list = (
        await db.execute(
            select(ListModel).where(
                ListModel.family_id == user.family_id,
                ListModel.name == list_name,
            )
            .order_by(ListModel.created_at)
            .limit(1)
        )
    ).scalar_one_or_none()
    if shopping_list is None:
        shopping_list = ListModel(
            family_id=user.family_id,
            name=list_name,
            allowed_user_ids=[],
            created_by=user.id,
            archived=False,
        )
        db.add(shopping_list)
        await db.flush()

    if shopping_list.linked_task_id is not None:
        linked_task = await db.get(Task, shopping_list.linked_task_id)
    else:
        linked_task = None
    if linked_task is None:
        linked_task = Task(
            family_id=user.family_id,
            created_by=user.id,
            title=list_name,
            description="Shopping task linked to generated list",
            points=family.shopping_task_points,
            recurrence="none",
            due_date=due_sunday,
            active=True,
        )
        db.add(linked_task)
        await db.flush()
        shopping_list.linked_task_id = linked_task.id
    else:
        linked_task.title = list_name
        linked_task.points = family.shopping_task_points
        linked_task.recurrence = "none"
        linked_task.due_date = due_sunday
        linked_task.active = True

    existing_items = (
        await db.execute(select(ListItem).where(ListItem.list_id == shopping_list.id, ListItem.family_id == user.family_id))
    ).scalars().all()
    for item in existing_items:
        await db.delete(item)

    totals: dict[tuple[str, str | None, str], float] = defaultdict(float)
    no_amount: dict[tuple[str, str], None] = {}
    for meal in plan.meals:
        for ingredient in meal.ingredients:
            key_name = ingredient.name.strip().lower()
            category = _normalize_category(ingredient.category, ingredient.name)
            if ingredient.amount is None:
                no_amount[(key_name, category)] = None
            else:
                totals[(key_name, (ingredient.unit or "").strip().lower() or None, category)] += ingredient.amount

    created = 0
    next_position = 0
    for (name, unit, category), amount in sorted(totals.items(), key=lambda x: (CAT_ORDER.index(x[0][2]), x[0][0])):
        label = f"{name} {_fmt_amount(amount)} {unit}".strip() if unit else f"{name} {_fmt_amount(amount)}"
        db.add(
            ListItem(
                list_id=shopping_list.id,
                family_id=user.family_id,
                name=label,
                category=category,
                position=next_position,
            )
        )
        next_position += 1
        created += 1
    for (name, category) in sorted(no_amount.keys(), key=lambda x: (CAT_ORDER.index(x[1]), x[0])):
        if not any(key[0] == name for key in totals):
            db.add(
                ListItem(
                    list_id=shopping_list.id,
                    family_id=user.family_id,
                    name=name,
                    category=category,
                    position=next_position,
                )
            )
            next_position += 1
            created += 1
    await db.commit()
    return ImportResult(imported=created)

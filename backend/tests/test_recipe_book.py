"""2.8.4: the recipe book – source link, category, favourite and everyone's own stars; sites that can't
be imported; what's at home; and the pantry counted down after cooking."""
import pytest

pytestmark = pytest.mark.asyncio


async def _family(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    for name, role in (("bo", "adult"), ("leo", "child")):
        assert (await client.post("/api/family/members", json={"display_name": name.title(), "username": name, "password": "pass1234", "role": role})).status_code == 201


async def _login(client, username, password="pass1234"):
    await client.post("/api/auth/logout")
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


async def test_the_book_with_source_category_favourite_and_stars(client):
    await _family(client)
    recipe = (await client.post("/api/meals/recipes", json={"name": "Lasagne", "source_url": "https://www.arla.se/recept/lasagne/", "category": "weekend"})).json()
    assert recipe["source_url"] == "https://www.arla.se/recept/lasagne/" and recipe["category"] == "weekend"
    assert (await client.post("/api/meals/recipes", json={"name": "X", "category": "nonsense"})).status_code == 422

    # Another adult may sort the book (favourite, category), not change the recipe.
    await _login(client, "bo")
    assert (await client.patch(f"/api/meals/recipes/{recipe['id']}", json={"favorite": True})).status_code == 200
    assert (await client.patch(f"/api/meals/recipes/{recipe['id']}", json={"name": "Mine now"})).status_code == 403
    assert (await client.put(f"/api/meals/recipes/{recipe['id']}/rating", json={"stars": 4})).status_code == 204

    # Everyone rates on their own – children too.
    await _login(client, "leo")
    assert (await client.put(f"/api/meals/recipes/{recipe['id']}/rating", json={"stars": 5})).status_code == 204
    row = (await client.get("/api/meals/recipes")).json()[0]
    assert row["favorite"] and row["rating"] == 4.5 and row["ratings"] == 2 and row["my_rating"] == 5
    assert (await client.put(f"/api/meals/recipes/{recipe['id']}/rating", json={"stars": 0})).status_code == 204
    row = (await client.get("/api/meals/recipes")).json()[0]
    assert row["rating"] == 4 and row["ratings"] == 1 and row["my_rating"] == 0


async def test_sites_that_cant_be_imported_say_so_at_once(client):
    await _family(client)
    status = (await client.get("/api/meals/recipes/search/status")).json()
    assert set(status["not_importable"]) == {"ica.se", "coop.se"}
    refused = await client.post("/api/meals/recipes/from-url", json={"url": "https://www.ica.se/recept/klassisk-lasagne-679675/"})
    assert refused.status_code == 422 and "ICA" in refused.json()["detail"]


async def test_what_is_at_home_and_the_pantry_after_cooking(client):
    await _family(client)
    recipe = (await client.post("/api/meals/recipes", json={"name": "Pannkakor", "ingredients": [
        {"name": "vetemjöl", "amount": 2.5, "unit": "dl"}, {"name": "mjölk", "amount": 6, "unit": "dl"},
        {"name": "ägg", "amount": 3, "unit": "st"}, {"name": "salt", "amount": None, "unit": None},
    ]})).json()
    flour = (await client.post("/api/pantry", json={"name": "Mjöl", "amount": 2000, "unit": "g", "place": "pantry"})).json()
    milk = (await client.post("/api/pantry", json={"name": "Mjölk 3 %", "amount": 1, "unit": "l", "place": "fridge"})).json()

    at_home = (await client.get("/api/meals/recipes/at-home")).json()[recipe["id"]]
    assert at_home == {"have": 3, "total": 4, "missing": ["ägg"]}

    matched = (await client.post("/api/pantry/match", json={"ingredients": ["vetemjöl", "mjölk", "ägg", "salt"]})).json()
    assert {m["ingredient"]: [i["id"] for i in m["items"]] for m in matched} == {"vetemjöl": [flour["id"]], "mjölk": [milk["id"]]}

    # The milk is used up; a quarter of the flour is left.
    assert (await client.post("/api/pantry/use", json={"items": [{"item_id": milk["id"], "left_pct": 0}, {"item_id": flour["id"], "left_pct": 25}]})).status_code == 204
    left = (await client.get("/api/pantry")).json()
    assert [(i["name"], i["amount"]) for i in left] == [("Mjöl", 500)]

# 03: Add a cat with its RFID tag

**What to build:** The owner app can register a cat by name and RFID tag, and list the owner's cats. The tag is how feeding events will later show which cat likely visited (shared bowl, so "likely visitor", never a certain ID). Tags are unique across the system.

**Blocked by:** 01 (Log in)

**Status:** done

- [x] `POST /cats` with a name and an uppercase hex tag returns `201` with the cat
- [x] Registering a tag that already exists returns `409` with code `conflict`
- [x] A missing name or a badly formatted tag returns `422` naming the field
- [x] `GET /cats` returns only the caller's cats (the admin sees all)
- [x] The seed adds two cats with tags to the seeded owner

## Comments

**22 Oct 2026, done.** `npm test` (46 tests; 10 in `tests/add-a-cat.test.ts`, at the agreed seam: the HTTP API) passes against `docker compose up` after `npm run reset`. Notes:

- Seeded cats: Mochi `E200001A` and Tora `E200001B` (the spec's example tag), owned by the seeded owner.
- A duplicate tag is caught by the database's unique constraint (`ON CONFLICT DO NOTHING`), so two requests at once still get one `201` and one `409`.
- A cat the admin registers belongs to the admin (`CatInput` has no owner field). Cats cannot be edited or deleted yet; tests and Postman use a fresh random tag each run.

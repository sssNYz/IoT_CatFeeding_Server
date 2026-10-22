# 03: Add a cat with its RFID tag

**What to build:** The owner app can register a cat by name and RFID tag, and list the owner's cats. The tag is how feeding events will later show which cat likely visited (shared bowl, so "likely visitor", never a certain ID). Tags are unique across the system.

**Blocked by:** 01 (Log in)

**Status:** ready-for-agent

- [ ] `POST /cats` with a name and an uppercase hex tag returns `201` with the cat
- [ ] Registering a tag that already exists returns `409` with code `conflict`
- [ ] A missing name or a badly formatted tag returns `422` naming the field
- [ ] `GET /cats` returns only the caller's cats (the admin sees all)
- [ ] The seed adds two cats with tags to the seeded owner

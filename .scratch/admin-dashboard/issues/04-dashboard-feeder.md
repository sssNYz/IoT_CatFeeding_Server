# 04: Dashboard feeder page

**What to build:** `/admin/feeders/{id}`: the feeder's status, its schedules (add, edit, enable/disable, delete) and a "Feed now" button that shows "Feeding…" until the command is done, then "Done" (or "Feeder did not respond" after about 60 s). Uses the same API as the owner app, so a change here reaches the feeder exactly as from the phone.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Adding or editing a schedule publishes the new set; the page shows "Waiting for feeder…" until the feeder reports the new `schedule_version`, then "Synced"
- [ ] "Feed now" shows "Done" once the feeder's `remote` event arrives
- [ ] With no feeder online, "Feed now" ends with "Feeder did not respond"

Seam: Playwright in a real browser, as in 02.

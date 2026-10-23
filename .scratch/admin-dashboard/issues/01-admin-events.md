# 01: All feeding events for the admin

**What to build:** `GET /admin/events` lists feeding events across every feeder, newest `occurred_at` first, each with the exact MQTT payload the feeder sent (`raw`), so the admin can see what a feeder really published when something looks wrong. Filters: `feeder`, `result`, and the same `from` / `to` / `since` / `limit` as the owner history. Admin only.

**Blocked by:** none

**Status:** done

- [x] The admin gets events from all feeders in the contract's `AdminEvent` shape, `raw` equal to the payload sent
- [x] `feeder=` and `result=` narrow the list; `since` works as in the history (late events from an outage still appear)
- [x] An owner gets `403`; an unknown `result` value gets `422`

Seam: black-box HTTP + MQTT tests, as in server-core.

## Comments

**23 Oct 2026, done.** `npm test` (99 tests; 6 in `tests/admin-events.test.ts`: the test plays feeder01 over MQTT and calls the API) and Newman over `https://catfeeder-g05.duckdns.org` pass. The first test went red (404) before the route existed. The filter, `since`, 403 and 422 tests passed on their first run: the filters were built into the shared event query in that first slice.

- The owner history, the CSV export and this list share one query and one row mapping, so all three show the same values. Only this one adds `raw`.
- `AdminEventsQuery` is now a named contract schema used by both the route and `openapi.json` (no change to the generated file).

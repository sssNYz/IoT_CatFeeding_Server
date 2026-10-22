# 06: Feed now

**What to build:** The owner taps "Feed now" and sees "Feeding…" change to "Done", then the new feeding at the top of history. The server creates a `command_id`, publishes the command to the feeder's `command/feed` topic (QoS 1, **not** retained, with `issued_at`), and answers `202`: sent, not done. When a feeding event carrying that `command_id` arrives, the command is marked done with its `event_id`.

The fake feeder answers commands with a `remote` feeding event and ignores any command older than 60 seconds, as the real ESP32 must, so an old tap can never release food hours later.

**Blocked by:** 05 (Feeding history)

**Status:** done

- [x] `POST /feeders/{id}/commands/feed` returns `202` with a `command_id`, `status: sent` and a Thai-time `issued_at`
- [x] With the fake feeder running, `GET /feeders/{id}/commands/{command_id}` becomes `done` with the `event_id` within a few seconds
- [x] The resulting event appears in history with `trigger: remote` and the same `command_id`
- [x] With the fake feeder stopped, the command stays `sent` and the feeder does not act on it when it reconnects more than 60 s later
- [x] `portion_g` outside 5–100 returns `422`; another owner's feeder returns `403`

## Comments

**23 Oct 2026, done** (overnight, with the user's go-ahead to commit and push when green). `npm test` (61 tests; 8 in `tests/feed-now.test.ts` at the agreed seam: the test plays feeder01 over MQTT and calls the API) passes against `docker compose up`. Checked by hand with the fake feeder:

- Running: Feed now goes `sent` → `done` in 0.3 s; the event is `trigger: remote` with the same `command_id` (24.7 g of 25).
- Stopped: a command sent while it is off never reaches it after 65 s, because the feeder uses a clean MQTT session, so the broker keeps nothing for it; the command stays `sent`.
- A command that does reach it but is 2 minutes old (published straight to the topic) is ignored ("issued 120 s ago"). That is the second guard of rule 9, for a board whose session did keep it.

Notes:

- `command_id` is `cmd-` + a UUID (spec rule 3 says UUID; the contract example starts with `cmd-`).
- The first feeding event with a command's `command_id` marks it done; a resend of that event is a duplicate and changes nothing.
- No timeout on the server: a command the feeder never acted on stays `sent` forever. The owner app should stop showing "Feeding…" after about 60 s.

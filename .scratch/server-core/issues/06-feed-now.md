# 06: Feed now

**What to build:** The owner taps "Feed now" and sees "Feeding…" change to "Done", then the new feeding at the top of history. The server creates a `command_id`, publishes the command to the feeder's `command/feed` topic (QoS 1, **not** retained, with `issued_at`), and answers `202`: sent, not done. When a feeding event carrying that `command_id` arrives, the command is marked done with its `event_id`.

The fake feeder answers commands with a `remote` feeding event and ignores any command older than 60 seconds, as the real ESP32 must, so an old tap can never release food hours later.

**Blocked by:** 05 (Feeding history)

**Status:** ready-for-agent

- [ ] `POST /feeders/{id}/commands/feed` returns `202` with a `command_id`, `status: sent` and a Thai-time `issued_at`
- [ ] With the fake feeder running, `GET /feeders/{id}/commands/{command_id}` becomes `done` with the `event_id` within a few seconds
- [ ] The resulting event appears in history with `trigger: remote` and the same `command_id`
- [ ] With the fake feeder stopped, the command stays `sent` and the feeder does not act on it when it reconnects more than 60 s later
- [ ] `portion_g` outside 5–100 returns `422`; another owner's feeder returns `403`

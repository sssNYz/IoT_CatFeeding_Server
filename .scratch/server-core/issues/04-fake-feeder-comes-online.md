# 04: Fake feeder comes online

**What to build:** A fake feeder script plays `feeder01` over MQTT so the owner app can see a live feeder before any hardware exists. The server's MQTT bridge starts with the app, tracks each feeder's online/offline state from the retained `status` topic and its Last Will, and records the schedule version the feeder says it applied. The owner app sees the feeder go online, go offline when the script stops, and sees "Waiting for feeder…" turn into "Synced ✓" after a schedule change.

Mosquitto rejects anonymous clients; the server and each feeder have their own login, and the ACL limits a feeder to its own topics (username = device_id). The fake feeder speaks exactly the MQTT payloads in the spec, so the real ESP32 can copy its behaviour.

**Blocked by:** 02 (Set schedules)

**Status:** done

- [x] Starting the fake feeder makes `GET /feeders/{id}/status` show `online` with a Thai-time `last_seen` and `fw`
- [x] Killing the fake feeder (no clean disconnect) flips the status to `offline` through the Last Will
- [x] The fake feeder receives the retained schedule set on connect and after every change, then reports the applied schedule version in its status
- [x] `synced` is `false` right after a schedule change and becomes `true` once the fake feeder reports that version
- [x] Anonymous MQTT clients are refused, and the `feeder01` login cannot publish to another feeder's topics
- [x] One command starts the fake feeder against the local stack

## Comments

**22 Oct 2026, done.** `npm test` (36 tests) passes against `docker compose up`. Agreed seam for automated tests: the API ↔ feeder MQTT boundary (`tests/feeder-comes-online.test.ts` plays feeder01 with its own login and a Last Will, and reads `GET /feeders/{id}/status`). The fake feeder script and the broker's security were checked by hand, not by tests:

- `npm run fake-feeder`: online with `fw` and Thai-time `last_seen`, applies the retained set on connect and after each change, `synced` turns true within a second; `kill -9 <pid>` → `offline` within a second (the kernel closes the socket, so the broker sends the will at once; a real power cut takes up to 1.5 × keepalive = ~8 s); Ctrl+C publishes `offline` and exits.
- Anonymous and wrong-password logins are refused; feeder01 publishing to `catfeeder/feeder02/status` gets `Not authorized`; feeder01 subscribing to feeder02's `schedule/set` is accepted but receives nothing (Mosquitto checks the ACL on delivery).

Notes:

- Bug found while checking: `kill -9` on the fake feeder left it online. Cause: the `tsx` CLI runs the script in a child process, so the visible pid was not the one holding the MQTT connection. Fix: `node --import tsx` (one process), and the script prints its pid.
- feeder01's login comes from `FEEDER01_MQTT_PASSWORD` in `.env` until pairing makes real ones. No TLS yet: 1883 is published on 127.0.0.1 only; 8883 with our own CA comes with the VPS setup.
- A status message without `fw` or `schedule_version` keeps the stored values; `last_seen` is the time of the latest status message, including the Last Will.
- Ticket 01's "never connected" check now uses feeder02, since feeder01 really connects from this ticket on.

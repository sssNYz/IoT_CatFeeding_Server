# 04: Fake feeder comes online

**What to build:** A fake feeder script plays `feeder01` over MQTT so the owner app can see a live feeder before any hardware exists. The server's MQTT bridge starts with the app, tracks each feeder's online/offline state from the retained `status` topic and its Last Will, and records the schedule version the feeder says it applied. The owner app sees the feeder go online, go offline when the script stops, and sees "Waiting for feeder…" turn into "Synced ✓" after a schedule change.

Mosquitto rejects anonymous clients; the server and each feeder have their own login, and the ACL limits a feeder to its own topics (username = device_id). The fake feeder speaks exactly the MQTT payloads in the spec, so the real ESP32 can copy its behaviour.

**Blocked by:** 02 (Set schedules)

**Status:** ready-for-agent

- [ ] Starting the fake feeder makes `GET /feeders/{id}/status` show `online` with a Thai-time `last_seen` and `fw`
- [ ] Killing the fake feeder (no clean disconnect) flips the status to `offline` through the Last Will
- [ ] The fake feeder receives the retained schedule set on connect and after every change, then reports the applied schedule version in its status
- [ ] `synced` is `false` right after a schedule change and becomes `true` once the fake feeder reports that version
- [ ] Anonymous MQTT clients are refused, and the `feeder01` login cannot publish to another feeder's topics
- [ ] One command starts the fake feeder against the local stack

# 02: Set schedules

**What to build:** The owner app can list, add, edit and delete a feeder's schedules. Every change raises the feeder's schedule version by one and publishes the **whole** schedule set to the feeder's `schedule/set` MQTT topic as a retained QoS 1 message, so a feeder that connects later still gets the newest set. Saving means "saved on the server", not "the feeder has it": `synced` stays `false` until a feeder reports the version (ticket 04).

Only the feeder's owner (or the admin) can touch its schedules.

**Blocked by:** 01 (Log in)

**Status:** done

- [x] `GET /feeders/{id}/schedules` returns the schedules, the current schedule version and `timezone: "Asia/Bangkok"`
- [x] `POST` without `schedule_id` creates one (server makes the id); with an existing `schedule_id` updates it; both return `201` with the new schedule version
- [x] `DELETE` removes a schedule and returns the new schedule version
- [x] Each change publishes the full set (retained, QoS 1); subscribing to the topic afterwards with any MQTT client shows the newest set
- [x] Bad `time` (not `HH:MM`) or `portion_g` outside 5–100 returns `422` naming the field
- [x] Another owner's feeder returns `403`; an unknown feeder returns `404`
- [x] The seed adds two schedules (07:00 and 18:00, 40 g) to `feeder01`

## Comments

**22 Oct 2026, done.** `npm test` (33 tests: 13 from 01, 20 new) passes against `docker compose up`; the MQTT tests read the retained `schedule/set` message on `127.0.0.1:1883` with the `backend` login. Notes:

- Mosquitto is now 2.1.2: it refuses `mosquitto_passwd -c` over an existing file, so the container deletes and rewrites the password file on every start, and copies the mounted ACL to a file owned by `mosquitto`.
- Publishes are serialized per feeder and each reads the set fresh from the database, so the retained message always ends on the newest version. A publish that the broker does not acknowledge within 5 s is logged, and the route still answers `201`: the change is saved, and the app re-sends every set each time it connects to the broker (app start, broker restart) and after `npm run reset`.
- `POST` with a `schedule_id` that does not exist returns `404` (not an upsert), so a typo cannot create a duplicate feed. Leaving out `sound_id` on an update keeps the sound; `null` removes it.
- The seed adds `feeder02` with no owner (not paired), so the `403` case can be tried; the owner still sees only `feeder01`.

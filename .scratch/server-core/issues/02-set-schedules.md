# 02: Set schedules

**What to build:** The owner app can list, add, edit and delete a feeder's schedules. Every change raises the feeder's schedule version by one and publishes the **whole** schedule set to the feeder's `schedule/set` MQTT topic as a retained QoS 1 message, so a feeder that connects later still gets the newest set. Saving means "saved on the server", not "the feeder has it": `synced` stays `false` until a feeder reports the version (ticket 04).

Only the feeder's owner (or the admin) can touch its schedules.

**Blocked by:** 01 (Log in)

**Status:** ready-for-agent

- [ ] `GET /feeders/{id}/schedules` returns the schedules, the current schedule version and `timezone: "Asia/Bangkok"`
- [ ] `POST` without `schedule_id` creates one (server makes the id); with an existing `schedule_id` updates it; both return `201` with the new schedule version
- [ ] `DELETE` removes a schedule and returns the new schedule version
- [ ] Each change publishes the full set (retained, QoS 1); subscribing to the topic afterwards with any MQTT client shows the newest set
- [ ] Bad `time` (not `HH:MM`) or `portion_g` outside 5–100 returns `422` naming the field
- [ ] Another owner's feeder returns `403`; an unknown feeder returns `404`
- [ ] The seed adds two schedules (07:00 and 18:00, 40 g) to `feeder01`

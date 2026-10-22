# 05: Feeding history

**What to build:** The owner app shows a feeding history with cat names, and new feedings appear within about 5 seconds without a reload. The server ingests feeding events from the `event/feeding` topic, stores exactly one row per `event_id`, counts every duplicate it rejects (the objective 4 result), and lets the database set `received_at`. History filters `from`/`to` on `occurred_at`; polling uses `since` on `received_at`, so late events from an outage still appear.

The fake feeder now "feeds" at its schedule times and sends events, sometimes with a registered tag, sometimes `unknown`, and can replay a batch of late events and a duplicate on demand. The seed adds about 20 example events so history is not empty on day one.

**Blocked by:** 03 (Add a cat), 04 (Fake feeder comes online)

**Status:** ready-for-agent

- [ ] An event from the fake feeder appears in `GET /feeders/{id}/events` with `dispensed_g` computed and Thai-time timestamps
- [ ] Sending the same `event_id` twice stores one row and adds one to the duplicate count
- [ ] An event whose topic device_id differs from its payload device_id is rejected
- [ ] A registered tag shows `rfid.cat` with the cat's name; an unregistered tag or `unknown`/`multiple` shows `rfid.cat: null`
- [ ] Late "outage" events with an old `occurred_at` are returned by a `since` poll made after they arrive
- [ ] `from`/`to` return events in that `occurred_at` range, newest first; `limit` is honoured (default 50, max 200)
- [ ] The seed adds about 20 events covering every `result` and `rfid.result`

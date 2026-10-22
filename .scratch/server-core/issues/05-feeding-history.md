# 05: Feeding history

**What to build:** The owner app shows a feeding history with cat names, and new feedings appear within about 5 seconds without a reload. The server ingests feeding events from the `event/feeding` topic, stores exactly one row per `event_id`, counts every duplicate it rejects (the objective 4 result), and lets the database set `received_at`. History filters `from`/`to` on `occurred_at`; polling uses `since` on `received_at`, so late events from an outage still appear.

The fake feeder now "feeds" at its schedule times and sends events, sometimes with a registered tag, sometimes `unknown`, and can replay a batch of late events and a duplicate on demand. The seed adds about 20 example events so history is not empty on day one.

**Blocked by:** 03 (Add a cat), 04 (Fake feeder comes online)

**Status:** done

- [x] An event from the fake feeder appears in `GET /feeders/{id}/events` with `dispensed_g` computed and Thai-time timestamps
- [x] Sending the same `event_id` twice stores one row and adds one to the duplicate count
- [x] An event whose topic device_id differs from its payload device_id is rejected
- [x] A registered tag shows `rfid.cat` with the cat's name; an unregistered tag or `unknown`/`multiple` shows `rfid.cat: null`
- [x] Late "outage" events with an old `occurred_at` are returned by a `since` poll made after they arrive
- [x] `from`/`to` return events in that `occurred_at` range, newest first; `limit` is honoured (default 50, max 200)
- [x] The seed adds about 20 events covering every `result` and `rfid.result`

## Comments

**22 Oct 2026, done.** `npm test` (54 tests) passes against `docker compose up`, also right after `npm run reset`. Agreed seam for automated tests: MQTT event in → `GET /feeders/{id}/events` and `GET /admin/stats` out (`tests/feeding-history.test.ts`: dispensed_g and Thai time, duplicate stored once and counted, topic/payload device_id mismatch dropped, cat name by tag, `since` round-trip). Checked by hand through the API and Newman (25 requests, 43 assertions, 0 failed):

- History: newest `occurred_at` first; `from`/`to` return only that range; `limit` 3 works, 0 and 201 give `422`; a time without `+07:00` gives `422`.
- Seed: 21 events over the last 10 days, every `result` and `rfid.result`, Mochi and Tora named, one unregistered tag.
- Fake feeder (driven in a pty): feeds by itself at a schedule time (32.7 g of 33); `f` button feed; `o` sends 5 events that happened 12–60 min earlier, which a `since` poll returns and a `from=now` query does not; `d` adds 1 to `duplicates_rejected`.

Notes:

- Bug found by Newman: a `since` poll returned events the app already had. Cause: `received_at` was stored to the microsecond but sent rounded down to the second. Fix: `received_at` is stored to the millisecond (`timestamptz(3)`) and sent with milliseconds, so it round-trips exactly as `since`. The app brief now says so.
- A query string reads `+` as a space, so `since=…+07:00` unencoded fails; the `422` now says "Encode + as %2B". Postman encodes it.
- The enum for `trigger` is `feed_trigger` in the database: `trigger` is a built-in PostgreSQL pseudo-type.
- `GET /admin/stats` (admin only) comes with this ticket, as the place the duplicate count is read. `image_media_id` is always `null` until ticket 07.
- The cat name is looked up by tag at read time, from any owner's cats (tags are unique system-wide).

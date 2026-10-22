# 07: See the picture

**What to build:** The owner opens a feeding in history and sees the cat photo. The fake feeder now also plays the ESP32-CAM: for each event it uploads a test JPEG with that `event_id`, using the feeder's device token. The server stores the photo in MinIO (bucket private, object key from feeder and event_id, never secrets) and links it to its event by `event_id` at read time, never by arrival order, because the photo may arrive before or after the event (ADR 0001). The app loads it through the authenticated media route.

The seeded `feeder01` gets a known device token from `.env` for now; real pairing comes in a later batch.

**Blocked by:** 05 (Feeding history)

**Status:** ready-for-agent

- [ ] `POST /devices/{id}/images` with a valid device token, a JPEG and an `event_id` returns `201` with a `media_id`
- [ ] A wrong or missing device token returns `401`; a non-JPEG or a file over 1 MB returns `422`
- [ ] The event's `image_media_id` is filled whether the photo arrived before or after the event
- [ ] `GET /media/{media_id}` streams the JPEG to the feeder's owner and returns `403` to other owners
- [ ] MinIO is not reachable from outside the Docker network
- [ ] In the owner app, a feeding from the fake feeder shows its photo

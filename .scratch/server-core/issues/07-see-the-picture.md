# 07: See the picture

**What to build:** The owner opens a feeding in history and sees the cat photo. The fake feeder now also plays the ESP32-CAM: for each event it uploads a test JPEG with that `event_id`, using the feeder's device token. The server stores the photo in MinIO (bucket private, object key from feeder and event_id, never secrets) and links it to its event by `event_id` at read time, never by arrival order, because the photo may arrive before or after the event (ADR 0001). The app loads it through the authenticated media route.

The seeded `feeder01` gets a known device token from `.env` for now; real pairing comes in a later batch.

**Blocked by:** 05 (Feeding history)

**Status:** done

- [x] `POST /devices/{id}/images` with a valid device token, a JPEG and an `event_id` returns `201` with a `media_id`
- [x] A wrong or missing device token returns `401`; a non-JPEG or a file over 1 MB returns `422`
- [x] The event's `image_media_id` is filled whether the photo arrived before or after the event
- [x] `GET /media/{media_id}` streams the JPEG to the feeder's owner and returns `403` to other owners
- [x] MinIO is not reachable from outside the Docker network
- [ ] In the owner app, a feeding from the fake feeder shows its photo

## Comments

**23 Oct 2026, done** (overnight, with the user's go-ahead to commit and push when green), except the last box, which needs the owner app: the server side is ready (every fake-feeder feeding gets an `image_media_id` whose `GET /media/{id}` returns the JPEG), but nobody has opened it in the app yet.

`npm test` (78 tests; 17 in `tests/see-the-picture.test.ts` at the agreed seam: the HTTP API, with feeding events sent over MQTT) passes against `docker compose up`. Checked by hand: the fake feeder's photos for a button feed (photo after the event) and an outage replay (photos before the events) all link and download as JPEG; one opened as an image. MinIO has no published port (`docker compose port minio 9000` is empty; localhost:9000/9001 refuse).

Notes:

- Device tokens come from `.env` (`FEEDER01_DEVICE_TOKEN`; `FEEDER02_DEVICE_TOKEN` only so tests can try "another owner's photo", since feeder02 has no owner). Only the SHA-256 is stored; the check is constant-time. Real tokens come with pairing.
- The JPEG check reads the file's first bytes (`FF D8 FF`), not the declared type. A body over 1 MB (+16 KB for the form) is refused from its `Content-Length` before it is read.
- `event_id` must be letters, digits, `-` and `_` (max 100): it becomes part of the object key `images/{feeder}/{event_id}.jpg`, so `../` is refused.
- One photo per event: a second upload for the same `event_id` replaces the file and keeps the `media_id`.
- The bucket `catfeeder` is created on app start and is private (MinIO's default). The app uses the MinIO root login; a separate least-privilege key is a later hardening step.
- Out of scope, still stubs in the contract: sound upload/download (`/feeders/{id}/sounds`, `/devices/{id}/sounds/{sound_id}`).

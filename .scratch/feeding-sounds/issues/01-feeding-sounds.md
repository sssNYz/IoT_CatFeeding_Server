# 01: Feeding sounds

**What to build:** Spec Section 9, rule 7. The owner uploads a recording (`POST /feeders/{id}/sounds`, multipart `name` + `file`: m4a, aac, mp3 or wav, max 2 MB). The server converts it with `ffmpeg` to MP3, mono, 16 kHz, stores it in MinIO and answers 201 with a `Sound` (`sound_id`, `name`, `media_id`, `duration_s`, Thai `created_at`). `GET /feeders/{id}/sounds` lists them for picking one in a schedule or Feed now. The main ESP32 downloads one with its device token (`GET /devices/{id}/sounds/{sound_id}`); the app plays one through `GET /media/{media_id}`.

**Blocked by:** none (server-core 07 for media)

**Status:** done

- [x] An uploaded WAV comes back as a Sound and is listed for the feeder
- [x] The feeder downloads it as a mono MP3 at 16 kHz or lower; a wrong device token is 401, an unknown sound_id 404
- [x] Not audio, over 2 MB, or no name is 422; another owner's feeder is 403
- [x] The owner app can play it through /media/{media_id} (audio/mpeg)

Seam: black-box HTTP against the running stack, as in server-core.

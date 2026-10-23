# Cat Feeder API: brief for the owner app

You are connecting the **owner app** (mobile) to the Cat Feeder server. The full contract is `openapi.json` (OpenAPI 3.1): it is the source of truth for every URL, field, type and error. This brief lists the rules that matter most and are easy to miss. If this brief and `openapi.json` disagree, `openapi.json` wins.

## Base URL

| Environment | Base URL |
| --- | --- |
| Mock server (now) | `http://<computer-ip>:4010` (run `npm install && npm run mock` in the server repo) |
| Real server, local | `http://<laptop-ip>:3000/api/v1` |
| Real server, VPS | `https://catfeeder-g05.duckdns.org/api/v1` |

Keep the base URL in one config value. The mock has no `/api/v1` prefix; the real server does.

## Rules

1. **Auth.** `POST /auth/login` with email + password returns `token` (JWT, lasts 3 days) and `user.role`. Send `Authorization: Bearer <token>` on every other call. On any `401`, clear the token and go to the login screen. There is no sign-up, password reset or email: accounts are created by the team.
2. **Times are Thai time strings.** Every time is ISO 8601 with `+07:00`, e.g. `2026-11-02T07:00:03+07:00`. Display them as-is or format with time zone `Asia/Bangkok`. Never send a JS `Date` / `toISOString()` (that gives UTC `Z`). Schedule `time` is `"HH:MM"`, 24-hour, Thai time.
3. **Feed now is two steps.** `POST /feeders/{id}/commands/feed` returns `202` with `command_id` and `status: "sent"`. That only means the command was sent. Poll `GET /feeders/{id}/commands/{command_id}` every 2 s until `status: "done"` (show "Feeding…" → "Done"). Give up after about 60 s and show "Feeder did not respond".
4. **Live updates = polling, every 5 s, only while the screen is open.**
   - History list: first load with `GET /feeders/{id}/events?limit=50`. Then poll with `?since=<newest received_at you have>` and add new events to the top.
   - Use `since`, not `from`. Events from an outage arrive late with an old `occurred_at`; `since` filters on `received_at`, so they still appear.
   - Pass `received_at` back exactly as the server sent it (it has milliseconds, e.g. `2026-11-02T07:00:04.123+07:00`), URL-encoded: `+` must be sent as `%2B`, or the server answers `422` saying so.
   - A late event has an old `occurred_at`, so place it by `occurred_at` rather than always at the top.
   - Status: poll `GET /feeders/{id}/status`.
5. **Schedule sync.** Saving a schedule returns `201` = saved on the server, not yet on the feeder. Show the status field `synced`: `true` → "Synced ✓", `false` → "Waiting for feeder…".
6. **Schedules.** `POST /feeders/{id}/schedules` without `schedule_id` creates one; with an existing `schedule_id` updates it. Delete with `DELETE /feeders/{id}/schedules/{schedule_id}`. `portion_g` is an integer, 5–100.
7. **Errors always have one shape:** `{"error": {"code", "message", "details?"}}`. `code` is one of `unauthorized`, `forbidden`, `not_found`, `validation_error`, `conflict`. For `validation_error`, `details[].field` tells you which form field to highlight.
8. **Images and sounds.** A feeding event has `image_media_id` (may be `null`, or appear later). Load it from `GET /media/{media_id}` with the auth header (not a public URL). Upload a feeding sound with `POST /feeders/{id}/sounds` as `multipart/form-data` (`name`, `file`; any phone format, max 2 MB). The server converts it for the feeder.
9. **Cats.** The feeder identifies a cat by RFID tag only. `rfid.result` is `tag`, `unknown` or `multiple`; `rfid.cat` is `null` when the tag is not registered. Show "Unknown cat" in those cases, never guess.
10. **Not for the owner app.** Skip routes tagged `Admin` (admin dashboard) and `Devices` (ESP32 boards).

## Owner app endpoints

| Screen | Calls |
| --- | --- |
| Login | `POST /auth/login`, `GET /me` |
| Home / feeder list | `GET /feeders` (includes each feeder's status) |
| Feeder detail | `GET /feeders/{id}/status` (poll), `POST /feeders/{id}/commands/feed`, `GET /feeders/{id}/commands/{command_id}` (poll) |
| Schedules | `GET/POST /feeders/{id}/schedules`, `DELETE /feeders/{id}/schedules/{schedule_id}` |
| History | `GET /feeders/{id}/events` (poll with `since`), `GET /media/{media_id}` |
| Cats | `GET/POST /cats` |
| Sounds | `GET/POST /feeders/{id}/sounds` |

## About the mock server

The mock returns the examples from `openapi.json`. It accepts any token and any password, does not save anything, and always returns the same data. Use it for shapes and screens, not behaviour. A `422` or `401` is returned when the request breaks the contract, which helps catch mistakes early.

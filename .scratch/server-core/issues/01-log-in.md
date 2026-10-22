# 01: Log in

**What to build:** The whole stack starts with one command, and the owner app can log in with a seeded account, stay logged in for 3 days, and see the seeded feeder. This is the walking skeleton every later ticket builds on: Next.js app, PostgreSQL, Mosquitto and MinIO under Docker Compose, all on Thai time (`Asia/Bangkok`).

Request and response bodies use the shared contract schemas, so the real server returns exactly what the mock (`openapi.json`) returns. Seed accounts (one owner, one admin) come from `.env`; the owner owns `feeder01`. No sign-up, no email.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `docker compose up` starts app, db, mosquitto and minio; `date` in the app and db containers shows `+07`, and `SHOW timezone` returns `Asia/Bangkok`
- [x] The seed runs automatically on an empty database; a reset command wipes and reseeds
- [x] `POST /api/v1/auth/login` with the seeded owner returns a JWT, `expires_at` 3 days ahead in `+07:00`, and the user with `role: owner`
- [x] Wrong password returns `401` with the contract error shape; a malformed body returns `422` with `details`
- [x] `GET /api/v1/me` returns the user for a valid token and `401` for a missing or expired one
- [x] `GET /api/v1/feeders` returns `feeder01` for the owner (status `unknown`, never connected) and every feeder for the admin
- [x] `.env.example` lists every variable, including the seed logins; `.env` is not committed
- [x] The owner app can log in against the real server by changing only its base URL

## Comments

**22 Oct 2026, done.** `npm test` (13 tests, black-box over HTTP, every body checked against the contract zod schemas) passes against `docker compose up`. Notes:

- `minio/minio` is no longer on Docker Hub; Compose uses `cgr.dev/chainguard/minio:latest` (same server).
- App image is Node 22 (Node 20 reached end of life in April 2026) and runs `next start` with full `node_modules`, not `output: 'standalone'`, so `npm run reset` / `seed` work inside the container.
- Next.js skips its build-time type check (TypeScript 7 has no JS API); `npm run typecheck` covers it.
- Mosquitto runs with `allow_anonymous false` and no logins yet; ticket 04 adds them.
- Base-URL swap: the real server has the `/api/v1` prefix, the mock does not (already in the app brief). No CORS headers: fine for a native app, needed only if the owner app runs in a browser.

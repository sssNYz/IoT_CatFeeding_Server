# 01: Log in

**What to build:** The whole stack starts with one command, and the owner app can log in with a seeded account, stay logged in for 3 days, and see the seeded feeder. This is the walking skeleton every later ticket builds on: Next.js app, PostgreSQL, Mosquitto and MinIO under Docker Compose, all on Thai time (`Asia/Bangkok`).

Request and response bodies use the shared contract schemas, so the real server returns exactly what the mock (`openapi.json`) returns. Seed accounts (one owner, one admin) come from `.env`; the owner owns `feeder01`. No sign-up, no email.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `docker compose up` starts app, db, mosquitto and minio; `date` in the app and db containers shows `+07`, and `SHOW timezone` returns `Asia/Bangkok`
- [ ] The seed runs automatically on an empty database; a reset command wipes and reseeds
- [ ] `POST /api/v1/auth/login` with the seeded owner returns a JWT, `expires_at` 3 days ahead in `+07:00`, and the user with `role: owner`
- [ ] Wrong password returns `401` with the contract error shape; a malformed body returns `422` with `details`
- [ ] `GET /api/v1/me` returns the user for a valid token and `401` for a missing or expired one
- [ ] `GET /api/v1/feeders` returns `feeder01` for the owner (status `unknown`, never connected) and every feeder for the admin
- [ ] `.env.example` lists every variable, including the seed logins; `.env` is not committed
- [ ] The owner app can log in against the real server by changing only its base URL

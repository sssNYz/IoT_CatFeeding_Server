# Cat Feeder Server

Next.js REST API + admin dashboard, PostgreSQL, Mosquitto and MinIO under Docker Compose, all on Thai time (`Asia/Bangkok`). See `Cat Feeder Server - Spec.md`.

## Run it

```bash
cp .env.example .env        # then change every value; PUBLIC_HOST is the DuckDNS name pointing at this host
sh scripts/make-mqtt-certs.sh   # our CA + Mosquitto's certificate in certs/ (keeps an existing CA)
docker compose up -d --build
```

The admin dashboard is at `https://<PUBLIC_HOST>/admin` (admin login only). The API is at `https://<PUBLIC_HOST>/api/v1` through Caddy, which gets a Let's Encrypt certificate by itself (ports 80 and 443 must be reachable), and at `http://localhost:3000/api/v1` on this machine (contract: `openapi.json`). On first start the app migrates the database and seeds the accounts from `.env`: one admin, and one owner who owns `feeder01`.

| Task | Command |
| --- | --- |
| Wipe and reseed the database | `docker compose exec app npm run reset` |
| Seed (only if empty) | `docker compose exec app npm run seed` |
| Run the API tests (stack must be up) | `npm install && npm test` |
| One-time: the headless Chromium the dashboard tests drive | `npx playwright install --only-shell chromium && sudo npx playwright install-deps chromium` |
| Type check | `npm run typecheck` |
| Mock server for the app (port 4010) | `npm run mock` |
| Regenerate `openapi.json` | `npm run openapi` |
| New migration after editing `lib/db/schema.ts` | `npm run db:generate` |
| Fake feeder01 (online, gets schedules, feeds at schedule times and on Feed now, uploads a photo per feeding) | `npm run fake-feeder`, then press `f` button feed, `o` outage replay (5 late events), `d` resend the last event. Ctrl+C = goes offline cleanly; `kill -9 <pid it prints>` = power cut, Last Will |
| Watch the schedule sets the feeders get | `docker compose exec mosquitto sh -c 'mosquitto_sub -u backend -P "$MQTT_BACKEND_PASSWORD" -t "catfeeder/+/schedule/set" -v'` |

## What is open to the Internet

| Port | What | Who |
| --- | --- | --- |
| 80, 443 | Caddy → app (HTTPS, Let's Encrypt) | owner app, admin dashboard, ESP32-CAM |
| 8883 | Mosquitto, MQTT over TLS with our own CA | feeders |

Everything else is closed (`tests/vps.test.ts` checks it): 3000 and 1883 are published on `127.0.0.1` only, for tests and the fake feeder; `db` and `minio` have no published ports, so database commands run inside the `app` container and photos are only reachable through `GET /api/v1/media/{id}`.

A feeder connects to `mqtts://<PUBLIC_HOST>:8883` with its MQTT login and trusts `certs/ca.crt` (public; flash it into the firmware). `certs/ca.key` must never leave the server: with it, anyone could pose as the broker. Moving hosts: copy `.env` and `certs/`, point DuckDNS at the new IP.

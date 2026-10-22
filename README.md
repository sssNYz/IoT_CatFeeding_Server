# Cat Feeder Server

Next.js REST API + admin dashboard, PostgreSQL, Mosquitto and MinIO under Docker Compose, all on Thai time (`Asia/Bangkok`). See `Cat Feeder Server - Spec.md`.

## Run it

```bash
cp .env.example .env        # then change every value
docker compose up -d --build
```

The API is at `http://localhost:3000/api/v1` (contract: `openapi.json`). On first start the app migrates the database and seeds the accounts from `.env`: one admin, and one owner who owns `feeder01`.

| Task | Command |
| --- | --- |
| Wipe and reseed the database | `docker compose exec app npm run reset` |
| Seed (only if empty) | `docker compose exec app npm run seed` |
| Run the API tests (stack must be up) | `npm install && npm test` |
| Type check | `npm run typecheck` |
| Mock server for the app (port 4010) | `npm run mock` |
| Regenerate `openapi.json` | `npm run openapi` |
| New migration after editing `lib/db/schema.ts` | `npm run db:generate` |
| Fake feeder01 (online, gets schedules, feeds at schedule times) | `npm run fake-feeder`, then press `f` button feed, `o` outage replay (5 late events), `d` resend the last event. Ctrl+C = goes offline cleanly; `kill -9 <pid it prints>` = power cut, Last Will |
| Watch the schedule sets the feeders get | `docker compose exec mosquitto sh -c 'mosquitto_sub -u backend -P "$MQTT_BACKEND_PASSWORD" -t "catfeeder/+/schedule/set" -v'` |

`db` and `minio` have no published ports, so database commands run inside the `app` container. Mosquitto's 1883 is published on `127.0.0.1` only (tests read the retained schedule set through it); feeders will use 8883 with TLS.

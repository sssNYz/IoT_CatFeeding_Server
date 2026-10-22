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

`db` and `minio` have no published ports, so database commands run inside the `app` container.

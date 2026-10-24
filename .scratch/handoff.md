# Handoff: where the server work stopped (24 Oct 2026)

Read this first when continuing on a new machine or in a new session. Then read `CLAUDE.md`, `GLOSSARY.md`, `Cat Feeder Server - Spec.md`, `docs/adr/` and `README.md`.

## Done

- Spec v3, glossary, ADR 0001 (UART for event_id) and ADR 0002 (no phone-to-feeder control).
- API contract (`lib/contract/`, `openapi.json`, mock on 4010) and `docs/mobile-app-api-brief.md` for Pisit.
- Tickets 01–07 in `.scratch/server-core/issues/` (log in, schedules, cats, fake feeder online, history, feed now, picture), then a two-axis code review of 06–07 and its fixes.
- **VPS is the live host:** `catfeeder-g05.duckdns.org` (82.26.104.235). Caddy on 80/443 with Let's Encrypt; Mosquitto on 8883 with TLS from our own CA (`scripts/make-mqtt-certs.sh`, `certs/` gitignored, `certs/ca.key` never leaves the VPS). 3000 and 1883 are on 127.0.0.1 only; `tests/vps.test.ts` checks what is open. The VPS has no firewall: whatever Docker publishes is public.
- `GET /feeders/{id}/events.csv` (admin only) for the analysis notebook.
- The user's own Python program plays feeder01 against 8883; do not run the fake feeder at the same time.
- Admin dashboard at `/admin` (`.scratch/admin-dashboard/`, 01–04): overview, events page (filters, raw JSON, photos, CSV), feeder page (schedules, Feed now). Tested with headless Chromium (Playwright); the VPS has Chromium's system libraries.
- Feeding sounds (`.scratch/feeding-sounds/`): upload, ffmpeg to mono 16 kHz MP3, list, device download, play through /media.

## Next

1. Human API guide `docs/api.md` (per endpoint: purpose, request/response, errors, curl), postponed earlier.
2. Maybe: pick a sound in the dashboard's schedule form; the fake feeder downloading sounds.

Parked by the user: pairing and `GET /admin/users` (only one feeder exists).

## Reminders

- Use `mattpocock-skills:tdd` on every piece (confirm seams first) and `diagnosing-bugs` for bugs.
- `npm test` writes into the live database; reset (`docker compose exec app npm run reset`) after running it, and do not run it while the real feeder is being tested.
- From 6 Nov the VPS is frozen for system tests, benchmarks and the video.

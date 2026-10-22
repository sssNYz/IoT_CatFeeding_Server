# Handoff: where the server work stopped (22 Oct 2026)

Read this first when continuing on a new machine or in a new session. Then read `CLAUDE.md`, `GLOSSARY.md`, `Cat Feeder Server - Spec.md` and `docs/adr/`.

## Done

- Spec v3 (Next.js server, VPS demo host, owner app + admin dashboard, timeline, team split), glossary, ADR 0001 (UART for event_id) and ADR 0002 (no phone-to-feeder control).
- API contract: zod schemas in `lib/contract/`, generated `openapi.json` (`npm run openapi`), mock server (`npm run mock`, port 4010).
- `docs/mobile-app-api-brief.md`: one-page rules for Pisit's AI, sent with `openapi.json`.
- Tickets 01–07 in `.scratch/server-core/issues/`: goal is the owner app fully testable with no hardware (log in, schedules, cats + RFID, fake feeder online, history, feed now, picture).

## Next

1. Install Docker (OrbStack or Docker Desktop) on the machine you work on.
2. Build ticket 01: `/mattpocock-skills:implement .scratch/server-core/issues/01-log-in.md`, then 02 → 07 in order (03 can run alongside 02; 06 and 07 both only need 05).
3. Target: all 7 tickets done on 23 Oct. If time runs short, ticket 07 (picture) can slip a day.

## Pending decisions and reminders

- **VPS:** leaning to a provider's "Plan S" (2 vCPU, 4 GB RAM, 30 GB NVMe, ฿10/day). Before paying, confirm: public IPv4; ports 80, 443, 8883 can be opened; it is a real VM (KVM), not a container (LXC/OpenVZ), so Docker runs; Ubuntu 24.04 available. Not needed until the hardware weeks (from 27 Oct).
- **Reminder:** the full human API guide `docs/api.md` (per endpoint: purpose, request/response, errors, curl test cases) is postponed. Remind the user once the real API works.
- Next batch after 01–07: admin dashboard, feeding sounds, pairing, VPS + Caddy + TLS.

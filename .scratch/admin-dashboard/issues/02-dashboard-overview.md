# 02: Dashboard sign-in and overview

**What to build:** A web admin dashboard inside the Next.js app at `/admin`. The admin signs in with email and password (owners are turned away), then sees one card per feeder (name, online/offline, synced or waiting, last seen in Thai time, firmware) and the stats tiles (events stored, duplicates rejected, jam / missed / error). The page polls every 5 s, so a feeder going offline or a new event shows without a reload: this is the screen for the live demo.

**Blocked by:** 01

**Status:** done

- [x] Signing in as admin opens the overview; an owner login is refused with a clear message; signing out works
- [x] A feeder that comes online / goes offline (Last Will) changes its card within about 10 s, without a reload
- [x] A new event raises "events stored" without a reload; a resent event raises "duplicates rejected"
- [x] Every time shown is Thai time

Seam: a real browser (Playwright, headless on the VPS) drives the page while the test plays feeder01 over MQTT.

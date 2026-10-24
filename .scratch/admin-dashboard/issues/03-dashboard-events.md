# 03: Dashboard events page

**What to build:** `/admin/events`: a table of the newest feeding events across feeders (time, feeder, trigger, cat name or "unknown" / "two cats", target and dispensed grams, result, photo thumbnail). Filters for feeder and result. Clicking a row shows its raw JSON. A "Download CSV" button saves `events.csv` for a feeder. New events appear on top within about 5 s.

**Blocked by:** 01, 02

**Status:** done

- [x] A new event from feeder01 appears at the top within about 5 s, with the cat's name and dispensed grams
- [x] Filtering by result `jam` shows only jams
- [x] A row opens its raw JSON; the photo thumbnail loads when the event has one
- [x] "Download CSV" downloads the feeder's CSV

Seam: Playwright in a real browser, as in 02.

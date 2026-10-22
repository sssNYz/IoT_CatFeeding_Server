import { formatInTimeZone } from "date-fns-tz";

// Thai time everywhere (spec Section 2). Never send a JS Date or toISOString() in JSON.
export const TZ = "Asia/Bangkok";

/** A moment as ISO 8601 Thai time, e.g. "2026-11-02T08:15:00+07:00". */
export const toThai = (date: Date) => formatInTimeZone(date, TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");

export const nowTh = () => toThai(new Date());

/**
 * A timestamptz string from PostgreSQL ("2026-11-02 08:15:00.123+07") as API Thai time.
 * The database time zone is Asia/Bangkok, so this only reshapes the text; no zone maths.
 */
export function pgToThai(value: string): string;
export function pgToThai(value: string | null): string | null;
export function pgToThai(value: string | null) {
  if (value === null) return null;
  const m = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?([+-]\d{2})(?::?(\d{2}))?$/);
  if (!m) throw new Error(`Unexpected timestamp from the database: ${value}`);
  return `${m[1]}T${m[2]}${m[3]}:${m[4] ?? "00"}`;
}

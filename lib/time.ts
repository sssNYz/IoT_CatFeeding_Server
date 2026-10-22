import { formatInTimeZone } from "date-fns-tz";

// Thai time everywhere (spec Section 2). Never send a JS Date or toISOString() in JSON.
export const TZ = "Asia/Bangkok";

/** A moment as ISO 8601 Thai time, e.g. "2026-11-02T08:15:00+07:00". */
export const toThai = (date: Date) => formatInTimeZone(date, TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");

export const nowTh = () => toThai(new Date());

/**
 * A timestamptz string from PostgreSQL ("2026-11-02 08:15:00.123+07") as API Thai time.
 * The database time zone is Asia/Bangkok, so this only reshapes the text; no zone maths.
 * Whole seconds, unless `millis` is set (received_at, the polling cursor).
 */
export function pgToThai(value: string, opts?: { millis: boolean }): string;
export function pgToThai(value: string | null, opts?: { millis: boolean }): string | null;
export function pgToThai(value: string | null, { millis = false } = {}) {
  if (value === null) return null;
  const m = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?([+-]\d{2})(?::?(\d{2}))?$/);
  if (!m) throw new Error(`Unexpected timestamp from the database: ${value}`);
  // With millis, always three digits (PostgreSQL trims trailing zeros: .1 means .100).
  const fraction = millis ? `.${(m[3] ?? "").padEnd(3, "0").slice(0, 3)}` : "";
  return `${m[1]}T${m[2]}${fraction}${m[4]}:${m[5] ?? "00"}`;
}

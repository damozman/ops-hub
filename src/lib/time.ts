// Wall-clock times in the agency's time zone (America/Chicago), DST-aware, using
// the runtime's IANA time-zone data (Intl). Pure and unit-tested.

export const AGENCY_TIME_ZONE = "America/Chicago";

/** Offset of a time zone from UTC at an instant, in minutes (Chicago: -360 in winter, -300 in summer). */
export function tzOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/**
 * Converts a local wall-clock time ("YYYY-MM-DDTHH:mm" or "YYYY-MM-DD" + time) in
 * the given zone to a UTC Date. Returns null for malformed input.
 */
export function zonedTimeToUtc(local: string, timeZone: string = AGENCY_TIME_ZONE): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(local);
  if (!m) return null;
  const [y, mo, d, h = "0", mi = "0"] = m.slice(1);
  const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  if (Number.isNaN(wall)) return null;
  // Two passes settle the offset around DST changes.
  let guess = wall - tzOffsetMinutes(new Date(wall), timeZone) * 60000;
  guess = wall - tzOffsetMinutes(new Date(guess), timeZone) * 60000;
  return new Date(guess);
}

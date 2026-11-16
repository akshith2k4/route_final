/**
 * Small timezone helpers. Cities can sit in different timezones, so the
 * dispatch window and the rendered timestamps follow the city's own zone
 * instead of a hardcoded offset.
 */

/** The UTC offset of a timezone, in minutes, at the given instant. */
export function timezoneOffsetMinutes(
  timezone: string,
  date: Date = new Date(),
): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const asUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour") % 24,
    read("minute"),
    read("second"),
  );

  return Math.round((asUtc - date.getTime()) / 60000);
}

/** The calendar date in a timezone, as "YYYY-MM-DD". */
export function localDateString(
  timezone: string,
  date: Date = new Date(),
): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

/** Builds an ISO timestamp for a wall-clock time in a timezone. */
export function isoWithOffset(
  timezone: string,
  date: string,
  time: string,
): string {
  const offset = timezoneOffsetMinutes(timezone, new Date(`${date}T12:00:00Z`));
  const sign = offset >= 0 ? "+" : "-";
  const absolute = Math.abs(offset);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  return `${date}T${time}:00${sign}${hours}:${minutes}`;
}

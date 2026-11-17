/** Clock helpers shared by the schedule builder and the city context. */

/** Parses "07:00", "07:00 AM" or "15:54" into minutes from midnight. */
export function clockToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec((value ?? "").trim());
  if (!match) return 7 * 60;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const suffix = match[3]?.toUpperCase();
  if (suffix === "PM" && hours < 12) hours += 12;
  if (suffix === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

/** Formats minutes from midnight as 24-hour "HH:MM". */
export function minutesToClock(total: number): string {
  const normalized = ((Math.round(total) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Renders a 24h or AM/PM clock consistently, matching the Bengaluru data. */
export function formatClock(value: string): string {
  const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec((value ?? "").trim());
  if (!match) return value;
  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = match[3]?.toUpperCase();
  if (suffix) {
    return `${String(hours).padStart(2, "0")}:${minutes} ${suffix}`;
  }
  const period = hours >= 12 ? "PM" : "AM";
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(display).padStart(2, "0")}:${minutes} ${period}`;
}

import "server-only";
import { cookies } from "next/headers";

/** The browser stores its IANA time zone in this cookie so "today" matches the student's day. */
export const TZ_COOKIE = "tz";

function formatDay(date: Date, timeZone?: string) {
  const opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit" };
  try {
    return new Intl.DateTimeFormat("en-CA", { ...opts, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-CA", opts).format(date);
  }
}

/** Today's date (YYYY-MM-DD) in the student's time zone. */
export async function today(): Promise<string> {
  let tz: string | undefined;
  try {
    tz = (await cookies()).get(TZ_COOKIE)?.value;
  } catch {}
  return formatDay(new Date(), tz || undefined);
}

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

import type { DateParts } from "./client/endpoints.js";

/**
 * Resolve a tool date input ("today", "next-sunday" or YYYY-MM-DD) to concrete
 * date parts. "today" is resolved locally (optionally in a configured timezone)
 * so it shares cache entries with explicit-date requests.
 */
export function resolveDate(input: string | undefined, timezone?: string): DateParts {
  const keyword = (input ?? "today").trim().toLowerCase();
  if (keyword === "today") return todayIn(timezone);
  if (keyword === "next-sunday" || keyword === "next_sunday") {
    return addDays(todayIn(timezone), daysUntilNextSunday(todayIn(timezone)));
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(keyword);
  if (!match) {
    throw new Error(`Invalid date '${input}'. Use YYYY-MM-DD, "today" or "next-sunday".`);
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function toIso(date: DateParts): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

function todayIn(timezone?: string): DateParts {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

function daysUntilNextSunday(date: DateParts): number {
  const dow = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return dow === 0 ? 7 : 7 - dow;
}

function addDays(date: DateParts, days: number): DateParts {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

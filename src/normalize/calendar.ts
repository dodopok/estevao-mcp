import type { LiturgicalDay } from "./types.js";

type Raw = Record<string, unknown>;

export function normalizeLiturgicalDay(raw: unknown, prayerBook: string): LiturgicalDay {
  const day = raw as Raw;
  return {
    date: String(day.date ?? ""),
    dayOfWeek: day.day_of_week as string | undefined,
    season: day.liturgical_season as string | undefined,
    color: day.liturgical_color as string | undefined,
    liturgicalYear: day.liturgical_year as string | undefined,
    isSunday: day.is_sunday as boolean | undefined,
    isHolyDay: day.is_holy_day as boolean | undefined,
    sundayName: day.sunday_name as string | null | undefined,
    weekOfSeason: day.week_of_season as number | null | undefined,
    properWeek: day.proper_week as number | null | undefined,
    description: day.description as string[] | undefined,
    celebration: emptyToUndefined(day.celebration),
    saint: emptyToUndefined(day.saint),
    collects: day.collect,
    readings: day.readings,
    morningReadings: day.morning_readings,
    eveningReadings: day.evening_readings,
    prayerBook,
  };
}

export interface CalendarMonthDay {
  date: string;
  color?: string;
  celebration?: string | null;
  week?: string | null;
}

export function normalizeCalendarMonth(raw: unknown): CalendarMonthDay[] {
  const days = (Array.isArray(raw) ? raw : []) as Raw[];
  return days.map((day) => ({
    date: String(day.date ?? ""),
    color: day.color as string | undefined,
    celebration: (day.celebration_name as string | null | undefined) ?? null,
    week: (day.week_name as string | null | undefined) ?? null,
  }));
}

function emptyToUndefined(value: unknown): unknown {
  if (value == null) return undefined;
  if (typeof value === "object" && Object.keys(value as object).length === 0) return undefined;
  return value;
}

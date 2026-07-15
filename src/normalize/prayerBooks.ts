import type { PrayerBook } from "./types.js";

type Raw = Record<string, unknown>;

export function normalizePrayerBooks(raw: unknown): PrayerBook[] {
  const body = raw as { data?: Raw[] };
  return (body.data ?? []).map(normalizePrayerBook);
}

export function normalizePrayerBook(raw: Raw): PrayerBook {
  return {
    code: String(raw.code ?? ""),
    name: String(raw.name ?? ""),
    fullName: raw.full_name as string | undefined,
    description: raw.description as string | undefined,
    language: String(raw.language ?? ""),
    jurisdiction: raw.jurisdiction as string | undefined,
    year: raw.year as number | string | undefined,
    premium: Boolean(raw.premium_required),
    recommended: raw.is_recommended as boolean | undefined,
    availableOffices: (raw.available_offices as string[] | undefined) ?? [],
    supportsFamilyRite: raw.supports_family_rite as boolean | undefined,
  };
}

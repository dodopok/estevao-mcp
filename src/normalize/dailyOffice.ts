import type { DailyOffice, OfficeLine, OfficeModule } from "./types.js";

type Raw = Record<string, unknown>;

export function normalizeDailyOffice(raw: unknown, prayerBook: string): DailyOffice {
  const office = raw as Raw;
  const metadata = (office.metadata ?? {}) as Raw;
  const modules = (office.modules ?? []) as Raw[];
  return {
    date: String(office.date ?? ""),
    officeType: String(office.office_type ?? ""),
    season: office.season as string | undefined,
    color: office.color as string | undefined,
    celebration: office.celebration ?? undefined,
    saint: office.saint ?? undefined,
    modules: modules.map(normalizeModule),
    prayerBook: String(metadata.prayer_book_code ?? prayerBook),
    language: metadata.language as string | undefined,
  };
}

function normalizeModule(raw: Raw): OfficeModule {
  const lines = (raw.lines ?? []) as Raw[];
  return {
    name: String(raw.name ?? ""),
    slug: String(raw.slug ?? ""),
    lines: lines.map(normalizeLine),
  };
}

// The live API emits { text, type, slug?, verse_number? }; the swagger doc
// describes { content, line_type, reference } — accept both shapes.
function normalizeLine(raw: Raw): OfficeLine {
  return {
    content: String(raw.text ?? raw.content ?? ""),
    type: String(raw.type ?? raw.line_type ?? "text"),
    reference: (raw.reference as string | null | undefined) ?? undefined,
    verseNumber: raw.verse_number != null ? Number(raw.verse_number) : undefined,
  };
}

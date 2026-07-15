/**
 * Canonical output contract of the MCP server.
 *
 * Structural keys are always English regardless of the upstream response
 * language (the Rails lectionary/celebrations endpoints use Portuguese keys).
 * Liturgical *content* is never translated — each payload carries `language`.
 */

export interface Reading {
  reference: string;
  alternative?: string;
}

export interface Readings {
  first?: Reading;
  psalm?: Reading;
  second?: Reading;
  gospel?: Reading;
}

export interface LiturgicalDay {
  date: string;
  dayOfWeek?: string;
  season?: string;
  color?: string;
  liturgicalYear?: string;
  isSunday?: boolean;
  isHolyDay?: boolean;
  sundayName?: string | null;
  weekOfSeason?: number | null;
  properWeek?: number | null;
  description?: string[];
  celebration?: unknown;
  saint?: unknown;
  collects?: unknown;
  readings?: unknown;
  morningReadings?: unknown;
  eveningReadings?: unknown;
  prayerBook: string;
}

export interface LectionaryDay {
  date: string;
  dayOfWeek?: string;
  cycle?: string;
  readings: Readings;
  prayerBook: string;
}

export interface CelebrationSummary {
  id: number | string;
  name: string;
  latinName?: string | null;
  type?: string;
  typeName?: string;
  rank?: number;
  fixedDate?: { month: number; day: number } | null;
  movable?: boolean;
  color?: string;
}

export interface CelebrationSearchResult {
  total: number;
  celebrations: CelebrationSummary[];
  prayerBook: string;
}

export interface OfficeLine {
  content: string;
  type: string;
  reference?: string | null;
}

export interface OfficeModule {
  name: string;
  slug: string;
  lines: OfficeLine[];
}

export interface DailyOffice {
  date: string;
  officeType: string;
  season?: string;
  color?: string;
  celebration?: unknown;
  saint?: unknown;
  modules: OfficeModule[];
  prayerBook: string;
  language?: string;
}

export interface PrayerBook {
  code: string;
  name: string;
  fullName?: string;
  description?: string;
  language: string;
  jurisdiction?: string;
  year?: number | string;
  premium: boolean;
  recommended?: boolean;
  availableOffices: string[];
  supportsFamilyRite?: boolean;
}

import type { EstevaoHttpClient, QueryParams } from "./http.js";

export interface Preferences {
  prayerBook: string;
  bibleVersion?: string;
  language?: string;
  readingType?: string;
  /**
   * Any other per-book preference, forwarded as `preferences[key]`. The set differs
   * per prayer book (psalm translation, canticle choices, psalm cycles, family rite
   * variants); `getPrayerBookPreferences` describes what a given book accepts.
   */
  extra?: Record<string, string | number | boolean>;
}

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

function preferenceParams(prefs: Preferences): QueryParams {
  const params: QueryParams = {
    "preferences[prayer_book_code]": prefs.prayerBook,
    "preferences[bible_version]": prefs.bibleVersion,
    "preferences[language]": prefs.language,
    "preferences[reading_type]": prefs.readingType,
  };
  for (const [key, value] of Object.entries(prefs.extra ?? {})) {
    if (PREFERENCE_KEY.test(key)) params[`preferences[${key}]`] = value;
  }
  return params;
}

/** Guards the query string against anything that is not a plain preference name. */
const PREFERENCE_KEY = /^[a-z][a-z0-9_]{0,60}$/;

/** Typed wrapper over the Estêvão REST endpoints used by the MCP server. */
export class EstevaoApi {
  constructor(private readonly http: EstevaoHttpClient) {}

  getCalendarDay(date: DateParts, prefs: Preferences): Promise<unknown> {
    return this.http.get(
      `/api/v1/calendar/${date.year}/${date.month}/${date.day}`,
      preferenceParams(prefs),
    );
  }

  getLectionaryDay(date: DateParts, prefs: Preferences): Promise<unknown> {
    return this.http.get(
      `/api/v1/lectionary/${date.year}/${date.month}/${date.day}`,
      preferenceParams(prefs),
    );
  }

  getLectionaryAllServices(date: DateParts, prefs: Preferences): Promise<unknown> {
    return this.http.get(
      `/api/v1/lectionary/${date.year}/${date.month}/${date.day}/all_services`,
      preferenceParams(prefs),
    );
  }

  getDailyOffice(
    date: DateParts,
    officeType: string,
    prefs: Preferences,
    family = false,
  ): Promise<unknown> {
    const base = `/api/v1/daily_office/${date.year}/${date.month}/${date.day}/${officeType}`;
    return this.http.get(family ? `${base}/family` : base, preferenceParams(prefs));
  }

  getCalendarMonth(year: number, month: number, prefs: Preferences): Promise<unknown> {
    return this.http.get(`/api/v1/calendar/${year}/${month}`, preferenceParams(prefs));
  }

  getYearOverview(year: number, prefs: Preferences): Promise<unknown> {
    return this.http.get(`/api/v1/calendar/${year}/overview`, preferenceParams(prefs));
  }

  getYearSeasons(year: number, prefs: Preferences): Promise<unknown> {
    return this.http.get(`/api/v1/calendar/${year}/seasons`, preferenceParams(prefs));
  }

  getYearKeyDates(year: number, prefs: Preferences): Promise<unknown> {
    return this.http.get(`/api/v1/calendar/${year}/key_dates`, preferenceParams(prefs));
  }

  getYearCelebrations(
    year: number,
    prefs: Preferences,
    options: { type?: string; grouped?: boolean } = {},
  ): Promise<unknown> {
    return this.http.get(`/api/v1/calendar/${year}/celebrations`, {
      type: options.type,
      grouped: options.grouped,
      ...preferenceParams(prefs),
    });
  }

  listCelebrations(
    prefs: Preferences,
    options: { type?: string; movable?: boolean } = {},
  ): Promise<unknown> {
    return this.http.get(`/api/v1/celebrations`, {
      type: options.type,
      movable: options.movable,
      ...preferenceParams(prefs),
    });
  }

  getCelebrationTypes(): Promise<unknown> {
    return this.http.get(`/api/v1/celebrations/types`);
  }

  getCelebration(id: number | string, prefs: Preferences): Promise<unknown> {
    return this.http.get(`/api/v1/celebrations/${id}`, preferenceParams(prefs));
  }

  getCelebrationByDate(month: number, day: number, prefs: Preferences): Promise<unknown> {
    return this.http.get(`/api/v1/celebrations/date/${month}/${day}`, preferenceParams(prefs));
  }

  /** The decision trail behind a day: precedence, transfers, colour and reading choice. */
  getLiturgicalExplanation(
    date: DateParts,
    prefs: Preferences,
    options: { serviceType?: string; locale?: string } = {},
  ): Promise<unknown> {
    return this.http.get(
      `/api/v1/liturgical_explanation/${date.year}/${date.month}/${date.day}`,
      {
        ...preferenceParams(prefs),
        service_type: options.serviceType,
        locale: options.locale,
      },
    );
  }

  /** Preference categories a prayer book accepts, with allowed values. */
  getPrayerBookPreferences(code: string): Promise<unknown> {
    return this.http.get(`/api/v1/prayer_books/${code}/preferences`);
  }

  getLectionaryCycle(year: number): Promise<unknown> {
    return this.http.get(`/api/v1/lectionary/cycle/${year}`);
  }

  searchCelebrations(query: string, prefs: Preferences): Promise<unknown> {
    return this.http.get(`/api/v1/celebrations/search`, {
      q: query,
      ...preferenceParams(prefs),
    });
  }

  listPrayerBooks(language?: string): Promise<unknown> {
    return this.http.get(`/api/v1/prayer_books`, { language });
  }

  getPrayerBook(code: string): Promise<unknown> {
    return this.http.get(`/api/v1/prayer_books/${code}`);
  }

  listBibleVersions(language?: string): Promise<unknown> {
    return this.http.get(`/api/v1/bible_versions`, { language });
  }
}

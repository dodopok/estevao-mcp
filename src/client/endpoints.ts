import type { EstevaoHttpClient, QueryParams } from "./http.js";

export interface Preferences {
  prayerBook: string;
  bibleVersion?: string;
  language?: string;
  readingType?: string;
}

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

function preferenceParams(prefs: Preferences): QueryParams {
  return {
    "preferences[prayer_book_code]": prefs.prayerBook,
    "preferences[bible_version]": prefs.bibleVersion,
    "preferences[language]": prefs.language,
    "preferences[reading_type]": prefs.readingType,
  };
}

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

import type { EstevaoApi, Preferences } from "./client/endpoints.js";
import type { Config } from "./config.js";

export interface ServerContext {
  api: EstevaoApi;
  config: Config;
}

/**
 * A few well-known codes, for the tool descriptions only. The catalogue grows
 * (there are over twenty editions), so codes are validated against the live list
 * from the API rather than a hardcoded enum that silently locks new books out.
 */
export const SAMPLE_PRAYER_BOOK_CODES = [
  "loc_2015",
  "locb_2008",
  "loc_1662",
  "loc_2019_en",
  "loc_1662_en",
  "loc_1979_en",
  "loc_2019_es",
] as const;

export interface PreferenceArgs {
  prayer_book?: string;
  bible_version?: string;
  language?: string;
  reading_type?: string;
  preferences?: Record<string, string | number | boolean>;
}

export function buildPreferences(ctx: ServerContext, args: PreferenceArgs): Preferences {
  return {
    prayerBook: args.prayer_book ?? ctx.config.defaultPrayerBook,
    bibleVersion: args.bible_version,
    language: args.language ?? ctx.config.language,
    readingType: args.reading_type,
    extra: args.preferences,
  };
}

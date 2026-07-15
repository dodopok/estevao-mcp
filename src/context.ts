import type { EstevaoApi, Preferences } from "./client/endpoints.js";
import type { Config } from "./config.js";

export interface ServerContext {
  api: EstevaoApi;
  config: Config;
}

export const PRAYER_BOOK_CODES = [
  "loc_2015",
  "locb_2008",
  "loc_1987",
  "loc_1662",
  "loc_2021",
  "loc_2019",
  "loc_1549",
  "loc_2019_en",
  "loc_1662_en",
  "loc_1979_en",
  "loc_2019_es",
] as const;

export function buildPreferences(
  ctx: ServerContext,
  args: { prayer_book?: string; bible_version?: string; language?: string; reading_type?: string },
): Preferences {
  return {
    prayerBook: args.prayer_book ?? ctx.config.defaultPrayerBook,
    bibleVersion: args.bible_version,
    language: args.language ?? ctx.config.language,
    readingType: args.reading_type,
  };
}

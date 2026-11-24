import type { EstevaoApi, Preferences } from "./client/endpoints.js";
import type { Config } from "./config.js";
import { cached, TTL_METADATA } from "./cache/lru.js";
import { normalizePrayerBooks } from "./normalize/prayerBooks.js";
import type { PrayerBook } from "./normalize/types.js";

/**
 * The signed-in user's saved settings. Present only when the request comes from an
 * OAuth sign-in; stdio and raw API-key requests have no account to save to.
 */
export interface AccountPreferences {
  /** The prayer book the user saved, used when a call names none. */
  prayerBook?: string;
  /** Saves the user's prayer book, or removes it when given undefined. */
  savePrayerBook(code: string | undefined): Promise<void>;
}

export interface ServerContext {
  api: EstevaoApi;
  config: Config;
  account?: AccountPreferences;
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

/**
 * Thrown when a call names no prayer book and the server has no default. Calendars,
 * saints, readings and offices differ between books, so guessing one would return
 * plausible but wrong data. Tool and resource handlers turn this into a regular
 * response that lists the catalogue, so the user can be asked which book they follow.
 */
export class PrayerBookRequiredError extends Error {
  constructor(
    readonly loadCatalogue: () => Promise<PrayerBook[]>,
    /** Whether the answer can be saved to the user's account with set_default_prayer_book. */
    readonly canSave = false,
  ) {
    super("No prayer book was given, and none is saved for the user or configured on the server.");
    this.name = "PrayerBookRequiredError";
  }
}

/** The live catalogue, shared with list_prayer_books and the prayer-books resource. */
export async function loadPrayerBookCatalogue(ctx: ServerContext): Promise<PrayerBook[]> {
  const books = await cached("prayer-books:all", TTL_METADATA, async () => ({
    prayerBooks: normalizePrayerBooks(await ctx.api.listPrayerBooks()),
  }));
  return books.prayerBooks;
}

/** The prayer book used when a call names none: the user's saved one, then the server's. */
export function fallbackPrayerBook(ctx: ServerContext): string | undefined {
  return ctx.account?.prayerBook || ctx.config.defaultPrayerBook;
}

/** Resolution order: the book the call names, the user's saved book, the server default. */
export function resolvePrayerBook(ctx: ServerContext, requested: string | undefined): string {
  const code = requested?.trim() || fallbackPrayerBook(ctx);
  if (!code) throw new PrayerBookRequiredError(() => loadPrayerBookCatalogue(ctx), Boolean(ctx.account));
  return code;
}

export const PRAYER_BOOK_REQUIRED_MESSAGE =
  "No prayer book was given, so no liturgical data was returned: calendars, saints, readings and " +
  "offices differ between prayer books. Ask the user which prayer book (or church) they follow, " +
  "using the list below, then call again with prayer_book set to its code. Keep using that code for " +
  "the rest of the conversation unless the user names a different book. Books marked premium are " +
  "not available through this server.";

export const SAVE_PRAYER_BOOK_HINT =
  "Once the user says which book they follow, save it with set_default_prayer_book so later " +
  "conversations use it without asking.";

/** The response given instead of data when no prayer book could be resolved. */
export async function prayerBookRequiredPayload(err: PrayerBookRequiredError): Promise<object> {
  let prayerBooks: Array<Pick<PrayerBook, "code" | "name" | "language" | "jurisdiction" | "year" | "premium">> | undefined;
  try {
    prayerBooks = (await err.loadCatalogue()).map(({ code, name, language, jurisdiction, year, premium }) => ({
      code,
      name,
      language,
      jurisdiction,
      year,
      premium,
    }));
  } catch {
    // The catalogue is a convenience here; without it, list_prayer_books still works.
    prayerBooks = undefined;
  }
  let message = PRAYER_BOOK_REQUIRED_MESSAGE;
  if (err.canSave) message += ` ${SAVE_PRAYER_BOOK_HINT}`;
  if (!prayerBooks) message += " The list could not be loaded right now; call list_prayer_books.";
  return {
    prayerBookRequired: true,
    message,
    ...(prayerBooks ? { prayerBooks } : {}),
  };
}

export function buildPreferences(ctx: ServerContext, args: PreferenceArgs): Preferences {
  return {
    prayerBook: resolvePrayerBook(ctx, args.prayer_book),
    bibleVersion: args.bible_version,
    language: args.language ?? ctx.config.language,
    readingType: args.reading_type,
    extra: args.preferences,
  };
}

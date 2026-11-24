import { z } from "zod";
import { PrayerBookRequiredError, prayerBookRequiredPayload, SAMPLE_PRAYER_BOOK_CODES } from "../context.js";
import { toToolResult } from "../client/errors.js";

export const prayerBookParam = z
  .string()
  .optional()
  .describe(
    "Prayer book code. Calendars, saints, readings and offices differ between books, so pass the book " +
      `the user follows, e.g. ${SAMPLE_PRAYER_BOOK_CODES.join(", ")}. There are over twenty editions — ` +
      "list_prayer_books has the current catalogue. When omitted, the server's configured default is used " +
      "if it has one; otherwise the tool returns the list of prayer books instead of data. Some editions " +
      "are premium-locked for API access.",
  );

export const preferencesParam = z
  .record(z.union([z.string(), z.number(), z.boolean()]))
  .optional()
  .describe(
    "Per-book preferences, e.g. { psalm_translation: 'coverdale', psalm_cycle: 'monthly' }. " +
      "Which keys and values a book accepts varies — call get_prayer_book_preferences first.",
  );

export const dateParam = z
  .string()
  .optional()
  .describe('Date as YYYY-MM-DD, or "today" (default) or "next-sunday".');

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

export function jsonResult(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

/** Wrap a tool handler so API failures become friendly isError results, never raw exceptions. */
export function safeHandler<A>(fn: (args: A) => Promise<ToolResult>): (args: A) => Promise<ToolResult> {
  return async (args: A) => {
    try {
      return await fn(args);
    } catch (err) {
      // Not an error: the call is valid, it just needs the user to pick a book first.
      if (err instanceof PrayerBookRequiredError) return jsonResult(await prayerBookRequiredPayload(err));
      return toToolResult(err);
    }
  };
}

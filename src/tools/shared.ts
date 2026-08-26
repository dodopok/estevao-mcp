import { z } from "zod";
import { SAMPLE_PRAYER_BOOK_CODES } from "../context.js";
import { toToolResult } from "../client/errors.js";

export const prayerBookParam = z
  .string()
  .optional()
  .describe(
    `Prayer book code (default loc_2015, IEAB pt-BR). Common ones: ${SAMPLE_PRAYER_BOOK_CODES.join(", ")}. ` +
      "There are over twenty editions, including Welsh, Spanish and historical books — call list_prayer_books " +
      "for the current catalogue. Some editions are premium-locked for API access.",
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
      return toToolResult(err);
    }
  };
}

import { z } from "zod";
import { PRAYER_BOOK_CODES } from "../context.js";
import { toToolResult } from "../client/errors.js";

export const prayerBookParam = z
  .enum(PRAYER_BOOK_CODES)
  .optional()
  .describe(
    "Prayer book code (default loc_2015, IEAB pt-BR). Others: locb_2008, loc_1987, loc_1662, loc_2021 (pt-BR); loc_2019_en, loc_1662_en, loc_1979_en (en); loc_2019_es (es). loc_2019 and loc_1549 are premium-locked for API access.",
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

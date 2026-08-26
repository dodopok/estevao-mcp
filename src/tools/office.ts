import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { buildPreferences } from "../context.js";
import { resolveDate, toIso } from "../dates.js";
import { cached, TTL_IMMUTABLE } from "../cache/lru.js";
import { normalizeDailyOffice } from "../normalize/dailyOffice.js";
import { renderOfficeMarkdown } from "../format/markdown.js";
import { dateParam, jsonResult, prayerBookParam, preferencesParam, safeHandler, textResult } from "./shared.js";
import type { Preferences } from "../client/endpoints.js";
import type { DailyOffice } from "../normalize/types.js";

const readOnly = { readOnlyHint: true } as const;

export async function fetchOffice(
  ctx: ServerContext,
  dateInput: string | undefined,
  office: string,
  prefs: Preferences,
  family = false,
): Promise<DailyOffice> {
  const date = resolveDate(dateInput, ctx.config.timezone);
  const key = `office:${toIso(date)}:${office}:${family}:${JSON.stringify(prefs)}`;
  return cached(key, TTL_IMMUTABLE, async () =>
    normalizeDailyOffice(await ctx.api.getDailyOffice(date, office, prefs, family), prefs.prayerBook),
  );
}

export function registerOfficeTools(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "get_daily_office",
    {
      title: "Get Daily Office",
      description:
        "The fully assembled Daily Office (Morning Prayer, Midday, Evening Prayer or Compline) for a date " +
        "and prayer book — every module (opening sentence, psalms, readings, canticles, prayers) with its " +
        "liturgical text. Returns readable markdown by default; use format=structured for JSON modules/lines.",
      inputSchema: {
        date: dateParam,
        office: z
          .enum(["morning", "midday", "evening", "compline", "late_evening"])
          .describe("Office type. Availability varies by prayer book (see list_prayer_books)."),
        family: z.boolean().optional().describe("Family rite variant, when the book supports it"),
        prayer_book: prayerBookParam,
        bible_version: z.string().optional(),
        preferences: preferencesParam,
        language: z
          .string()
          .optional()
          .describe("Label/response language: pt-BR, en or es (defaults to the prayer book's language)"),
        format: z.enum(["markdown", "structured"]).optional().describe("Output format (default markdown)"),
      },
      annotations: readOnly,
    },
    safeHandler(async (args) => {
      const prefs = buildPreferences(ctx, args);
      const office = await fetchOffice(ctx, args.date, args.office, prefs, args.family ?? false);
      if (args.format === "structured") return jsonResult(office);
      return textResult(renderOfficeMarkdown(office, prefs.language));
    }),
  );
}

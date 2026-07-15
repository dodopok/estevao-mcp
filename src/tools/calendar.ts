import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { buildPreferences } from "../context.js";
import { resolveDate, toIso } from "../dates.js";
import { cached, TTL_IMMUTABLE } from "../cache/lru.js";
import { normalizeCalendarMonth, normalizeLiturgicalDay } from "../normalize/calendar.js";
import { dateParam, jsonResult, prayerBookParam, safeHandler } from "./shared.js";

const readOnly = { readOnlyHint: true } as const;

export function registerCalendarTools(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "get_liturgical_day",
    {
      title: "Get liturgical day",
      description:
        "Full liturgical information for a date in the Anglican calendar: season, liturgical color, " +
        "liturgical year, celebration/saint (with precedence resolved), collect and lectionary readings. " +
        "Use this to answer 'what is celebrated on X' or 'what season/color is X'.",
      inputSchema: {
        date: dateParam,
        prayer_book: prayerBookParam,
        bible_version: z.string().optional().describe("Bible version code, e.g. nvi"),
        language: z.string().optional().describe("Response language: pt-BR, en or es"),
      },
      annotations: readOnly,
    },
    safeHandler(async (args) => {
      const date = resolveDate(args.date, ctx.config.timezone);
      const prefs = buildPreferences(ctx, args);
      const key = `day:${toIso(date)}:${JSON.stringify(prefs)}`;
      const day = await cached(key, TTL_IMMUTABLE, async () =>
        normalizeLiturgicalDay(await ctx.api.getCalendarDay(date, prefs), prefs.prayerBook),
      );
      return jsonResult(day);
    }),
  );

  server.registerTool(
    "get_calendar_month",
    {
      title: "Get calendar month",
      description:
        "Liturgical calendar grid for a month: one entry per day with liturgical color, " +
        "celebration name and week name. Compact — good for overviews and month views.",
      inputSchema: {
        year: z.number().int().min(1900).max(2200),
        month: z.number().int().min(1).max(12),
        prayer_book: prayerBookParam,
      },
      annotations: readOnly,
    },
    safeHandler(async (args) => {
      const prefs = buildPreferences(ctx, args);
      const key = `month:${args.year}-${args.month}:${prefs.prayerBook}`;
      const days = await cached(key, TTL_IMMUTABLE, async () => ({
        days: normalizeCalendarMonth(await ctx.api.getCalendarMonth(args.year, args.month, prefs)),
      }));
      return jsonResult(days);
    }),
  );

  server.registerTool(
    "get_year_overview",
    {
      title: "Get liturgical year overview",
      description:
        "Structure of a liturgical year: seasons with their date ranges, movable feasts " +
        "(Easter, Pentecost, Advent…) and key dates. Choose which sections to include.",
      inputSchema: {
        year: z.number().int().min(1900).max(2200),
        include: z
          .array(z.enum(["overview", "seasons", "key_dates"]))
          .optional()
          .describe("Sections to include (default: overview)"),
        prayer_book: prayerBookParam,
      },
      annotations: readOnly,
    },
    safeHandler(async (args) => {
      const prefs = buildPreferences(ctx, args);
      const sections = args.include?.length ? args.include : ["overview" as const];
      const result: Record<string, unknown> = { year: args.year, prayerBook: prefs.prayerBook };
      await Promise.all(
        sections.map(async (section) => {
          const key = `year-${section}:${args.year}:${prefs.prayerBook}`;
          result[section] = await cached(key, TTL_IMMUTABLE, async () => {
            switch (section) {
              case "overview":
                return (await ctx.api.getYearOverview(args.year, prefs)) as object;
              case "seasons":
                return (await ctx.api.getYearSeasons(args.year, prefs)) as object;
              case "key_dates":
                return (await ctx.api.getYearKeyDates(args.year, prefs)) as object;
            }
          });
        }),
      );
      return jsonResult(result);
    }),
  );
}

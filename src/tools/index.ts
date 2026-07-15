import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { buildPreferences } from "../context.js";
import { resolveDate, toIso } from "../dates.js";
import { cached, TTL_IMMUTABLE, TTL_METADATA } from "../cache/lru.js";
import { normalizeLiturgicalDay } from "../normalize/calendar.js";
import { normalizeLectionaryDay } from "../normalize/lectionary.js";
import { normalizeCelebrationSearch } from "../normalize/celebrations.js";
import { normalizeDailyOffice } from "../normalize/dailyOffice.js";
import { normalizePrayerBooks } from "../normalize/prayerBooks.js";
import { renderOfficeMarkdown } from "../format/markdown.js";
import { dateParam, jsonResult, prayerBookParam, safeHandler, textResult } from "./shared.js";

const readOnly = { readOnlyHint: true } as const;

export function registerTools(server: McpServer, ctx: ServerContext): void {
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
    "get_readings",
    {
      title: "Get lectionary readings",
      description:
        "Bible readings (lectionary) for a date: first reading, psalm, second reading and gospel. " +
        "Set all_services=true to also get readings split by service (Holy Eucharist, etc.).",
      inputSchema: {
        date: dateParam,
        all_services: z.boolean().optional().describe("Include readings for all services"),
        prayer_book: prayerBookParam,
        bible_version: z.string().optional(),
      },
      annotations: readOnly,
    },
    safeHandler(async (args) => {
      const date = resolveDate(args.date, ctx.config.timezone);
      const prefs = buildPreferences(ctx, args);
      if (args.all_services) {
        const key = `readings-all:${toIso(date)}:${JSON.stringify(prefs)}`;
        const raw = await cached(key, TTL_IMMUTABLE, async () =>
          (await ctx.api.getLectionaryAllServices(date, prefs)) as object,
        );
        return jsonResult(raw);
      }
      const key = `readings:${toIso(date)}:${JSON.stringify(prefs)}`;
      const day = await cached(key, TTL_IMMUTABLE, async () =>
        normalizeLectionaryDay(await ctx.api.getLectionaryDay(date, prefs), prefs.prayerBook),
      );
      return jsonResult(day);
    }),
  );

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
        format: z.enum(["markdown", "structured"]).optional().describe("Output format (default markdown)"),
      },
      annotations: readOnly,
    },
    safeHandler(async (args) => {
      const date = resolveDate(args.date, ctx.config.timezone);
      const prefs = buildPreferences(ctx, args);
      const key = `office:${toIso(date)}:${args.office}:${args.family ?? false}:${JSON.stringify(prefs)}`;
      const office = await cached(key, TTL_IMMUTABLE, async () =>
        normalizeDailyOffice(
          await ctx.api.getDailyOffice(date, args.office, prefs, args.family ?? false),
          prefs.prayerBook,
        ),
      );
      if (args.format === "structured") return jsonResult(office);
      return textResult(renderOfficeMarkdown(office));
    }),
  );

  server.registerTool(
    "search_celebrations",
    {
      title: "Search celebrations",
      description:
        "Full-text search of celebrations (feasts, saints, holy days) in a prayer book's calendar. " +
        "Returns name, type, rank, fixed date or movable flag, and liturgical color.",
      inputSchema: {
        query: z.string().min(1).describe("Search text, e.g. 'Pentecostes' or 'Agostinho'"),
        prayer_book: prayerBookParam,
      },
      annotations: readOnly,
    },
    safeHandler(async (args) => {
      const prefs = buildPreferences(ctx, args);
      const key = `celebrations-search:${args.query}:${prefs.prayerBook}`;
      const result = await cached(key, TTL_IMMUTABLE, async () =>
        normalizeCelebrationSearch(
          await ctx.api.searchCelebrations(args.query, prefs),
          prefs.prayerBook,
        ),
      );
      return jsonResult(result);
    }),
  );

  server.registerTool(
    "list_prayer_books",
    {
      title: "List prayer books",
      description:
        "All available prayer books (Livro de Oração Comum editions) with language, year, premium flag, " +
        "available offices and family-rite support. Also lists Bible versions when include_bible_versions=true.",
      inputSchema: {
        language: z.string().optional().describe("Filter by language: pt-BR, en or es"),
        include_bible_versions: z.boolean().optional(),
      },
      annotations: readOnly,
    },
    safeHandler(async (args) => {
      const books = await cached(`prayer-books:${args.language ?? "all"}`, TTL_METADATA, async () => ({
        prayerBooks: normalizePrayerBooks(await ctx.api.listPrayerBooks(args.language)),
      }));
      if (!args.include_bible_versions) return jsonResult(books);
      const versions = await cached(`bible-versions:${args.language ?? "all"}`, TTL_METADATA, async () =>
        (await ctx.api.listBibleVersions(args.language)) as object,
      );
      return jsonResult({ ...books, bibleVersions: versions });
    }),
  );
}

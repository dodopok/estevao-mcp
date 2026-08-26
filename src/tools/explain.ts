import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { buildPreferences } from "../context.js";
import { resolveDate, toIso } from "../dates.js";
import { cached, TTL_IMMUTABLE, TTL_METADATA } from "../cache/lru.js";
import { normalizeExplanation } from "../normalize/explanation.js";
import {
  dateParam,
  jsonResult,
  prayerBookParam,
  preferencesParam,
  safeHandler,
} from "./shared.js";

const readOnly = { readOnlyHint: true } as const;

export function registerExplanationTools(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "explain_liturgical_day",
    {
      title: "Explain a liturgical day",
      description:
        "The reasoning behind a date, not just the result: which celebration won on precedence and why, " +
        "whether anything was transferred and to where, how the colour was decided, which lectionary rule " +
        "picked each reading, and where the psalm came from. Use this whenever the question is 'why' — " +
        "why this saint and not that one, why this colour, why these readings — instead of inferring an " +
        "explanation from the data.",
      inputSchema: {
        date: dateParam,
        prayer_book: prayerBookParam,
        bible_version: z.string().optional().describe("Bible version code, e.g. nvi"),
        reading_type: z
          .enum(["semicontinuous", "thematic"])
          .optional()
          .describe("Lectionary track, where the book offers both"),
        service_type: z
          .string()
          .optional()
          .describe("Restrict the reading trail to one service, e.g. morning_prayer"),
        locale: z.string().optional().describe("Language of the explanation labels: pt-BR, en or es"),
        preferences: preferencesParam,
      },
      annotations: readOnly,
    },
    safeHandler(async (args) => {
      const date = resolveDate(args.date, ctx.config.timezone);
      const prefs = buildPreferences(ctx, args);
      const key = `explain:${toIso(date)}:${args.service_type ?? "-"}:${args.locale ?? "-"}:${JSON.stringify(prefs)}`;
      const explanation = await cached(key, TTL_IMMUTABLE, async () =>
        normalizeExplanation(
          await ctx.api.getLiturgicalExplanation(date, prefs, {
            serviceType: args.service_type,
            locale: args.locale,
          }),
        ),
      );
      return jsonResult(explanation);
    }),
  );

  server.registerTool(
    "get_prayer_book_preferences",
    {
      title: "Get prayer book preferences",
      description:
        "Which preferences a prayer book accepts, with their allowed values — psalm translation " +
        "(e.g. Coverdale for the English books), psalm cycles, canticle and opening-sentence choices, " +
        "family-rite options. Call this before passing `preferences` to the other tools: the keys and " +
        "values differ from book to book.",
      inputSchema: {
        prayer_book: z.string().describe("Prayer book code, e.g. loc_1662_en"),
      },
      annotations: readOnly,
    },
    safeHandler(async (args) => {
      const preferences = await cached(`preferences:${args.prayer_book}`, TTL_METADATA, async () =>
        (await ctx.api.getPrayerBookPreferences(args.prayer_book)) as object,
      );
      return jsonResult(preferences);
    }),
  );
}

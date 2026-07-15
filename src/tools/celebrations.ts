import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { buildPreferences } from "../context.js";
import { cached, TTL_IMMUTABLE, TTL_METADATA } from "../cache/lru.js";
import {
  normalizeCelebrationDetail,
  normalizeCelebrationSearch,
  normalizeCelebrationTypes,
} from "../normalize/celebrations.js";
import { jsonResult, prayerBookParam, safeHandler } from "./shared.js";

const readOnly = { readOnlyHint: true } as const;

const CELEBRATION_TYPES = [
  "principal_feast",
  "major_holy_day",
  "festival",
  "lesser_feast",
  "commemoration",
] as const;

export function registerCelebrationTools(server: McpServer, ctx: ServerContext): void {
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
        normalizeCelebrationSearch(await ctx.api.searchCelebrations(args.query, prefs), prefs.prayerBook),
      );
      return jsonResult(result);
    }),
  );

  server.registerTool(
    "list_celebrations",
    {
      title: "List celebrations",
      description:
        "Browse the sanctoral calendar of a prayer book with filters. Pass year to get celebrations " +
        "resolved onto actual dates of that year (movable feasts included); pass list_types=true to " +
        "get the celebration type taxonomy instead.",
      inputSchema: {
        type: z.enum(CELEBRATION_TYPES).optional(),
        movable: z.boolean().optional().describe("Only movable (true) or fixed-date (false) celebrations"),
        year: z.number().int().min(1900).max(2200).optional().describe("Resolve onto dates of this year"),
        grouped: z.boolean().optional().describe("With year: group celebrations by type"),
        list_types: z.boolean().optional().describe("Return the celebration type taxonomy only"),
        prayer_book: prayerBookParam,
      },
      annotations: readOnly,
    },
    safeHandler(async (args) => {
      const prefs = buildPreferences(ctx, args);
      if (args.list_types) {
        const types = await cached(`celebration-types`, TTL_METADATA, async () => ({
          types: normalizeCelebrationTypes(await ctx.api.getCelebrationTypes()),
        }));
        return jsonResult(types);
      }
      if (args.year !== undefined) {
        const key = `year-celebrations:${args.year}:${args.type ?? "all"}:${args.grouped ?? false}:${prefs.prayerBook}`;
        const raw = await cached(key, TTL_IMMUTABLE, async () =>
          (await ctx.api.getYearCelebrations(args.year!, prefs, {
            type: args.type,
            grouped: args.grouped,
          })) as object,
        );
        return jsonResult(raw);
      }
      const key = `celebrations:${args.type ?? "all"}:${args.movable ?? "all"}:${prefs.prayerBook}`;
      const result = await cached(key, TTL_IMMUTABLE, async () =>
        normalizeCelebrationSearch(
          await ctx.api.listCelebrations(prefs, { type: args.type, movable: args.movable }),
          prefs.prayerBook,
        ),
      );
      return jsonResult(result);
    }),
  );

  server.registerTool(
    "get_celebration",
    {
      title: "Get celebration",
      description:
        "Details of one celebration — description, transfer rules, calculation rule, collects and " +
        "readings. Look up by id (from search/list) OR by fixed date (month + day).",
      inputSchema: {
        id: z.union([z.number().int(), z.string()]).optional().describe("Celebration id"),
        month: z.number().int().min(1).max(12).optional(),
        day: z.number().int().min(1).max(31).optional(),
        prayer_book: prayerBookParam,
      },
      annotations: readOnly,
    },
    safeHandler(async (args) => {
      const prefs = buildPreferences(ctx, args);
      const byId = args.id !== undefined;
      const byDate = args.month !== undefined && args.day !== undefined;
      if (byId === byDate) {
        return {
          isError: true,
          content: [
            { type: "text" as const, text: "Provide either id OR month+day (exactly one of them)." },
          ],
        };
      }
      if (byId) {
        const key = `celebration:${args.id}:${prefs.prayerBook}`;
        const detail = await cached(key, TTL_IMMUTABLE, async () =>
          normalizeCelebrationDetail(await ctx.api.getCelebration(args.id!, prefs)),
        );
        return jsonResult(detail);
      }
      const key = `celebration-date:${args.month}-${args.day}:${prefs.prayerBook}`;
      const result = await cached(key, TTL_IMMUTABLE, async () =>
        normalizeCelebrationSearch(
          await ctx.api.getCelebrationByDate(args.month!, args.day!, prefs),
          prefs.prayerBook,
        ),
      );
      return jsonResult(result);
    }),
  );
}

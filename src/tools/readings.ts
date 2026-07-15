import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { buildPreferences } from "../context.js";
import { resolveDate, toIso } from "../dates.js";
import { cached, TTL_IMMUTABLE } from "../cache/lru.js";
import { normalizeCycleInfo, normalizeLectionaryDay } from "../normalize/lectionary.js";
import { dateParam, jsonResult, prayerBookParam, safeHandler } from "./shared.js";

const readOnly = { readOnlyHint: true } as const;

export function registerReadingsTools(server: McpServer, ctx: ServerContext): void {
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
    "get_lectionary_cycle",
    {
      title: "Get lectionary cycle",
      description:
        "Lectionary cycle information for a calendar year: Sunday cycle (A/B/C) and weekday cycle " +
        "(1/2), with descriptions. The liturgical year starts on Advent Sunday.",
      inputSchema: {
        year: z.number().int().min(1900).max(2200),
      },
      annotations: readOnly,
    },
    safeHandler(async (args) => {
      const cycle = await cached(`cycle:${args.year}`, TTL_IMMUTABLE, async () =>
        normalizeCycleInfo(await ctx.api.getLectionaryCycle(args.year)),
      );
      return jsonResult(cycle);
    }),
  );
}

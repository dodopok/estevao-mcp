import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { PRAYER_BOOK_CODES } from "../context.js";
import { resolveDate, toIso } from "../dates.js";
import { cached, TTL_IMMUTABLE } from "../cache/lru.js";
import { normalizeLiturgicalDay } from "../normalize/calendar.js";
import { renderOfficeMarkdown } from "../format/markdown.js";
import { labels, resolveLocale } from "../format/i18n.js";
import { fetchOffice } from "./office.js";
import { dateParam, jsonResult, safeHandler, textResult } from "./shared.js";

const readOnly = { readOnlyHint: true } as const;

export function registerCompareTools(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "compare_prayer_books",
    {
      title: "Compare prayer books",
      description:
        "Side-by-side comparison of 2–4 prayer books for the same date: either the liturgical day " +
        "(celebration, season, color, collect, readings) or the same Daily Office across editions. " +
        "Useful for comparing traditions, e.g. loc_1662 vs loc_2019_en.",
      inputSchema: {
        date: dateParam,
        books: z
          .array(z.enum(PRAYER_BOOK_CODES))
          .min(2)
          .max(4)
          .describe("Prayer book codes to compare"),
        aspect: z.enum(["day", "office"]).describe("Compare the liturgical day or a full office"),
        office: z
          .enum(["morning", "midday", "evening", "compline", "late_evening"])
          .optional()
          .describe("Required when aspect=office"),
        format: z.enum(["markdown", "structured"]).optional().describe("Output format (default markdown for office, structured for day)"),
      },
      annotations: readOnly,
    },
    safeHandler(async (args) => {
      if (args.aspect === "office" && !args.office) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: "office is required when aspect=office." }],
        };
      }

      if (args.aspect === "day") {
        const date = resolveDate(args.date, ctx.config.timezone);
        const entries = await Promise.all(
          args.books.map(async (book) => {
            const prefs = { prayerBook: book };
            const key = `day:${toIso(date)}:${JSON.stringify(prefs)}`;
            const day = await cached(key, TTL_IMMUTABLE, async () =>
              normalizeLiturgicalDay(await ctx.api.getCalendarDay(date, prefs), book),
            );
            return [
              book,
              {
                season: day.season,
                color: day.color,
                celebration: day.celebration,
                saint: day.saint,
                collects: day.collects,
                readings: day.readings,
              },
            ] as const;
          }),
        );
        const comparison = { date: toIso(date), comparison: Object.fromEntries(entries) };
        if (args.format === "markdown") {
          const t = labels(resolveLocale(ctx.config.language));
          const sections = entries.map(
            ([book, data]) =>
              `## ${book}\n\n- **${t.season}:** ${data.season ?? "—"}\n- **${t.color}:** ${data.color ?? "—"}\n` +
              `- **${t.celebration}:** ${celebrationName(data.celebration) ?? celebrationName(data.saint) ?? "—"}\n` +
              `- **${t.readings}:** ${JSON.stringify(data.readings ?? {})}`,
          );
          return textResult(`# ${t.comparison} — ${toIso(date)}\n\n${sections.join("\n\n")}`);
        }
        return jsonResult(comparison);
      }

      const offices = await Promise.all(
        args.books.map(async (book) => {
          try {
            return [book, await fetchOffice(ctx, args.date, args.office!, { prayerBook: book })] as const;
          } catch (err) {
            return [book, err instanceof Error ? { error: err.message } : { error: String(err) }] as const;
          }
        }),
      );
      if (args.format === "structured") {
        return jsonResult({ office: args.office, comparison: Object.fromEntries(offices) });
      }
      const t = labels(resolveLocale(ctx.config.language));
      const sections = offices.map(([book, office]) =>
        "error" in (office as object)
          ? `# ${book}\n\n*${t.unavailable}: ${(office as { error: string }).error}*`
          : `# ${book}\n\n${renderOfficeMarkdown(office as Parameters<typeof renderOfficeMarkdown>[0], ctx.config.language)}`,
      );
      return textResult(sections.join("\n\n---\n\n"));
    }),
  );
}

function celebrationName(value: unknown): string | undefined {
  if (value == null || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const name = record.name ?? record.nome;
  return name != null ? String(name) : undefined;
}

import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { buildPreferences } from "../context.js";
import { resolveDate, toIso } from "../dates.js";
import { cached, TTL_IMMUTABLE, TTL_METADATA } from "../cache/lru.js";
import { normalizeLiturgicalDay } from "../normalize/calendar.js";
import { normalizePrayerBooks } from "../normalize/prayerBooks.js";
import { normalizeDailyOffice } from "../normalize/dailyOffice.js";
import { renderOfficeMarkdown } from "../format/markdown.js";

const OFFICE_TYPES = ["morning", "midday", "evening", "compline", "late_evening"];

export function registerResources(server: McpServer, ctx: ServerContext): void {
  server.registerResource(
    "prayer-books",
    "ordo://prayer-books",
    {
      title: "Prayer books",
      description: "All available prayer books (LOC editions) with languages and offices",
      mimeType: "application/json",
    },
    async (uri) => {
      const books = await cached("prayer-books:all", TTL_METADATA, async () => ({
        prayerBooks: normalizePrayerBooks(await ctx.api.listPrayerBooks()),
      }));
      return jsonContents(uri.href, books);
    },
  );

  server.registerResource(
    "bible-versions",
    "ordo://bible-versions",
    {
      title: "Bible versions",
      description: "Available Bible translations",
      mimeType: "application/json",
    },
    async (uri) => {
      const versions = await cached("bible-versions:all", TTL_METADATA, async () =>
        (await ctx.api.listBibleVersions()) as object,
      );
      return jsonContents(uri.href, versions);
    },
  );

  server.registerResource(
    "today",
    "ordo://today",
    {
      title: "Today's liturgical day",
      description: "Liturgical information for today in the default prayer book",
      mimeType: "application/json",
    },
    async (uri) => {
      const day = await fetchDay(ctx, "today");
      return jsonContents(uri.href, day);
    },
  );

  server.registerResource(
    "day",
    new ResourceTemplate("ordo://day/{date}", { list: undefined }),
    {
      title: "Liturgical day",
      description: "Liturgical information for a date (YYYY-MM-DD) in the default prayer book",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const day = await fetchDay(ctx, String(variables.date));
      return jsonContents(uri.href, day);
    },
  );

  server.registerResource(
    "office",
    new ResourceTemplate("ordo://office/{date}/{office_type}", { list: undefined }),
    {
      title: "Daily Office",
      description:
        `Fully assembled Daily Office as markdown. date is YYYY-MM-DD or "today"; ` +
        `office_type is one of ${OFFICE_TYPES.join(", ")}.`,
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      const officeType = String(variables.office_type);
      if (!OFFICE_TYPES.includes(officeType)) {
        throw new Error(`Unknown office_type '${officeType}'. Use one of: ${OFFICE_TYPES.join(", ")}.`);
      }
      const date = resolveDate(String(variables.date), ctx.config.timezone);
      const prefs = buildPreferences(ctx, {});
      const key = `office:${toIso(date)}:${officeType}:false:${JSON.stringify(prefs)}`;
      const office = await cached(key, TTL_IMMUTABLE, async () =>
        normalizeDailyOffice(await ctx.api.getDailyOffice(date, officeType, prefs), prefs.prayerBook),
      );
      return {
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: renderOfficeMarkdown(office) }],
      };
    },
  );

  server.registerResource(
    "key-dates",
    new ResourceTemplate("ordo://calendar/{year}/key-dates", { list: undefined }),
    {
      title: "Key dates of a liturgical year",
      description: "Movable feasts and key dates for a year (Easter, Pentecost, Advent…)",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const year = Number(variables.year);
      if (!Number.isInteger(year)) throw new Error(`Invalid year '${String(variables.year)}'.`);
      const prefs = buildPreferences(ctx, {});
      const dates = await cached(`year-key_dates:${year}:${prefs.prayerBook}`, TTL_IMMUTABLE, async () =>
        (await ctx.api.getYearKeyDates(year, prefs)) as object,
      );
      return jsonContents(uri.href, dates);
    },
  );
}

async function fetchDay(ctx: ServerContext, dateInput: string): Promise<object> {
  const date = resolveDate(dateInput, ctx.config.timezone);
  const prefs = buildPreferences(ctx, {});
  const key = `day:${toIso(date)}:${JSON.stringify(prefs)}`;
  return cached(key, TTL_IMMUTABLE, async () =>
    normalizeLiturgicalDay(await ctx.api.getCalendarDay(date, prefs), prefs.prayerBook),
  );
}

function jsonContents(uri: string, value: unknown) {
  return {
    contents: [{ uri, mimeType: "application/json", text: JSON.stringify(value, null, 2) }],
  };
}

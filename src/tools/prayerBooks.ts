import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { cached, TTL_METADATA } from "../cache/lru.js";
import { normalizePrayerBooks } from "../normalize/prayerBooks.js";
import { jsonResult, safeHandler } from "./shared.js";

const readOnly = { readOnlyHint: true } as const;

export function registerPrayerBookTools(server: McpServer, ctx: ServerContext): void {
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

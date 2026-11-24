import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AccountPreferences, ServerContext } from "../context.js";
import { loadPrayerBookCatalogue } from "../context.js";
import { jsonResult, safeHandler, textResult } from "./shared.js";

/**
 * Tools that change the signed-in user's own settings on this server. They never write
 * to the Estevão API or touch liturgical data. Registered only when the request comes
 * from an OAuth sign-in, since that is the only mode with an account to save to.
 */
export function registerAccountTools(server: McpServer, ctx: ServerContext, account: AccountPreferences): void {
  server.registerTool(
    "set_default_prayer_book",
    {
      title: "Save my prayer book",
      description:
        "Saves the prayer book the user follows to their Estevão account. Later calls that name no " +
        "prayer_book, in this and future conversations, use it. Only the book code is stored. Pass " +
        "null to remove the saved book.",
      inputSchema: {
        prayer_book: z
          .string()
          .nullable()
          .describe("Prayer book code from list_prayer_books, or null to remove the saved one"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    safeHandler(async (args) => {
      const requested = args.prayer_book?.trim();
      if (!requested) {
        await account.savePrayerBook(undefined);
        return jsonResult({ saved: false, previous: account.prayerBook ?? null });
      }

      const catalogue = await loadPrayerBookCatalogue(ctx);
      const book = catalogue.find((b) => b.code.toLowerCase() === requested.toLowerCase());
      if (!book) {
        return {
          ...textResult(
            `Unknown prayer book '${requested}'. Available codes: ${catalogue.map((b) => b.code).join(", ")}.`,
          ),
          isError: true,
        };
      }
      if (book.premium) {
        return {
          ...textResult(
            `The prayer book '${book.code}' requires a premium subscription and is not available through ` +
              "this server, so it was not saved.",
          ),
          isError: true,
        };
      }

      await account.savePrayerBook(book.code);
      return jsonResult({
        saved: true,
        prayerBook: { code: book.code, name: book.name, language: book.language },
        previous: account.prayerBook ?? null,
      });
    }),
  );
}

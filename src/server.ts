import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import pkg from "../package.json" with { type: "json" };
import type { ServerContext } from "./context.js";
import { registerTools } from "./tools/index.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";

export const SERVER_NAME = "estevao-mcp";
export const SERVER_VERSION = pkg.version;

/**
 * Sent to the client at initialization; clients such as Claude add it to the model's
 * context. It settles the prayer book once per conversation, so the tools are not
 * called with a guessed book and the user is not asked again on every question.
 */
export function serverInstructions(defaultPrayerBook: string | undefined): string {
  const base =
    "Estêvão serves Anglican liturgical data, and every answer depends on the prayer book: calendars, " +
    "saints, readings, colours and offices differ between the editions served here. ";
  if (defaultPrayerBook) {
    return (
      base +
      `This server is configured with ${defaultPrayerBook} as its default prayer book, used when ` +
      "prayer_book is omitted. If the user follows a different book, pass its code on every call."
    );
  }
  return (
    base +
    "Before the first liturgical lookup in a conversation, establish which prayer book the user " +
    "follows: use the one they name; otherwise ask them, without assuming one (list_prayer_books has " +
    "the current catalogue). Then pass that prayer_book on every call for the rest of the conversation, " +
    "and use a different one only for a question where the user names a different book."
  );
}

/** Transport-agnostic server factory — entrypoints wire stdio/HTTP transports around this. */
export function createEstevaoServer(ctx: ServerContext): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    { instructions: serverInstructions(ctx.config.defaultPrayerBook) },
  );
  registerTools(server, ctx);
  registerResources(server, ctx);
  registerPrompts(server, ctx.config.defaultPrayerBook);
  return server;
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import pkg from "../package.json" with { type: "json" };
import { fallbackPrayerBook, type ServerContext } from "./context.js";
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
export function serverInstructions(ctx: Pick<ServerContext, "config" | "account">): string {
  const base =
    "Estêvão serves Anglican liturgical data, and every answer depends on the prayer book: calendars, " +
    "saints, readings, colours and offices differ between the editions served here. ";
  const savedBook = ctx.account?.prayerBook;
  if (savedBook) {
    return (
      base +
      `The user saved ${savedBook} as their prayer book; it is used whenever prayer_book is omitted, ` +
      "so there is no need to ask. For a question about another book, pass that book's code for that " +
      "question only. If the user says they now follow a different book, save it with " +
      "set_default_prayer_book."
    );
  }
  if (ctx.config.defaultPrayerBook) {
    return (
      base +
      `This server is configured with ${ctx.config.defaultPrayerBook} as its default prayer book, used ` +
      "when prayer_book is omitted. If the user follows a different book, pass its code on every call."
    );
  }
  const remember = ctx.account
    ? " Once they answer, save it with set_default_prayer_book, so later conversations use it without asking."
    : "";
  return (
    base +
    "Before the first liturgical lookup in a conversation, establish which prayer book the user " +
    "follows: use the one they name; otherwise ask them, without assuming one (list_prayer_books has " +
    `the current catalogue).${remember} Then pass that prayer_book on every call for the rest of the ` +
    "conversation, and use a different one only for a question where the user names a different book."
  );
}

/** Transport-agnostic server factory — entrypoints wire stdio/HTTP transports around this. */
export function createEstevaoServer(ctx: ServerContext): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    { instructions: serverInstructions(ctx) },
  );
  registerTools(server, ctx);
  registerResources(server, ctx);
  registerPrompts(server, fallbackPrayerBook(ctx));
  return server;
}

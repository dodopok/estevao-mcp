import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import pkg from "../package.json" with { type: "json" };
import type { ServerContext } from "./context.js";
import { registerTools } from "./tools/index.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";

export const SERVER_NAME = "estevao-mcp";
export const SERVER_VERSION = pkg.version;

/** Transport-agnostic server factory — entrypoints wire stdio/HTTP transports around this. */
export function createEstevaoServer(ctx: ServerContext): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });
  registerTools(server, ctx);
  registerResources(server, ctx);
  registerPrompts(server);
  return server;
}

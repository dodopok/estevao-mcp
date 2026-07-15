import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "./context.js";
import { registerTools } from "./tools/index.js";

export const SERVER_NAME = "estevao-mcp";
export const SERVER_VERSION = "0.1.0";

/** Transport-agnostic server factory — entrypoints wire stdio/HTTP transports around this. */
export function createEstevaoServer(ctx: ServerContext): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });
  registerTools(server, ctx);
  return server;
}

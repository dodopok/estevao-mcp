import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { EstevaoHttpClient } from "./client/http.js";
import { EstevaoApi } from "./client/endpoints.js";
import { createEstevaoServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const api = new EstevaoApi(new EstevaoHttpClient(config.baseUrl, config.apiKey));
  const server = createEstevaoServer({ api, config });
  await server.connect(new StdioServerTransport());
  // stdout is reserved for the MCP protocol — log to stderr only
  console.error(`estevao-mcp running (base URL: ${config.baseUrl})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

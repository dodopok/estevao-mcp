import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { registerCalendarTools } from "./calendar.js";
import { registerReadingsTools } from "./readings.js";
import { registerOfficeTools } from "./office.js";
import { registerCelebrationTools } from "./celebrations.js";
import { registerPrayerBookTools } from "./prayerBooks.js";
import { registerCompareTools } from "./compare.js";

export function registerTools(server: McpServer, ctx: ServerContext): void {
  registerCalendarTools(server, ctx);
  registerReadingsTools(server, ctx);
  registerOfficeTools(server, ctx);
  registerCelebrationTools(server, ctx);
  registerPrayerBookTools(server, ctx);
  registerCompareTools(server, ctx);
}

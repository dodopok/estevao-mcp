import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: {
    ...process.env,
    ESTEVAO_API_KEY: process.env.SMOKE_KEY!,
    ESTEVAO_BASE_URL: "http://localhost:3000",
  },
});

const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log("TOOLS:", tools.map((t) => t.name).join(", "));

function text(r: any): string {
  return r.content.find((c: any) => c.type === "text")?.text ?? "";
}

const day = await client.callTool({ name: "get_liturgical_day", arguments: { date: "today" } });
console.log("DAY isError:", day.isError ?? false);
console.log(text(day).slice(0, 400));

const readings = await client.callTool({ name: "get_readings", arguments: { date: "next-sunday" } });
console.log("READINGS isError:", readings.isError ?? false);
console.log(text(readings).slice(0, 400));

const office = await client.callTool({
  name: "get_daily_office",
  arguments: { date: "today", office: "compline" },
});
console.log("OFFICE isError:", office.isError ?? false);
console.log(text(office).slice(0, 500));

const month = await client.callTool({
  name: "get_calendar_month",
  arguments: { year: 2026, month: 12 },
});
console.log("MONTH isError:", month.isError ?? false, "|", text(month).slice(0, 200));

const compare = await client.callTool({
  name: "compare_prayer_books",
  arguments: { date: "2026-12-25", books: ["loc_2015", "loc_1662"], aspect: "day" },
});
console.log("COMPARE isError:", compare.isError ?? false, "|", text(compare).slice(0, 300));

const resource = await client.readResource({ uri: "ordo://today" });
console.log("RESOURCE ok:", (resource.contents[0] as any).text.slice(0, 120));

const prompts = await client.listPrompts();
console.log("PROMPTS:", prompts.prompts.map((p) => p.name).join(", "));

const premium = await client.callTool({
  name: "get_daily_office",
  arguments: { date: "today", office: "morning", prayer_book: "loc_1549" },
});
console.log("PREMIUM isError:", premium.isError ?? false, "|", text(premium).slice(0, 200));

await client.close();

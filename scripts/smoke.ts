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

const premium = await client.callTool({
  name: "get_daily_office",
  arguments: { date: "today", office: "morning", prayer_book: "loc_1549" },
});
console.log("PREMIUM isError:", premium.isError ?? false, "|", text(premium).slice(0, 200));

await client.close();

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { handlers, BASE_URL } from "./msw/handlers.js";
import { createEstevaoServer } from "../src/server.js";
import { EstevaoHttpClient } from "../src/client/http.js";
import { EstevaoApi } from "../src/client/endpoints.js";
import { clearCache } from "../src/cache/lru.js";
import type { Config } from "../src/config.js";

const msw = setupServer(...handlers);
beforeAll(() => msw.listen({ onUnhandledRequest: "error" }));
afterEach(() => msw.resetHandlers());
afterAll(() => msw.close());
beforeEach(() => clearCache());

const config: Config = {
  apiKey: `estevao_${"0".repeat(48)}`,
  baseUrl: BASE_URL,
  defaultPrayerBook: "loc_2015",
};

async function connectedClient(): Promise<Client> {
  const api = new EstevaoApi(new EstevaoHttpClient(config.baseUrl, config.apiKey));
  const server = createEstevaoServer({ api, config });
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function firstText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  const block = content.find((c) => c.type === "text");
  expect(block?.text).toBeDefined();
  return block!.text!;
}

describe("phase 2 tools", () => {
  it("lists all 11 tools", async () => {
    const client = await connectedClient();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "compare_prayer_books",
      "get_calendar_month",
      "get_celebration",
      "get_daily_office",
      "get_lectionary_cycle",
      "get_liturgical_day",
      "get_readings",
      "get_year_overview",
      "list_celebrations",
      "list_prayer_books",
      "search_celebrations",
    ]);
  });

  it("get_calendar_month normalizes the day grid", async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: "get_calendar_month",
      arguments: { year: 2026, month: 7 },
    });
    const body = JSON.parse(firstText(result));
    expect(body.days).toHaveLength(3);
    expect(body.days[2]).toEqual({
      date: "2026-07-25",
      color: "vermelho",
      celebration: "São Tiago, Apóstolo",
      week: null,
    });
  });

  it("get_year_overview fetches requested sections", async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: "get_year_overview",
      arguments: { year: 2026, include: ["overview", "key_dates"] },
    });
    const body = JSON.parse(firstText(result));
    expect(body.overview.movable_dates.easter).toBe("2026-04-05");
    expect(body.key_dates.pentecost).toBe("2026-05-24");
    expect(body.seasons).toBeUndefined();
  });

  it("list_celebrations returns the type taxonomy with list_types", async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: "list_celebrations",
      arguments: { list_types: true },
    });
    const body = JSON.parse(firstText(result));
    expect(body.types[0]).toEqual({
      value: "principal_feast",
      name: "Festa Principal",
      description: "Prevalece sobre tudo",
    });
  });

  it("get_celebration by id returns normalized detail", async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: "get_celebration", arguments: { id: 42 } });
    const body = JSON.parse(firstText(result));
    expect(body.name).toBe("Dia de Pentecostes");
    expect(body.description).toBe("Quinquagésimo dia após a Páscoa.");
    expect(body.calculationRule).toBe("easter + 49");
  });

  it("get_celebration rejects ambiguous input", async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: "get_celebration", arguments: {} });
    expect(result.isError).toBe(true);
  });

  it("get_lectionary_cycle maps Portuguese keys", async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: "get_lectionary_cycle", arguments: { year: 2026 } });
    const body = JSON.parse(firstText(result));
    expect(body).toEqual({
      year: 2026,
      sundayCycle: "C",
      weekdayCycle: "2",
      description: { sunday: "Ano C - Lucas", weekday: "Ano 2" },
    });
  });

  it("compare_prayer_books aspect=day returns per-book comparison", async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: "compare_prayer_books",
      arguments: { date: "2026-07-14", books: ["loc_2015", "loc_1662"], aspect: "day" },
    });
    const body = JSON.parse(firstText(result));
    expect(Object.keys(body.comparison).sort()).toEqual(["loc_1662", "loc_2015"]);
    expect(body.comparison.loc_2015.color).toBe("verde");
  });

  it("compare_prayer_books aspect=office survives a premium-locked book", async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: "compare_prayer_books",
      arguments: { date: "2026-07-14", books: ["loc_2015", "loc_1549"], aspect: "office", office: "compline" },
    });
    expect(result.isError).toBeFalsy();
    const text = firstText(result);
    expect(text).toContain("# loc_2015");
    expect(text).toContain("# loc_1549");
    expect(text).toContain("Unavailable");
  });
});

describe("resources", () => {
  it("lists static resources and templates", async () => {
    const client = await connectedClient();
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri).sort();
    expect(uris).toEqual(["ordo://bible-versions", "ordo://prayer-books", "ordo://today"]);
    const { resourceTemplates } = await client.listResourceTemplates();
    const templates = resourceTemplates.map((t) => t.uriTemplate).sort();
    expect(templates).toEqual([
      "ordo://calendar/{year}/key-dates",
      "ordo://day/{date}",
      "ordo://office/{date}/{office_type}",
    ]);
  });

  it("reads ordo://day/{date} as JSON", async () => {
    const client = await connectedClient();
    const result = await client.readResource({ uri: "ordo://day/2026-07-14" });
    const day = JSON.parse((result.contents[0] as { text: string }).text);
    expect(day.season).toBe("Tempo Comum");
  });

  it("reads ordo://office/{date}/{office_type} as markdown", async () => {
    const client = await connectedClient();
    const result = await client.readResource({ uri: "ordo://office/2026-07-14/compline" });
    const content = result.contents[0] as { mimeType?: string; text: string };
    expect(content.mimeType).toBe("text/markdown");
    expect(content.text).toContain("# Completas — 2026-07-14");
  });
});

describe("prompts", () => {
  it("lists only factual prompts (no homiletic content)", async () => {
    const client = await connectedClient();
    const { prompts } = await client.listPrompts();
    const names = prompts.map((p) => p.name).sort();
    expect(names).toEqual(["build_liturgy_sheet", "compare_traditions", "explain_feast"]);
    expect(names.join(",")).not.toMatch(/sermon|devotional|homil/i);
  });

  it("build_liturgy_sheet instructs faithful reproduction only", async () => {
    const client = await connectedClient();
    const prompt = await client.getPrompt({
      name: "build_liturgy_sheet",
      arguments: { office: "evening", date: "2026-07-19" },
    });
    const text = (prompt.messages[0].content as { text: string }).text;
    expect(text).toContain("get_daily_office");
    expect(text).toContain("FAITHFULLY");
    expect(text).toContain("Do not add commentary");
  });
});

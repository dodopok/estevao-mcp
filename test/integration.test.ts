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

describe("estevao-mcp end to end", () => {
  it("exposes the core tools, all read-only", async () => {
    const client = await connectedClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const core of [
      "get_daily_office",
      "get_liturgical_day",
      "get_readings",
      "list_prayer_books",
      "search_celebrations",
    ]) {
      expect(names).toContain(core);
    }
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
  });

  it("get_liturgical_day returns normalized JSON", async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: "get_liturgical_day",
      arguments: { date: "2026-07-14" },
    });
    const day = JSON.parse(firstText(result));
    expect(day.season).toBe("Tempo Comum");
    expect(day.color).toBe("verde");
    expect(day.prayerBook).toBe("loc_2015");
  });

  it("get_readings maps Portuguese keys to English", async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: "get_readings",
      arguments: { date: "2026-07-19" },
    });
    const day = JSON.parse(firstText(result));
    expect(day.readings.gospel.reference).toBe("Lucas 10.38-42");
    expect(day.readings.evangelho).toBeUndefined();
  });

  it("get_daily_office renders markdown by default", async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: "get_daily_office",
      arguments: { date: "2026-07-14", office: "compline" },
    });
    const text = firstText(result);
    expect(text).toContain("# Compline — 2026-07-14");
    expect(text).toContain("## Abertura");
  });

  it("get_daily_office returns a friendly error for premium prayer books", async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: "get_daily_office",
      arguments: { date: "2026-07-14", office: "morning", prayer_book: "loc_1549" },
    });
    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain("premium");
    expect(firstText(result)).toContain("Free alternatives");
  });

  it("search_celebrations returns normalized celebrations", async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: "search_celebrations",
      arguments: { query: "Pentecostes" },
    });
    const search = JSON.parse(firstText(result));
    expect(search.celebrations[0].name).toBe("Dia de Pentecostes");
    expect(search.celebrations[0].color).toBe("vermelho");
  });

  it("list_prayer_books includes premium flags and bible versions on request", async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: "list_prayer_books",
      arguments: { include_bible_versions: true },
    });
    const body = JSON.parse(firstText(result));
    expect(body.prayerBooks.map((b: { code: string }) => b.code)).toEqual(["loc_2015", "loc_1549"]);
    expect(body.prayerBooks[1].premium).toBe(true);
    expect(body.bibleVersions.data[0].code).toBe("NVI");
  });

  it("sends the X-API-Key header upstream", async () => {
    let seenKey: string | null = null;
    msw.use(
      // capture headers via a passthrough-style spy
      ...handlers.map((h) => h),
    );
    msw.events.on("request:start", ({ request }) => {
      seenKey = request.headers.get("X-API-Key");
    });
    const client = await connectedClient();
    await client.callTool({ name: "list_prayer_books", arguments: {} });
    expect(seenKey).toBe(config.apiKey);
  });
});

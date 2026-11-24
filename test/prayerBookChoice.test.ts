import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { handlers, BASE_URL } from "./msw/handlers.js";
import { createEstevaoServer } from "../src/server.js";
import { EstevaoHttpClient } from "../src/client/http.js";
import { EstevaoApi } from "../src/client/endpoints.js";
import { clearCache } from "../src/cache/lru.js";
import { loadConfig, type Config } from "../src/config.js";

// Without a configured default, a call that names no prayer book must not guess one:
// it answers with the catalogue so the user can be asked, and never reaches a
// date-scoped endpoint with a made-up book.
const msw = setupServer(...handlers);
beforeAll(() => msw.listen({ onUnhandledRequest: "error" }));
afterEach(() => msw.resetHandlers());
afterAll(() => msw.close());
beforeEach(() => clearCache());

const API_KEY = `estevao_${"0".repeat(48)}`;

async function connectedClient(overrides: Partial<Config> = {}): Promise<Client> {
  const config: Config = { apiKey: API_KEY, baseUrl: BASE_URL, ...overrides };
  const api = new EstevaoApi(new EstevaoHttpClient(config.baseUrl, config.apiKey));
  const server = createEstevaoServer({ api, config });
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function text(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content.find((c) => c.type === "text")!.text!;
}

/** Fails the test if any date-scoped endpoint is called. */
function forbidCalendarCalls(): void {
  msw.use(
    http.get(`${BASE_URL}/api/v1/calendar/*`, () => {
      throw new Error("calendar endpoint called without a prayer book");
    }),
    http.get(`${BASE_URL}/api/v1/lectionary/*`, () => {
      throw new Error("lectionary endpoint called without a prayer book");
    }),
    http.get(`${BASE_URL}/api/v1/daily_office/*`, () => {
      throw new Error("daily office endpoint called without a prayer book");
    }),
    http.get(`${BASE_URL}/api/v1/celebrations/*`, () => {
      throw new Error("celebrations endpoint called without a prayer book");
    }),
  );
}

describe("prayer book choice without a server default", () => {
  it("has no default unless ESTEVAO_DEFAULT_PRAYER_BOOK is set", () => {
    expect(loadConfig({ ESTEVAO_API_KEY: API_KEY }).defaultPrayerBook).toBeUndefined();
    expect(loadConfig({ ESTEVAO_API_KEY: API_KEY, ESTEVAO_DEFAULT_PRAYER_BOOK: " " }).defaultPrayerBook).toBeUndefined();
    expect(
      loadConfig({ ESTEVAO_API_KEY: API_KEY, ESTEVAO_DEFAULT_PRAYER_BOOK: "loc_1662_en" }).defaultPrayerBook,
    ).toBe("loc_1662_en");
  });

  it("answers a call without prayer_book with the catalogue, not an error", async () => {
    forbidCalendarCalls();
    const client = await connectedClient();
    const result = await client.callTool({ name: "get_liturgical_day", arguments: { date: "2026-07-14" } });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(text(result));
    expect(body.prayerBookRequired).toBe(true);
    expect(body.message).toMatch(/Ask the user which prayer book/);
    expect(body.prayerBooks.map((b: { code: string }) => b.code)).toEqual(["loc_2015", "loc_1549"]);
    expect(Object.keys(body.prayerBooks[0]).sort()).toEqual(
      ["code", "jurisdiction", "language", "name", "premium", "year"].sort(),
    );
  });

  it("asks the same way from every date-scoped tool", async () => {
    forbidCalendarCalls();
    const client = await connectedClient();
    for (const [name, args] of [
      ["get_readings", { date: "2026-07-19" }],
      ["get_daily_office", { date: "2026-07-14", office: "compline" }],
      ["get_calendar_month", { year: 2026, month: 7 }],
      ["explain_liturgical_day", { date: "2026-07-14" }],
      ["search_celebrations", { query: "Pentecostes" }],
    ] as const) {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError, name).toBeFalsy();
      expect(JSON.parse(text(result)).prayerBookRequired, name).toBe(true);
    }
  });

  it("uses the prayer book the call names", async () => {
    const client = await connectedClient();
    const result = await client.callTool({
      name: "get_liturgical_day",
      arguments: { date: "2026-07-14", prayer_book: "loc_2015" },
    });
    const day = JSON.parse(text(result));
    expect(day.prayerBookRequired).toBeUndefined();
    expect(day.prayerBook).toBe("loc_2015");
  });

  it("still asks when the catalogue cannot be loaded", async () => {
    forbidCalendarCalls();
    msw.use(http.get(`${BASE_URL}/api/v1/prayer_books`, () => new HttpResponse(null, { status: 503 })));
    const client = await connectedClient();
    const result = await client.callTool({ name: "get_liturgical_day", arguments: { date: "2026-07-14" } });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(text(result));
    expect(body.prayerBookRequired).toBe(true);
    expect(body.prayerBooks).toBeUndefined();
    expect(body.message).toMatch(/call list_prayer_books/);
  });

  it("answers book-dependent resources with the catalogue", async () => {
    forbidCalendarCalls();
    const client = await connectedClient();
    for (const uri of ["ordo://today", "ordo://day/2026-07-14", "ordo://office/2026-07-14/compline"]) {
      const { contents } = await client.readResource({ uri });
      const body = JSON.parse((contents[0] as { text: string }).text);
      expect(body.prayerBookRequired, uri).toBe(true);
    }
  });

  it("tells the model to settle the prayer book once per conversation", async () => {
    const client = await connectedClient();
    const instructions = client.getInstructions();
    expect(instructions).toMatch(/ask them, without assuming one/);
    expect(instructions).toMatch(/rest of the conversation/);
  });

  it("asks in the prompts only when no book is known", async () => {
    const client = await connectedClient();
    const open = await client.getPrompt({ name: "explain_why", arguments: { date: "2026-07-14" } });
    expect((open.messages[0].content as { text: string }).text).toMatch(/ask the user which prayer book/);

    const named = await client.getPrompt({
      name: "explain_why",
      arguments: { date: "2026-07-14", prayer_book: "loc_1662" },
    });
    expect((named.messages[0].content as { text: string }).text).not.toMatch(/ask the user which prayer book/);
  });
});

describe("prayer book choice with a server default", () => {
  it("uses the configured default and says so in the instructions", async () => {
    const client = await connectedClient({ defaultPrayerBook: "loc_2015" });
    const result = await client.callTool({ name: "get_liturgical_day", arguments: { date: "2026-07-14" } });
    expect(JSON.parse(text(result)).prayerBook).toBe("loc_2015");
    expect(client.getInstructions()).toMatch(/configured with loc_2015 as its default/);

    const prompt = await client.getPrompt({ name: "explain_why", arguments: { date: "2026-07-14" } });
    expect((prompt.messages[0].content as { text: string }).text).not.toMatch(/ask the user which prayer book/);
  });
});

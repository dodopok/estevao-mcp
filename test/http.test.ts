import { beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp, type HttpEnv } from "../src/http.js";
import { clearCache } from "../src/cache/lru.js";
import calendarDay from "./fixtures/calendar-day.json" with { type: "json" };

const VALID_KEY = `estevao_${"a".repeat(48)}`;
const BASE_URL = "https://api.test";

// Stub upstream fetch instead of msw: msw's interceptor buffers the SSE
// responses of our own express server, deadlocking the MCP client.
const upstreamFetch: typeof fetch = async (input) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  if (/\/api\/v1\/calendar\/\d+\/\d+\/\d+$/.test(url.pathname)) {
    return Response.json(calendarDay);
  }
  return Response.json({ error: { message: "not stubbed" } }, { status: 404 });
};

beforeEach(() => clearCache());

function env(overrides: Partial<HttpEnv> = {}): HttpEnv {
  return { baseUrl: BASE_URL, defaultPrayerBook: "loc_2015", upstreamFetch, ...overrides };
}

async function listen(
  appOrPromise: Awaited<ReturnType<typeof createApp>> | ReturnType<typeof createApp>,
): Promise<{ url: string; server: Server }> {
  const app = await appOrPromise;
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address() as { port: number };
      resolve({ url: `http://127.0.0.1:${address.port}/mcp`, server });
    });
  });
}

describe("Streamable HTTP transport", () => {
  it("passthrough mode: serves MCP with a per-request X-API-Key", async () => {
    const { url, server } = await listen(createApp(env()));
    try {
      const transport = new StreamableHTTPClientTransport(new URL(url), {
        requestInit: { headers: { "X-API-Key": VALID_KEY } },
      });
      const client = new Client({ name: "http-test", version: "0.0.0" });
      await client.connect(transport);
      const { tools } = await client.listTools();
      expect(tools.length).toBe(13);
      const result = await client.callTool({
        name: "get_liturgical_day",
        arguments: { date: "2026-07-14" },
      });
      const text = (result.content as Array<{ type: string; text?: string }>)[0].text!;
      expect(JSON.parse(text).season).toBe("Tempo Comum");
      await client.close();
    } finally {
      server.close();
    }
  });

  it("passthrough mode: rejects requests without a key", async () => {
    const { url, server } = await listen(createApp(env()));
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
      });
      expect(response.status).toBe(401);
      const body = (await response.json()) as { error: { message: string } };
      expect(body.error.message).toContain("X-API-Key");
    } finally {
      server.close();
    }
  });

  it("single-key mode: requires the bearer token when configured", async () => {
    const { url, server } = await listen(
      createApp(env({ apiKey: VALID_KEY, mcpToken: "secret-token" })),
    );
    try {
      const unauthorized = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
      });
      expect(unauthorized.status).toBe(401);

      const transport = new StreamableHTTPClientTransport(new URL(url), {
        requestInit: { headers: { Authorization: "Bearer secret-token" } },
      });
      const client = new Client({ name: "http-test", version: "0.0.0" });
      await client.connect(transport);
      const { tools } = await client.listTools();
      expect(tools.length).toBe(13);
      await client.close();
    } finally {
      server.close();
    }
  });

  it("GET /mcp returns 405 (stateless)", async () => {
    const { url, server } = await listen(createApp(env()));
    try {
      const response = await fetch(url);
      expect(response.status).toBe(405);
    } finally {
      server.close();
    }
  });

  it("healthz reports the auth mode", async () => {
    const { url, server } = await listen(createApp(env({ apiKey: VALID_KEY })));
    try {
      const response = await fetch(url.replace("/mcp", "/healthz"));
      const body = (await response.json()) as { mode: string };
      expect(body.mode).toBe("single-key");
    } finally {
      server.close();
    }
  });
});

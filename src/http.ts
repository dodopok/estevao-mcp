import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { LRUCache } from "lru-cache";
import { createEstevaoServer } from "./server.js";
import { EstevaoHttpClient } from "./client/http.js";
import { EstevaoApi } from "./client/endpoints.js";
import type { Config } from "./config.js";

const KEY_FORMAT = /^estevao_[0-9a-f]{48}$/;

export interface HttpEnv {
  /** Single-key mode: the server holds the upstream key. Unset → passthrough mode. */
  apiKey?: string;
  /** Optional bearer token protecting the endpoint in single-key mode. */
  mcpToken?: string;
  baseUrl: string;
  defaultPrayerBook: string;
  timezone?: string;
  allowedHosts?: string[];
  /** Test seam: fetch implementation used for upstream Estêvão API calls. */
  upstreamFetch?: typeof fetch;
}

export function loadHttpEnv(env: NodeJS.ProcessEnv = process.env): HttpEnv {
  const apiKey = env.ESTEVAO_API_KEY?.trim() || undefined;
  if (apiKey && !KEY_FORMAT.test(apiKey)) {
    throw new Error("ESTEVAO_API_KEY has an unexpected format.");
  }
  return {
    apiKey,
    mcpToken: env.ESTEVAO_MCP_TOKEN?.trim() || undefined,
    baseUrl: (env.ESTEVAO_BASE_URL ?? "https://api.caminhoanglicano.com.br").replace(/\/+$/, ""),
    defaultPrayerBook: env.ESTEVAO_DEFAULT_PRAYER_BOOK ?? "loc_2015",
    timezone: env.ESTEVAO_TIMEZONE,
    allowedHosts: env.ESTEVAO_MCP_ALLOWED_HOSTS?.split(",")
      .map((h) => h.trim())
      .filter(Boolean),
  };
}

/**
 * Streamable HTTP variant. Stateless (no sessions) so it scales horizontally.
 *
 * Auth modes:
 * - single-key: ESTEVAO_API_KEY set on the server; optionally require clients to
 *   send `Authorization: Bearer $ESTEVAO_MCP_TOKEN`.
 * - passthrough: no ESTEVAO_API_KEY; each request must carry the caller's own
 *   Estêvão key in `X-API-Key` (or `Authorization: Bearer estevao_…`).
 */
export function createApp(env: HttpEnv): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // One upstream client per key so the per-key rate-limit token bucket is shared.
  const clients = new LRUCache<string, EstevaoApi>({ max: 100 });
  const apiFor = (key: string): EstevaoApi => {
    let api = clients.get(key);
    if (!api) {
      api = new EstevaoApi(new EstevaoHttpClient(env.baseUrl, key, env.upstreamFetch ?? fetch));
      clients.set(key, api);
    }
    return api;
  };

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, mode: env.apiKey ? "single-key" : "passthrough" });
  });

  app.post("/mcp", async (req, res) => {
    const key = resolveKey(req, env, res);
    if (!key) return; // response already sent

    const config: Config = {
      apiKey: key,
      baseUrl: env.baseUrl,
      defaultPrayerBook: env.defaultPrayerBook,
      timezone: env.timezone,
    };
    const server = createEstevaoServer({ api: apiFor(key), config });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      ...(env.allowedHosts?.length
        ? { enableDnsRebindingProtection: true, allowedHosts: env.allowedHosts }
        : {}),
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("MCP request failed:", err);
      if (!res.headersSent) {
        res.status(500).json(jsonRpcError(-32603, "Internal server error"));
      }
    }
  });

  // Stateless mode: no SSE resumption stream, no sessions to delete.
  const methodNotAllowed = (_req: Request, res: Response) => {
    res.status(405).json(jsonRpcError(-32000, "Method not allowed (stateless server)"));
  };
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  return app;
}

function resolveKey(req: Request, env: HttpEnv, res: Response): string | undefined {
  if (env.apiKey) {
    if (env.mcpToken && req.headers.authorization !== `Bearer ${env.mcpToken}`) {
      res.status(401).json(jsonRpcError(-32001, "Invalid or missing bearer token"));
      return undefined;
    }
    return env.apiKey;
  }
  const header = req.headers["x-api-key"];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const key = fromHeader ?? (bearer && KEY_FORMAT.test(bearer) ? bearer : undefined);
  if (!key || !KEY_FORMAT.test(key)) {
    res
      .status(401)
      .json(
        jsonRpcError(
          -32001,
          "Missing Estêvão API key. Send it in the X-API-Key header (estevao_… format).",
        ),
      );
    return undefined;
  }
  return key;
}

function jsonRpcError(code: number, message: string) {
  return { jsonrpc: "2.0", error: { code, message }, id: null };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!);
if (isMain) {
  const env = loadHttpEnv();
  const port = Number(process.env.PORT ?? 3333);
  createApp(env).listen(port, () => {
    console.error(
      `estevao-mcp HTTP listening on :${port} (${env.apiKey ? "single-key" : "passthrough"} mode, upstream ${env.baseUrl})`,
    );
  });
}

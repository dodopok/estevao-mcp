import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp, type HttpEnv } from "../src/http.js";
import { MemoryOAuthStore } from "../src/auth/memoryStore.js";
import { parseEncryptionKey } from "../src/auth/crypto.js";
import { InvalidIdentityTokenError } from "../src/auth/firebase.js";
import type { AuthEnv } from "../src/auth/env.js";
import { clearCache } from "../src/cache/lru.js";
import calendarDay from "./fixtures/calendar-day.json" with { type: "json" };

const API_BASE = "https://api.test";
const MINTED_KEY = `estevao_${"b".repeat(48)}`;
const CLIENT_REDIRECT = "http://127.0.0.1:59999/callback";
const ENCRYPTION_KEY = "a".repeat(64);

interface Upstream {
  fetch: typeof fetch;
  calls: Array<{ url: string; apiKey?: string; authorization?: string }>;
  keyCreations: number;
  keyLimitReached: boolean;
}

/** Stubs the two Estêvão API surfaces the OAuth flow touches, and records every call. */
function upstream(): Upstream {
  const state: Upstream = {
    calls: [],
    keyCreations: 0,
    keyLimitReached: false,
    fetch: async (input, init) => {
      const request = input instanceof Request ? input : new Request(String(input), init);
      const url = new URL(request.url);
      state.calls.push({
        url: url.pathname,
        apiKey: request.headers.get("X-API-Key") ?? undefined,
        authorization: request.headers.get("Authorization") ?? undefined,
      });

      if (url.pathname === "/api/v1/developers/api_keys" && request.method === "POST") {
        if (state.keyLimitReached) {
          return Response.json({ error: "Key limit reached (max: 3)" }, { status: 403 });
        }
        state.keyCreations += 1;
        return Response.json(
          { id: 7, full_key: MINTED_KEY, key_preview: "estevao_bbbbbbbb…bbbb" },
          { status: 201 },
        );
      }
      if (url.host === "estevao-portal.firebaseapp.com") {
        return new Response(`handler for ${url.pathname}${url.search}`, {
          status: 200,
          headers: {
            "Content-Type": "text/html",
            "Set-Cookie": "firebaseSignIn=1; Path=/; HttpOnly",
          },
        });
      }
      if (url.pathname === "/api/v1/prayer_books") {
        return Response.json({ prayer_books: [] });
      }
      if (/\/api\/v1\/calendar\/\d+\/\d+\/\d+$/.test(url.pathname)) {
        return Response.json(calendarDay);
      }
      return Response.json({ error: { message: "not stubbed" } }, { status: 404 });
    },
  };
  return state;
}

async function reservePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

function authEnv(port: number): AuthEnv {
  const publicUrl = new URL(`http://127.0.0.1:${port}`);
  return {
    publicUrl,
    resource: new URL("/mcp", publicUrl),
    databaseSsl: false,
    encryptionKey: parseEncryptionKey(ENCRYPTION_KEY),
    developerFirebaseProjectId: "estevao-portal",
    firebase: { apiKey: "fake", authDomain: publicUrl.host, projectId: "estevao-portal" },
    firebaseHelperHost: "estevao-portal.firebaseapp.com",
    firebaseAuthProxy: true,
    portalUrl: "https://estevao.example",
    allowClientIdMetadataDocuments: true,
  };
}

interface Harness {
  origin: string;
  server: Server;
  up: Upstream;
  store: MemoryOAuthStore;
}

async function start(overrides: Partial<HttpEnv> = {}): Promise<Harness> {
  const port = await reservePort();
  const up = upstream();
  const store = new MemoryOAuthStore();
  const env: HttpEnv = {
    baseUrl: API_BASE,
    defaultPrayerBook: "loc_2015",
    upstreamFetch: up.fetch,
    auth: authEnv(port),
    store,
    verifyIdentity: async (idToken: string) => {
      if (idToken !== "valid-id-token") {
        throw new InvalidIdentityTokenError("Could not verify the sign-in token.");
      }
      return { providerUid: "firebase-uid-1", email: "dev@example.com", name: "Dev" };
    },
    ...overrides,
  };
  const app = await createApp(env);
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(port, "127.0.0.1", () => resolve(s));
  });
  return { origin: `http://127.0.0.1:${port}`, server, up, store };
}

function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

async function registerClient(origin: string): Promise<string> {
  const response = await fetch(`${origin}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Test MCP Client",
      redirect_uris: [CLIENT_REDIRECT],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { client_id: string }).client_id;
}

async function authorize(
  origin: string,
  clientId: string,
  challenge: string,
  extra: Record<string, string> = {},
): Promise<Response> {
  const url = new URL("/authorize", origin);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", CLIENT_REDIRECT);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("scope", "liturgy:read");
  url.searchParams.set("state", "state-123");
  url.searchParams.set("resource", `${origin}/mcp`);
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  return fetch(url, { redirect: "manual" });
}

/** Runs the whole browser-side flow and returns the authorization code. */
async function grantCode(
  origin: string,
  clientId: string,
  challenge: string,
  idToken = "valid-id-token",
): Promise<{ code: string; state: string | null }> {
  const authorizeResponse = await authorize(origin, clientId, challenge);
  expect(authorizeResponse.status).toBe(302);
  const consentUrl = new URL(authorizeResponse.headers.get("location")!);
  const requestId = consentUrl.searchParams.get("request")!;

  const approval = await fetch(`${origin}/oauth/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request: requestId, id_token: idToken }),
  });
  const body = (await approval.json()) as { redirect_to?: string; message?: string };
  expect(approval.status, body.message).toBe(200);
  const redirect = new URL(body.redirect_to!);
  return { code: redirect.searchParams.get("code")!, state: redirect.searchParams.get("state") };
}

async function exchangeCode(
  origin: string,
  clientId: string,
  code: string,
  verifier: string,
): Promise<Response> {
  return fetch(`${origin}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: clientId,
      redirect_uri: CLIENT_REDIRECT,
      resource: `${origin}/mcp`,
    }),
  });
}

beforeEach(() => clearCache());

describe("OAuth discovery", () => {
  it("advertises protected resource metadata at both well-known paths", async () => {
    const { origin, server } = await start();
    try {
      for (const path of [
        "/.well-known/oauth-protected-resource",
        "/.well-known/oauth-protected-resource/mcp",
      ]) {
        const metadata = (await (await fetch(`${origin}${path}`)).json()) as Record<string, any>;
        expect(metadata.resource).toBe(`${origin}/mcp`);
        expect(metadata.authorization_servers).toContain(`${origin}/`);
        expect(metadata.scopes_supported).toContain("liturgy:read");
      }
    } finally {
      server.close();
    }
  });

  it("advertises an OAuth 2.1 authorization server with PKCE, DCR and CIMD", async () => {
    const { origin, server } = await start();
    try {
      const metadata = (await (await fetch(`${origin}/.well-known/oauth-authorization-server`)).json()) as Record<string, any>;
      expect(metadata.code_challenge_methods_supported).toEqual(["S256"]);
      expect(metadata.registration_endpoint).toBe(`${origin}/register`);
      expect(metadata.client_id_metadata_document_supported).toBe(true);
      expect(metadata.grant_types_supported).toContain("refresh_token");
    } finally {
      server.close();
    }
  });

  it("challenges unauthenticated MCP requests with resource metadata", async () => {
    const { origin, server } = await start();
    try {
      const response = await fetch(`${origin}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      expect(response.status).toBe(401);
      const challenge = response.headers.get("www-authenticate")!;
      expect(challenge).toContain(`resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`);
      expect(challenge).toContain('scope="liturgy:read"');
    } finally {
      server.close();
    }
  });
});

describe("OAuth authorization flow", () => {
  it("signs a user in, provisions an API key and serves MCP with the issued token", async () => {
    const { origin, server, up } = await start();
    try {
      const clientId = await registerClient(origin);
      const { verifier, challenge } = pkce();
      const { code, state } = await grantCode(origin, clientId, challenge);
      expect(state).toBe("state-123");

      const tokenResponse = await exchangeCode(origin, clientId, code, verifier);
      expect(tokenResponse.status).toBe(200);
      const tokens = (await tokenResponse.json()) as {
        access_token: string;
        refresh_token: string;
        token_type: string;
        scope: string;
      };
      expect(tokens.token_type).toBe("Bearer");
      expect(tokens.scope).toBe("liturgy:read");
      expect(up.keyCreations).toBe(1);

      const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      });
      const client = new Client({ name: "oauth-test", version: "0.0.0" });
      await client.connect(transport);
      const result = await client.callTool({
        name: "get_liturgical_day",
        arguments: { date: "2026-07-14" },
      });
      const text = (result.content as Array<{ type: string; text?: string }>)[0].text!;
      expect(JSON.parse(text).season).toBe("Tempo Comum");
      await client.close();

      // The upstream API only ever sees the provisioned key — never the client's token.
      const liturgicalCalls = up.calls.filter((call) => call.url.startsWith("/api/v1/calendar"));
      expect(liturgicalCalls.length).toBeGreaterThan(0);
      for (const call of liturgicalCalls) expect(call.apiKey).toBe(MINTED_KEY);
      expect(up.calls.some((call) => call.authorization?.includes(tokens.access_token))).toBe(false);
    } finally {
      server.close();
    }
  });

  it("reuses the stored key on a second grant instead of minting another", async () => {
    const { origin, server, up } = await start();
    try {
      const clientId = await registerClient(origin);
      const first = pkce();
      await grantCode(origin, clientId, first.challenge);
      const second = pkce();
      await grantCode(origin, clientId, second.challenge);
      expect(up.keyCreations).toBe(1);
    } finally {
      server.close();
    }
  });

  it("rotates refresh tokens and rejects the used one", async () => {
    const { origin, server } = await start();
    try {
      const clientId = await registerClient(origin);
      const { verifier, challenge } = pkce();
      const { code } = await grantCode(origin, clientId, challenge);
      const tokens = (await (await exchangeCode(origin, clientId, code, verifier)).json()) as {
        refresh_token: string;
      };

      const refresh = async (token: string) =>
        fetch(`${origin}/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: token,
            client_id: clientId,
          }),
        });

      const rotated = await refresh(tokens.refresh_token);
      expect(rotated.status).toBe(200);
      const replay = await refresh(tokens.refresh_token);
      expect(replay.status).toBe(400);
      expect(((await replay.json()) as { error: string }).error).toBe("invalid_grant");
    } finally {
      server.close();
    }
  });
});

describe("OAuth hardening", () => {
  it("rejects a token exchange with the wrong PKCE verifier", async () => {
    const { origin, server } = await start();
    try {
      const clientId = await registerClient(origin);
      const { challenge } = pkce();
      const { code } = await grantCode(origin, clientId, challenge);
      const response = await exchangeCode(origin, clientId, code, pkce().verifier);
      expect(response.status).toBe(400);
      expect(((await response.json()) as { error: string }).error).toBe("invalid_grant");
    } finally {
      server.close();
    }
  });

  it("rejects a replayed authorization code", async () => {
    const { origin, server } = await start();
    try {
      const clientId = await registerClient(origin);
      const { verifier, challenge } = pkce();
      const { code } = await grantCode(origin, clientId, challenge);
      expect((await exchangeCode(origin, clientId, code, verifier)).status).toBe(200);
      const replay = await exchangeCode(origin, clientId, code, verifier);
      expect(replay.status).toBe(400);
      expect(((await replay.json()) as { error: string }).error).toBe("invalid_grant");
    } finally {
      server.close();
    }
  });

  it("refuses to issue tokens for a foreign resource", async () => {
    const { origin, server } = await start();
    try {
      const clientId = await registerClient(origin);
      const { challenge } = pkce();
      const response = await authorize(origin, clientId, challenge, {
        resource: "https://evil.example/mcp",
      });
      expect(response.status).toBe(302);
      const redirect = new URL(response.headers.get("location")!);
      expect(redirect.origin + redirect.pathname).toBe(CLIENT_REDIRECT);
      expect(redirect.searchParams.get("error")).toBe("invalid_target");
    } finally {
      server.close();
    }
  });

  it("rejects an unregistered redirect_uri before redirecting anywhere", async () => {
    const { origin, server } = await start();
    try {
      const clientId = await registerClient(origin);
      const { challenge } = pkce();
      const response = await authorize(origin, clientId, challenge, {
        redirect_uri: "https://evil.example/callback",
      });
      expect(response.status).toBe(400);
      expect(((await response.json()) as { error: string }).error).toBe("invalid_request");
    } finally {
      server.close();
    }
  });

  it("rejects an unverifiable sign-in token", async () => {
    const { origin, server } = await start();
    try {
      const clientId = await registerClient(origin);
      const { challenge } = pkce();
      const authorizeResponse = await authorize(origin, clientId, challenge);
      const requestId = new URL(authorizeResponse.headers.get("location")!).searchParams.get("request")!;
      const approval = await fetch(`${origin}/oauth/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: requestId, id_token: "forged" }),
      });
      expect(approval.status).toBe(401);
      expect(((await approval.json()) as { error: string }).error).toBe("invalid_identity_token");
    } finally {
      server.close();
    }
  });

  it("explains the Estêvão key limit instead of failing silently", async () => {
    const { origin, server, up } = await start();
    up.keyLimitReached = true;
    try {
      const clientId = await registerClient(origin);
      const { challenge } = pkce();
      const authorizeResponse = await authorize(origin, clientId, challenge);
      const requestId = new URL(authorizeResponse.headers.get("location")!).searchParams.get("request")!;
      const approval = await fetch(`${origin}/oauth/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: requestId, id_token: "valid-id-token" }),
      });
      expect(approval.status).toBe(409);
      const body = (await approval.json()) as { error: string; message: string };
      expect(body.error).toBe("key_limit_reached");
      expect(body.message).toContain("developer portal");
    } finally {
      server.close();
    }
  });

  it("rejects an access token minted for another resource", async () => {
    const { origin, server, store } = await start();
    try {
      const clientId = await registerClient(origin);
      const { verifier, challenge } = pkce();
      const { code } = await grantCode(origin, clientId, challenge);
      const tokens = (await (await exchangeCode(origin, clientId, code, verifier)).json()) as {
        access_token: string;
      };

      // Simulate a token whose audience is a different MCP deployment.
      const { tokenHash } = await import("../src/auth/crypto.js");
      const stored = await store.getToken(tokenHash(tokens.access_token));
      await store.createToken({ ...stored!, resource: "https://other.example/mcp" });

      const response = await fetch(`${origin}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokens.access_token}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      expect(response.status).toBe(401);
    } finally {
      server.close();
    }
  });

  it("renders the consent screen with the client name", async () => {
    const { origin, server } = await start();
    try {
      const clientId = await registerClient(origin);
      const { challenge } = pkce();
      const authorizeResponse = await authorize(origin, clientId, challenge);
      const consentUrl = authorizeResponse.headers.get("location")!;
      const page = await (await fetch(consentUrl)).text();
      expect(page).toContain("Test MCP Client");
      expect(page).toContain("Entrar com Google");
    } finally {
      server.close();
    }
  });

  it("still accepts plain API keys for existing integrations", async () => {
    const { origin, server } = await start();
    try {
      const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
        requestInit: { headers: { "X-API-Key": `estevao_${"c".repeat(48)}` } },
      });
      const client = new Client({ name: "legacy-test", version: "0.0.0" });
      await client.connect(transport);
      const { tools } = await client.listTools();
      expect(tools.length).toBe(11);
      await client.close();
    } finally {
      server.close();
    }
  });
});

describe("client compatibility", () => {
  it("answers CORS preflight so browser-based clients can connect", async () => {
    const { origin, server } = await start();
    try {
      const response = await fetch(`${origin}/mcp`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://claude.ai",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "authorization, content-type, mcp-protocol-version",
        },
      });
      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe("https://claude.ai");
      const allowed = response.headers.get("access-control-allow-headers")!.toLowerCase();
      expect(allowed).toContain("authorization");
      expect(allowed).toContain("mcp-protocol-version");
    } finally {
      server.close();
    }
  });

  it("exposes the auth challenge to browser JavaScript", async () => {
    const { origin, server } = await start();
    try {
      const response = await fetch(`${origin}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://claude.ai" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      expect(response.status).toBe(401);
      expect(response.headers.get("access-control-expose-headers")!.toLowerCase()).toContain(
        "www-authenticate",
      );
    } finally {
      server.close();
    }
  });

  it("challenges unauthenticated GET probes instead of dead-ending on 405", async () => {
    const { origin, server } = await start();
    try {
      const response = await fetch(`${origin}/mcp`, { headers: { Accept: "text/event-stream" } });
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain("resource_metadata=");
    } finally {
      server.close();
    }
  });

  it("serves the same authorization server metadata at every spelling clients probe", async () => {
    const { origin, server } = await start();
    try {
      const paths = [
        "/.well-known/oauth-authorization-server",
        "/.well-known/oauth-authorization-server/mcp",
        "/.well-known/openid-configuration",
        "/.well-known/openid-configuration/mcp",
      ];
      const documents = await Promise.all(
        paths.map(async (path) => {
          const response = await fetch(`${origin}${path}`);
          expect(response.status, path).toBe(200);
          return response.json() as Promise<Record<string, any>>;
        }),
      );
      for (const document of documents) {
        expect(document.token_endpoint).toBe(`${origin}/token`);
        expect(document.code_challenge_methods_supported).toEqual(["S256"]);
      }
    } finally {
      server.close();
    }
  });

  it("grants the read scope even when a client asks for unrelated scopes", async () => {
    const { origin, server } = await start();
    try {
      const clientId = await registerClient(origin);
      const { verifier, challenge } = pkce();
      const authorizeResponse = await authorize(origin, clientId, challenge, {
        scope: "openid profile email",
      });
      expect(authorizeResponse.status).toBe(302);
      const requestId = new URL(authorizeResponse.headers.get("location")!).searchParams.get("request")!;
      const approval = await fetch(`${origin}/oauth/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: requestId, id_token: "valid-id-token" }),
      });
      const code = new URL(((await approval.json()) as { redirect_to: string }).redirect_to)
        .searchParams.get("code")!;
      const tokens = (await (await exchangeCode(origin, clientId, code, verifier)).json()) as {
        scope: string;
      };
      expect(tokens.scope).toBe("liturgy:read");
    } finally {
      server.close();
    }
  });

  it("accepts HTTP Basic client authentication at the token endpoint", async () => {
    const { origin, server } = await start();
    try {
      // A confidential client: registering without token_endpoint_auth_method: none
      // makes the server issue a client secret.
      const registration = (await (
        await fetch(`${origin}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_name: "Confidential Client",
            redirect_uris: [CLIENT_REDIRECT],
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            token_endpoint_auth_method: "client_secret_basic",
          }),
        })
      ).json()) as { client_id: string; client_secret: string };

      const { verifier, challenge } = pkce();
      const { code } = await grantCode(origin, registration.client_id, challenge);
      const basic = Buffer.from(
        `${registration.client_id}:${registration.client_secret}`,
      ).toString("base64");

      const response = await fetch(`${origin}/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basic}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          code_verifier: verifier,
          redirect_uri: CLIENT_REDIRECT,
        }),
      });
      expect(response.status).toBe(200);
      expect(((await response.json()) as { access_token: string }).access_token).toMatch(/^emcp_at_/);
    } finally {
      server.close();
    }
  });
});

describe("Firebase sign-in helper proxy", () => {
  it("serves the sign-in helper from this origin, cookies included", async () => {
    const { origin, server } = await start();
    try {
      const response = await fetch(`${origin}/__/auth/handler?providerId=google.com`, {
        redirect: "manual",
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("handler for /__/auth/handler?providerId=google.com");
      expect(response.headers.get("set-cookie")).toContain("firebaseSignIn=1");
    } finally {
      server.close();
    }
  });

  it("points the consent page at this origin and signs in by redirect", async () => {
    const { origin, server } = await start();
    try {
      const clientId = await registerClient(origin);
      const { challenge } = pkce();
      const authorizeResponse = await authorize(origin, clientId, challenge);
      const page = await (await fetch(authorizeResponse.headers.get("location")!)).text();

      // Same-origin authDomain is what keeps in-app browsers and Safari's ITP
      // from breaking the sign-in round trip.
      expect(page).toContain(`"authDomain":"127.0.0.1:${new URL(origin).port}"`);
      expect(page).toContain("signInWithRedirect");
      expect(page).toContain("getRedirectResult");
      expect(page).not.toContain("signInWithPopup");
    } finally {
      server.close();
    }
  });
});

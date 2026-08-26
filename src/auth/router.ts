import express, { type Request, type Response, type Router } from "express";
import { createOAuthMetadata, mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { OAuthError, ServerError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { renderConsentPage, renderMessagePage, type FirebaseWebConfig } from "./consentPage.js";
import { InvalidIdentityTokenError } from "./firebase.js";
import { KeyProvisioningError } from "./estevaoKeys.js";
import { createFirebaseAuthProxy } from "./firebaseProxy.js";
import { LITURGY_SCOPE, type EstevaoOAuthProvider } from "./provider.js";

export interface AuthRouterOptions {
  provider: EstevaoOAuthProvider;
  issuer: URL;
  resource: URL;
  firebase: FirebaseWebConfig;
  /** When set, Firebase's sign-in helper is proxied from this origin. */
  firebaseHelperHost?: string;
  portalUrl: string;
  docsUrl?: string;
  /** Test seam for the sign-in helper proxy. */
  fetchFn?: typeof fetch;
}

/**
 * Everything the authorization server exposes:
 * discovery metadata, /authorize, /token, /register, /revoke and the consent screen.
 * Must be mounted at the application root.
 */
export function createAuthRouter(options: AuthRouterOptions): Router {
  const { provider, issuer, resource } = options;
  const router = express.Router();
  const oauthMetadata = createOAuthMetadata({ provider, issuerUrl: issuer, scopesSupported: [LITURGY_SCOPE] });

  const metadataDocument = { ...oauthMetadata, client_id_metadata_document_supported: true };
  const serveMetadata = (_req: Request, res: Response) => {
    cors(res);
    res.json(metadataDocument);
  };

  // Mounted before the SDK router so we can advertise Client ID Metadata Document
  // support, which the SDK's metadata document does not know about yet.
  //
  // Clients disagree on where to look: some append the resource path to the well-known
  // URI (RFC 8414 path insertion), and some only implement OpenID Connect discovery.
  // Serving all four spellings is what makes Claude, Codex, Gemini CLI, VS Code and
  // browser connectors all discover the same document.
  router.get("/.well-known/oauth-authorization-server", serveMetadata);
  router.get("/.well-known/oauth-authorization-server/mcp", serveMetadata);
  router.get("/.well-known/openid-configuration", serveMetadata);
  router.get("/.well-known/openid-configuration/mcp", serveMetadata);

  // The SDK serves protected resource metadata at the path-specific URL only; clients
  // are allowed to probe the root one too, so serve both.
  router.get("/.well-known/oauth-protected-resource", (_req, res) => {
    cors(res);
    res.json({
      resource: resource.href,
      authorization_servers: [issuer.href],
      scopes_supported: [LITURGY_SCOPE],
      resource_name: "Estêvão MCP",
      bearer_methods_supported: ["header"],
      resource_documentation: options.docsUrl,
    });
  });

  // Some clients authenticate at the token endpoint with HTTP Basic instead of form
  // fields. Normalise it before the SDK handler, which only reads the body.
  router.use("/token", express.urlencoded({ extended: false }), basicClientAuth);

  router.use(
    mcpAuthRouter({
      provider,
      issuerUrl: issuer,
      resourceServerUrl: resource,
      scopesSupported: [LITURGY_SCOPE],
      resourceName: "Estêvão MCP",
      ...(options.docsUrl ? { serviceDocumentationUrl: new URL(options.docsUrl) } : {}),
    }),
  );

  if (options.firebaseHelperHost) {
    const proxy = createFirebaseAuthProxy(options.firebaseHelperHost, options.fetchFn);
    router.use("/__/auth", proxy);
    router.use("/__/firebase", proxy);
  }

  router.get("/oauth/consent", async (req: Request, res: Response) => {
    const requestId = typeof req.query.request === "string" ? req.query.request : "";
    const context = requestId ? await provider.consentContext(requestId) : undefined;
    res.setHeader("Cache-Control", "no-store");
    if (!context) {
      res
        .status(400)
        .type("html")
        .send(
          renderMessagePage(
            "Pedido expirado",
            "Este pedido de conexão não existe mais. Volte ao seu cliente MCP e tente conectar novamente.",
          ),
        );
      return;
    }
    console.error(`[consent] rendered request=${truncate(requestId, 40)} client=${truncate(context.clientName, 60)}`);
    res
      .type("html")
      .send(
        renderConsentPage({
          requestId,
          context,
          firebase: options.firebase,
          portalUrl: options.portalUrl,
        }),
      );
  });

  router.post("/oauth/approve", express.json({ limit: "64kb" }), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const requestId = typeof req.body?.request === "string" ? req.body.request : "";
    const idToken = typeof req.body?.id_token === "string" ? req.body.id_token : "";
    if (!requestId || !idToken) {
      res.status(400).json({ error: "invalid_request", message: "Missing request or id_token." });
      return;
    }
    try {
      const { redirectTo } = await provider.completeAuthorization(requestId, idToken);
      console.error(`[consent] approved request=${truncate(requestId, 40)}`);
      res.json({ redirect_to: redirectTo });
    } catch (err) {
      console.error(
        `[consent] approve failed request=${truncate(requestId, 40)} error=${err instanceof Error ? err.message : String(err)}`,
      );
      respondWithConsentError(res, err);
    }
  });

  // Sign-in runs in the user's browser, so without this endpoint a failed connection
  // leaves no trace anywhere. Codes and flags only — never tokens.
  router.post("/oauth/diagnostics", express.json({ limit: "16kb" }), (req, res) => {
    const { request, stage, ...detail } = (req.body ?? {}) as Record<string, unknown>;
    const fields = Object.entries(detail)
      .map(([key, value]) => `${key}=${truncate(String(value))}`)
      .join(" ");
    console.error(
      `[consent] stage=${truncate(String(stage ?? "?"), 40)} request=${truncate(String(request ?? "?"), 40)} ` +
        `${fields} ua=${truncate(String(req.headers["user-agent"] ?? "?"))}`,
    );
    res.status(204).end();
  });

  router.post("/oauth/deny", express.json({ limit: "16kb" }), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const requestId = typeof req.body?.request === "string" ? req.body.request : "";
    const denied = requestId ? await provider.denyAuthorization(requestId) : undefined;
    res.json({ redirect_to: denied?.redirectTo });
  });

  return router;
}

/** Moves `Authorization: Basic <client_id:client_secret>` into the form body. */
function basicClientAuth(req: Request, _res: Response, next: () => void): void {
  const header = req.headers.authorization;
  if (!header?.toLowerCase().startsWith("basic ") || req.body?.client_id) {
    next();
    return;
  }
  const decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator > 0) {
    req.body = req.body ?? {};
    req.body.client_id = decodeURIComponent(decoded.slice(0, separator));
    req.body.client_secret = decodeURIComponent(decoded.slice(separator + 1));
  }
  next();
}

function truncate(value: string, max = 160): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function respondWithConsentError(res: Response, err: unknown): void {
  if (err instanceof KeyProvisioningError) {
    res.status(err.code === "key_limit_reached" ? 409 : 400).json({
      error: err.code,
      message: err.message,
    });
    return;
  }
  if (err instanceof InvalidIdentityTokenError) {
    res.status(401).json({ error: "invalid_identity_token", message: err.message });
    return;
  }
  if (err instanceof OAuthError) {
    res.status(err instanceof ServerError ? 500 : 400).json({
      error: err.errorCode,
      message: err.message,
    });
    return;
  }
  console.error("Consent approval failed:", err);
  res.status(500).json({ error: "server_error", message: "Could not complete the connection." });
}

function cors(res: Response): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=300");
}

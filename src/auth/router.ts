import express, { type Request, type Response, type Router } from "express";
import { createOAuthMetadata, mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { OAuthError, ServerError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { renderConsentPage, renderMessagePage, type FirebaseWebConfig } from "./consentPage.js";
import { InvalidIdentityTokenError } from "./firebase.js";
import { KeyProvisioningError } from "./estevaoKeys.js";
import { LITURGY_SCOPE, type EstevaoOAuthProvider } from "./provider.js";

export interface AuthRouterOptions {
  provider: EstevaoOAuthProvider;
  issuer: URL;
  resource: URL;
  firebase: FirebaseWebConfig;
  portalUrl: string;
  docsUrl?: string;
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

  // Mounted before the SDK router so we can advertise Client ID Metadata Document
  // support, which the SDK's metadata document does not know about yet.
  router.get("/.well-known/oauth-authorization-server", (_req, res) => {
    cors(res);
    res.json({ ...oauthMetadata, client_id_metadata_document_supported: true });
  });

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
      res.json({ redirect_to: redirectTo });
    } catch (err) {
      respondWithConsentError(res, err);
    }
  });

  router.post("/oauth/deny", express.json({ limit: "16kb" }), async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const requestId = typeof req.body?.request === "string" ? req.body.request : "";
    const denied = requestId ? await provider.denyAuthorization(requestId) : undefined;
    res.json({ redirect_to: denied?.redirectTo });
  });

  return router;
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

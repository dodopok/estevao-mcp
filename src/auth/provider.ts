import type { Response } from "express";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import {
  AccessDeniedError,
  InvalidGrantError,
  InvalidScopeError,
  InvalidTargetError,
  InvalidTokenError,
  ServerError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { EstevaoClientsStore } from "./clients.js";
import { decryptSecret, encryptSecret, randomId, randomToken, tokenHash } from "./crypto.js";
import { createApiKey, isKeyUsable, KeyProvisioningError } from "./estevaoKeys.js";
import type { IdentityVerifier } from "./firebase.js";
import type { OAuthStore } from "./store.js";

export const LITURGY_SCOPE = "liturgy:read";

export interface AuthServerConfig {
  store: OAuthStore;
  /** 32-byte key used to encrypt Estêvão API keys at rest. */
  encryptionKey: Buffer;
  /** Public origin of this MCP deployment, e.g. https://mcp.caminhoanglicano.com.br */
  issuer: URL;
  /** Canonical resource identifier of the MCP endpoint (RFC 8707). */
  resource: URL;
  apiBaseUrl: string;
  verifyIdentity: IdentityVerifier;
  allowClientIdMetadataDocuments?: boolean;
  accessTokenTtlSeconds?: number;
  refreshTokenTtlSeconds?: number;
  authorizationCodeTtlSeconds?: number;
  pendingAuthorizationTtlSeconds?: number;
  /** Test seam for upstream Estêvão API calls. */
  fetchFn?: typeof fetch;
}

export interface ConsentContext {
  clientName: string;
  clientUri?: string;
  redirectHost: string;
  scopes: string[];
}

export class EstevaoOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: EstevaoClientsStore;
  private readonly accessTtl: number;
  private readonly refreshTtl: number;
  private readonly codeTtl: number;
  private readonly pendingTtl: number;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly config: AuthServerConfig) {
    this.clientsStore = new EstevaoClientsStore(
      config.store,
      config.allowClientIdMetadataDocuments ?? true,
      config.fetchFn ?? fetch,
    );
    this.accessTtl = config.accessTokenTtlSeconds ?? 60 * 60;
    this.refreshTtl = config.refreshTokenTtlSeconds ?? 30 * 24 * 60 * 60;
    this.codeTtl = config.authorizationCodeTtlSeconds ?? 60;
    this.pendingTtl = config.pendingAuthorizationTtlSeconds ?? 10 * 60;
    this.fetchFn = config.fetchFn ?? fetch;
  }

  /** Step 1: park the request and send the user to the consent screen. */
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    this.assertResource(params.resource);
    const scopes = params.scopes?.length ? params.scopes : [LITURGY_SCOPE];
    const unsupported = scopes.filter((scope) => scope !== LITURGY_SCOPE);
    if (unsupported.length > 0) {
      throw new InvalidScopeError(`Unsupported scope(s): ${unsupported.join(", ")}`);
    }

    const id = randomId();
    await this.config.store.createPendingAuthorization({
      id,
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      scopes,
      state: params.state,
      resource: params.resource?.href,
      expiresAt: new Date(Date.now() + this.pendingTtl * 1000),
    });

    const consentUrl = new URL("/oauth/consent", this.config.issuer);
    consentUrl.searchParams.set("request", id);
    res.redirect(302, consentUrl.href);
  }

  /** Details rendered on the consent screen, so the user knows who is asking. */
  async consentContext(requestId: string): Promise<ConsentContext | undefined> {
    const pending = await this.config.store.getPendingAuthorization(requestId);
    if (!pending) return undefined;
    const client = await this.clientsStore.getClient(pending.clientId).catch(() => undefined);
    return {
      clientName: client?.client_name ?? pending.clientId,
      clientUri: typeof client?.client_uri === "string" ? client.client_uri : undefined,
      redirectHost: safeHost(pending.redirectUri),
      scopes: pending.scopes,
    };
  }

  /**
   * Step 2: the user signed in with the developer portal's Firebase project and
   * approved. Resolve their Estêvão API key and hand the client an authorization code.
   */
  async completeAuthorization(
    requestId: string,
    idToken: string,
  ): Promise<{ redirectTo: string }> {
    const pending = await this.config.store.getPendingAuthorization(requestId);
    if (!pending) {
      throw new InvalidGrantError("This authorization request expired. Start the connection again.");
    }

    const verified = await this.config.verifyIdentity(idToken);
    const identity = await this.config.store.upsertIdentity({
      providerUid: verified.providerUid,
      email: verified.email,
      name: verified.name,
    });

    await this.ensureApiKey(identity.id, identity.apiKeyCiphertext, idToken);

    const code = randomToken("emcp_ac");
    await this.config.store.createAuthorizationCode({
      codeHash: tokenHash(code),
      clientId: pending.clientId,
      identityId: identity.id,
      redirectUri: pending.redirectUri,
      codeChallenge: pending.codeChallenge,
      scopes: pending.scopes,
      resource: pending.resource,
      expiresAt: new Date(Date.now() + this.codeTtl * 1000),
    });
    await this.config.store.deletePendingAuthorization(requestId);

    const redirect = new URL(pending.redirectUri);
    redirect.searchParams.set("code", code);
    if (pending.state) redirect.searchParams.set("state", pending.state);
    return { redirectTo: redirect.href };
  }

  /** The user declined on the consent screen. */
  async denyAuthorization(requestId: string): Promise<{ redirectTo: string } | undefined> {
    const pending = await this.config.store.getPendingAuthorization(requestId);
    if (!pending) return undefined;
    await this.config.store.deletePendingAuthorization(requestId);
    const error = new AccessDeniedError("The user declined the connection.");
    const redirect = new URL(pending.redirectUri);
    redirect.searchParams.set("error", error.errorCode);
    redirect.searchParams.set("error_description", error.message);
    if (pending.state) redirect.searchParams.set("state", pending.state);
    return { redirectTo: redirect.href };
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const code = await this.config.store.peekAuthorizationCode(tokenHash(authorizationCode));
    if (!code || code.expiresAt.getTime() < Date.now()) {
      throw new InvalidGrantError("Invalid or expired authorization code.");
    }
    return code.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const code = await this.config.store.consumeAuthorizationCode(tokenHash(authorizationCode));
    if (!code) {
      throw new InvalidGrantError("Invalid or already used authorization code.");
    }
    if (code.clientId !== client.client_id) {
      throw new InvalidGrantError("Authorization code was issued to another client.");
    }
    if (code.expiresAt.getTime() < Date.now()) {
      throw new InvalidGrantError("Authorization code has expired.");
    }
    if (redirectUri !== undefined && redirectUri !== code.redirectUri) {
      throw new InvalidGrantError("redirect_uri does not match the authorization request.");
    }
    if ((resource?.href ?? code.resource) !== code.resource) {
      throw new InvalidTargetError("resource does not match the authorization request.");
    }

    return this.issueTokens(code.clientId, code.identityId, code.scopes, code.resource);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    const hash = tokenHash(refreshToken);
    const stored = await this.config.store.getToken(hash);
    if (!stored || stored.kind !== "refresh") {
      throw new InvalidGrantError("Invalid refresh token.");
    }
    if (stored.expiresAt.getTime() < Date.now()) {
      throw new InvalidGrantError("Refresh token has expired.");
    }
    if (stored.clientId !== client.client_id) {
      throw new InvalidGrantError("Refresh token was issued to another client.");
    }
    if (resource && resource.href !== stored.resource) {
      throw new InvalidTargetError("resource does not match the original grant.");
    }
    const requested = scopes?.length ? scopes : stored.scopes;
    if (requested.some((scope) => !stored.scopes.includes(scope))) {
      throw new InvalidScopeError("Cannot widen scopes on refresh.");
    }

    // Rotation: a refresh token is single-use (OAuth 2.1 for public clients).
    await this.config.store.revokeToken(hash);
    return this.issueTokens(stored.clientId, stored.identityId, requested, stored.resource);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const stored = await this.config.store.getToken(tokenHash(token));
    if (!stored || stored.kind !== "access") {
      throw new InvalidTokenError("Invalid access token.");
    }
    if (stored.expiresAt.getTime() < Date.now()) {
      throw new InvalidTokenError("Access token has expired.");
    }
    // Audience binding: a token minted for another resource is never accepted here.
    if (stored.resource && !this.matchesResource(stored.resource)) {
      throw new InvalidTokenError("Access token was not issued for this MCP server.");
    }

    return {
      token,
      clientId: stored.clientId,
      scopes: stored.scopes,
      expiresAt: Math.floor(stored.expiresAt.getTime() / 1000),
      resource: this.config.resource,
      extra: { identityId: stored.identityId },
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    await this.config.store.revokeToken(tokenHash(request.token));
  }

  /** Resolves the Estêvão API key behind an authenticated MCP request. */
  async apiKeyForToken(authInfo: AuthInfo): Promise<string> {
    const identityId = authInfo.extra?.identityId;
    if (typeof identityId !== "string") {
      throw new InvalidTokenError("Token is not bound to an identity.");
    }
    const identity = await this.config.store.getIdentity(identityId);
    if (!identity?.apiKeyCiphertext) {
      throw new InvalidTokenError("No Estêvão API key is linked to this account. Reconnect.");
    }
    try {
      return decryptSecret(identity.apiKeyCiphertext, this.config.encryptionKey);
    } catch {
      throw new ServerError("Could not read the stored Estêvão API key.");
    }
  }

  /** Drops a broken key and every token bound to it, forcing a clean reconnect. */
  async invalidateIdentityKey(authInfo: AuthInfo): Promise<void> {
    const identityId = authInfo.extra?.identityId;
    if (typeof identityId !== "string") return;
    await this.config.store.saveIdentityKey(identityId, undefined);
    await this.config.store.revokeIdentityTokens(identityId);
  }

  private async ensureApiKey(
    identityId: string,
    existingCiphertext: string | undefined,
    idToken: string,
  ): Promise<void> {
    if (existingCiphertext) {
      try {
        const existing = decryptSecret(existingCiphertext, this.config.encryptionKey);
        if (await isKeyUsable(this.config.apiBaseUrl, existing, this.fetchFn)) return;
      } catch {
        // Fall through and mint a new key.
      }
    }

    const provisioned = await createApiKey({
      baseUrl: this.config.apiBaseUrl,
      idToken,
      keyName: `MCP — ${new Date().toISOString().slice(0, 10)}`,
      fetchFn: this.fetchFn,
    });
    await this.config.store.saveIdentityKey(identityId, {
      ciphertext: encryptSecret(provisioned.key, this.config.encryptionKey),
      keyId: provisioned.keyId,
      preview: provisioned.preview,
    });
  }

  private async issueTokens(
    clientId: string,
    identityId: string,
    scopes: string[],
    resource: string | undefined,
  ): Promise<OAuthTokens> {
    const accessToken = randomToken("emcp_at");
    const refreshToken = randomToken("emcp_rt");
    const now = Date.now();

    await this.config.store.createToken({
      tokenHash: tokenHash(accessToken),
      kind: "access",
      clientId,
      identityId,
      scopes,
      resource,
      expiresAt: new Date(now + this.accessTtl * 1000),
    });
    await this.config.store.createToken({
      tokenHash: tokenHash(refreshToken),
      kind: "refresh",
      clientId,
      identityId,
      scopes,
      resource,
      expiresAt: new Date(now + this.refreshTtl * 1000),
    });

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: this.accessTtl,
      refresh_token: refreshToken,
      scope: scopes.join(" "),
    };
  }

  private assertResource(resource: URL | undefined): void {
    if (resource && !this.matchesResource(resource.href)) {
      throw new InvalidTargetError(
        `This authorization server only issues tokens for ${this.config.resource.href}.`,
      );
    }
  }

  /** Accepts the canonical resource with or without the /mcp path and trailing slash. */
  private matchesResource(candidate: string): boolean {
    const normalize = (value: string): string => value.replace(/\/+$/, "").toLowerCase();
    const target = normalize(this.config.resource.href);
    const normalized = normalize(candidate);
    return normalized === target || normalized === normalize(this.config.issuer.href);
  }
}

export { KeyProvisioningError };

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

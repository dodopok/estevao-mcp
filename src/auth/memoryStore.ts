import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { randomId } from "./crypto.js";
import type {
  AuthorizationCode,
  Identity,
  OAuthStore,
  PendingAuthorization,
  StoredToken,
} from "./store.js";

/**
 * In-memory store. Used by the test suite and by `dev:http` when no DATABASE_URL
 * is configured — everything is lost on restart, which is fine for both.
 */
export class MemoryOAuthStore implements OAuthStore {
  private clients = new Map<string, OAuthClientInformationFull>();
  private pending = new Map<string, PendingAuthorization>();
  private codes = new Map<string, AuthorizationCode & { consumed: boolean }>();
  private tokens = new Map<string, StoredToken & { revoked: boolean }>();
  private identities = new Map<string, Identity>();

  async init(): Promise<void> {}
  async close(): Promise<void> {}

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    return this.clients.get(clientId);
  }

  async saveClient(client: OAuthClientInformationFull): Promise<void> {
    this.clients.set(client.client_id, client);
  }

  async createPendingAuthorization(pending: PendingAuthorization): Promise<void> {
    this.pending.set(pending.id, pending);
  }

  async getPendingAuthorization(id: string): Promise<PendingAuthorization | undefined> {
    const found = this.pending.get(id);
    if (found && found.expiresAt.getTime() < Date.now()) {
      this.pending.delete(id);
      return undefined;
    }
    return found;
  }

  async deletePendingAuthorization(id: string): Promise<void> {
    this.pending.delete(id);
  }

  async createAuthorizationCode(code: AuthorizationCode): Promise<void> {
    this.codes.set(code.codeHash, { ...code, consumed: false });
  }

  async consumeAuthorizationCode(codeHash: string): Promise<AuthorizationCode | undefined> {
    const found = this.codes.get(codeHash);
    if (!found || found.consumed) return undefined;
    found.consumed = true;
    return found;
  }

  async peekAuthorizationCode(codeHash: string): Promise<AuthorizationCode | undefined> {
    const found = this.codes.get(codeHash);
    return found && !found.consumed ? found : undefined;
  }

  async createToken(token: StoredToken): Promise<void> {
    this.tokens.set(token.tokenHash, { ...token, revoked: false });
  }

  async getToken(tokenHash: string): Promise<StoredToken | undefined> {
    const found = this.tokens.get(tokenHash);
    return found && !found.revoked ? found : undefined;
  }

  async revokeToken(tokenHash: string): Promise<void> {
    const found = this.tokens.get(tokenHash);
    if (found) found.revoked = true;
  }

  async revokeIdentityTokens(identityId: string): Promise<void> {
    for (const token of this.tokens.values()) {
      if (token.identityId === identityId) token.revoked = true;
    }
  }

  async findIdentityByProviderUid(providerUid: string): Promise<Identity | undefined> {
    for (const identity of this.identities.values()) {
      if (identity.providerUid === providerUid) return identity;
    }
    return undefined;
  }

  async getIdentity(id: string): Promise<Identity | undefined> {
    return this.identities.get(id);
  }

  async upsertIdentity(identity: Omit<Identity, "id"> & { id?: string }): Promise<Identity> {
    const existing = await this.findIdentityByProviderUid(identity.providerUid);
    const merged: Identity = {
      ...existing,
      ...identity,
      id: existing?.id ?? identity.id ?? randomId(),
    };
    this.identities.set(merged.id, merged);
    return merged;
  }

  async saveIdentityKey(
    id: string,
    key: { ciphertext: string; keyId?: string; preview?: string } | undefined,
  ): Promise<void> {
    const identity = this.identities.get(id);
    if (!identity) return;
    identity.apiKeyCiphertext = key?.ciphertext;
    identity.apiKeyId = key?.keyId;
    identity.apiKeyPreview = key?.preview;
  }

  async purgeExpired(): Promise<void> {
    const now = Date.now();
    for (const [id, item] of this.pending) {
      if (item.expiresAt.getTime() < now) this.pending.delete(id);
    }
    for (const [hash, code] of this.codes) {
      if (code.expiresAt.getTime() < now) this.codes.delete(hash);
    }
    for (const [hash, token] of this.tokens) {
      if (token.expiresAt.getTime() < now) this.tokens.delete(hash);
    }
  }
}

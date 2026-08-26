import pg from "pg";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { randomId } from "./crypto.js";
import {
  SCHEMA_SQL,
  type AuthorizationCode,
  type Identity,
  type OAuthStore,
  type PendingAuthorization,
  type StoredToken,
} from "./store.js";

type IdentityRow = {
  id: string;
  provider_uid: string;
  email: string | null;
  name: string | null;
  api_key_ciphertext: string | null;
  api_key_id: string | null;
  api_key_preview: string | null;
};

export class PostgresOAuthStore implements OAuthStore {
  private readonly pool: pg.Pool;

  constructor(connectionString: string, ssl?: boolean) {
    this.pool = new pg.Pool({
      connectionString,
      max: 5,
      // Railway's internal network needs no TLS; managed public URLs usually do.
      ...(ssl ? { ssl: { rejectUnauthorized: false } } : {}),
    });
  }

  async init(): Promise<void> {
    await this.pool.query(SCHEMA_SQL);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const { rows } = await this.pool.query<{ metadata: OAuthClientInformationFull }>(
      "select metadata from oauth_clients where client_id = $1",
      [clientId],
    );
    return rows[0]?.metadata;
  }

  async saveClient(client: OAuthClientInformationFull): Promise<void> {
    await this.pool.query(
      `insert into oauth_clients (client_id, metadata) values ($1, $2)
       on conflict (client_id) do update set metadata = excluded.metadata`,
      [client.client_id, JSON.stringify(client)],
    );
  }

  async createPendingAuthorization(pending: PendingAuthorization): Promise<void> {
    await this.pool.query(
      `insert into oauth_pending_authorizations
         (id, client_id, redirect_uri, code_challenge, scopes, state, resource, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        pending.id,
        pending.clientId,
        pending.redirectUri,
        pending.codeChallenge,
        pending.scopes,
        pending.state ?? null,
        pending.resource ?? null,
        pending.expiresAt,
      ],
    );
  }

  async getPendingAuthorization(id: string): Promise<PendingAuthorization | undefined> {
    const { rows } = await this.pool.query(
      "select * from oauth_pending_authorizations where id = $1 and expires_at > now()",
      [id],
    );
    const row = rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      clientId: row.client_id,
      redirectUri: row.redirect_uri,
      codeChallenge: row.code_challenge,
      scopes: row.scopes ?? [],
      state: row.state ?? undefined,
      resource: row.resource ?? undefined,
      expiresAt: row.expires_at,
    };
  }

  async deletePendingAuthorization(id: string): Promise<void> {
    await this.pool.query("delete from oauth_pending_authorizations where id = $1", [id]);
  }

  async createAuthorizationCode(code: AuthorizationCode): Promise<void> {
    await this.pool.query(
      `insert into oauth_authorization_codes
         (code_hash, client_id, identity_id, redirect_uri, code_challenge, scopes, resource, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        code.codeHash,
        code.clientId,
        code.identityId,
        code.redirectUri,
        code.codeChallenge,
        code.scopes,
        code.resource ?? null,
        code.expiresAt,
      ],
    );
  }

  /** Atomic single-use claim: the UPDATE only matches while consumed_at is null. */
  async consumeAuthorizationCode(codeHash: string): Promise<AuthorizationCode | undefined> {
    const { rows } = await this.pool.query(
      `update oauth_authorization_codes set consumed_at = now()
       where code_hash = $1 and consumed_at is null
       returning *`,
      [codeHash],
    );
    return rows[0] ? mapCode(rows[0]) : undefined;
  }

  async peekAuthorizationCode(codeHash: string): Promise<AuthorizationCode | undefined> {
    const { rows } = await this.pool.query(
      "select * from oauth_authorization_codes where code_hash = $1 and consumed_at is null",
      [codeHash],
    );
    return rows[0] ? mapCode(rows[0]) : undefined;
  }

  async createToken(token: StoredToken): Promise<void> {
    await this.pool.query(
      `insert into oauth_tokens (token_hash, kind, client_id, identity_id, scopes, resource, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        token.tokenHash,
        token.kind,
        token.clientId,
        token.identityId,
        token.scopes,
        token.resource ?? null,
        token.expiresAt,
      ],
    );
  }

  async getToken(tokenHash: string): Promise<StoredToken | undefined> {
    const { rows } = await this.pool.query(
      "select * from oauth_tokens where token_hash = $1 and revoked_at is null",
      [tokenHash],
    );
    const row = rows[0];
    if (!row) return undefined;
    return {
      tokenHash: row.token_hash,
      kind: row.kind,
      clientId: row.client_id,
      identityId: row.identity_id,
      scopes: row.scopes ?? [],
      resource: row.resource ?? undefined,
      expiresAt: row.expires_at,
    };
  }

  async revokeToken(tokenHash: string): Promise<void> {
    await this.pool.query(
      "update oauth_tokens set revoked_at = now() where token_hash = $1 and revoked_at is null",
      [tokenHash],
    );
  }

  async revokeIdentityTokens(identityId: string): Promise<void> {
    await this.pool.query(
      "update oauth_tokens set revoked_at = now() where identity_id = $1 and revoked_at is null",
      [identityId],
    );
  }

  async findIdentityByProviderUid(providerUid: string): Promise<Identity | undefined> {
    const { rows } = await this.pool.query<IdentityRow>(
      "select * from oauth_identities where provider_uid = $1",
      [providerUid],
    );
    return rows[0] ? mapIdentity(rows[0]) : undefined;
  }

  async getIdentity(id: string): Promise<Identity | undefined> {
    const { rows } = await this.pool.query<IdentityRow>(
      "select * from oauth_identities where id = $1",
      [id],
    );
    return rows[0] ? mapIdentity(rows[0]) : undefined;
  }

  async upsertIdentity(identity: Omit<Identity, "id"> & { id?: string }): Promise<Identity> {
    const { rows } = await this.pool.query<IdentityRow>(
      `insert into oauth_identities (id, provider_uid, email, name)
       values ($1, $2, $3, $4)
       on conflict (provider_uid) do update
         set email = coalesce(excluded.email, oauth_identities.email),
             name = coalesce(excluded.name, oauth_identities.name),
             updated_at = now()
       returning *`,
      [identity.id ?? randomId(), identity.providerUid, identity.email ?? null, identity.name ?? null],
    );
    return mapIdentity(rows[0]);
  }

  async saveIdentityKey(
    id: string,
    key: { ciphertext: string; keyId?: string; preview?: string } | undefined,
  ): Promise<void> {
    await this.pool.query(
      `update oauth_identities
         set api_key_ciphertext = $2, api_key_id = $3, api_key_preview = $4, updated_at = now()
       where id = $1`,
      [id, key?.ciphertext ?? null, key?.keyId ?? null, key?.preview ?? null],
    );
  }

  async purgeExpired(): Promise<void> {
    await this.pool.query("delete from oauth_pending_authorizations where expires_at < now()");
    await this.pool.query(
      "delete from oauth_authorization_codes where expires_at < now() - interval '1 day'",
    );
    await this.pool.query("delete from oauth_tokens where expires_at < now() - interval '1 day'");
  }
}

function mapCode(row: Record<string, any>): AuthorizationCode {
  return {
    codeHash: row.code_hash,
    clientId: row.client_id,
    identityId: row.identity_id,
    redirectUri: row.redirect_uri,
    codeChallenge: row.code_challenge,
    scopes: row.scopes ?? [],
    resource: row.resource ?? undefined,
    expiresAt: row.expires_at,
  };
}

function mapIdentity(row: IdentityRow): Identity {
  return {
    id: row.id,
    providerUid: row.provider_uid,
    email: row.email ?? undefined,
    name: row.name ?? undefined,
    apiKeyCiphertext: row.api_key_ciphertext ?? undefined,
    apiKeyId: row.api_key_id ?? undefined,
    apiKeyPreview: row.api_key_preview ?? undefined,
  };
}

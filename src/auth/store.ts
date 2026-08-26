import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

export interface Identity {
  id: string;
  providerUid: string;
  email?: string;
  name?: string;
  /** Estêvão API key, encrypted at rest. Undefined until the first grant. */
  apiKeyCiphertext?: string;
  apiKeyId?: string;
  apiKeyPreview?: string;
}

export interface PendingAuthorization {
  id: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  state?: string;
  resource?: string;
  expiresAt: Date;
}

export interface AuthorizationCode {
  codeHash: string;
  clientId: string;
  identityId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  resource?: string;
  expiresAt: Date;
}

export interface StoredToken {
  tokenHash: string;
  kind: "access" | "refresh";
  clientId: string;
  identityId: string;
  scopes: string[];
  resource?: string;
  expiresAt: Date;
}

/**
 * Everything the authorization server needs to persist. Two implementations:
 * Postgres (production) and in-memory (tests, and `npm run dev:http` without a database).
 */
export interface OAuthStore {
  init(): Promise<void>;
  close(): Promise<void>;

  getClient(clientId: string): Promise<OAuthClientInformationFull | undefined>;
  saveClient(client: OAuthClientInformationFull): Promise<void>;

  createPendingAuthorization(pending: PendingAuthorization): Promise<void>;
  getPendingAuthorization(id: string): Promise<PendingAuthorization | undefined>;
  deletePendingAuthorization(id: string): Promise<void>;

  createAuthorizationCode(code: AuthorizationCode): Promise<void>;
  /** Single-use: returns the code only on the first call, undefined afterwards. */
  consumeAuthorizationCode(codeHash: string): Promise<AuthorizationCode | undefined>;
  peekAuthorizationCode(codeHash: string): Promise<AuthorizationCode | undefined>;

  createToken(token: StoredToken): Promise<void>;
  getToken(tokenHash: string): Promise<StoredToken | undefined>;
  revokeToken(tokenHash: string): Promise<void>;
  revokeIdentityTokens(identityId: string): Promise<void>;

  findIdentityByProviderUid(providerUid: string): Promise<Identity | undefined>;
  getIdentity(id: string): Promise<Identity | undefined>;
  upsertIdentity(identity: Omit<Identity, "id"> & { id?: string }): Promise<Identity>;
  saveIdentityKey(
    id: string,
    key: { ciphertext: string; keyId?: string; preview?: string } | undefined,
  ): Promise<void>;

  purgeExpired(): Promise<void>;
}

export const SCHEMA_SQL = `
create table if not exists oauth_clients (
  client_id text primary key,
  metadata jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists oauth_identities (
  id text primary key,
  provider_uid text not null unique,
  email text,
  name text,
  api_key_ciphertext text,
  api_key_id text,
  api_key_preview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists oauth_pending_authorizations (
  id text primary key,
  client_id text not null,
  redirect_uri text not null,
  code_challenge text not null,
  scopes text[] not null default '{}',
  state text,
  resource text,
  expires_at timestamptz not null
);

create table if not exists oauth_authorization_codes (
  code_hash text primary key,
  client_id text not null,
  identity_id text not null references oauth_identities(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  scopes text[] not null default '{}',
  resource text,
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create table if not exists oauth_tokens (
  token_hash text primary key,
  kind text not null check (kind in ('access', 'refresh')),
  client_id text not null,
  identity_id text not null references oauth_identities(id) on delete cascade,
  scopes text[] not null default '{}',
  resource text,
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists index_oauth_tokens_on_identity on oauth_tokens (identity_id);
create index if not exists index_oauth_tokens_on_expires_at on oauth_tokens (expires_at);
`;

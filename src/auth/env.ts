import { parseEncryptionKey } from "./crypto.js";
import type { FirebaseWebConfig } from "./consentPage.js";

export interface AuthEnv {
  publicUrl: URL;
  resource: URL;
  databaseUrl?: string;
  databaseSsl: boolean;
  encryptionKey: Buffer;
  developerFirebaseProjectId: string;
  firebase: FirebaseWebConfig;
  portalUrl: string;
  docsUrl?: string;
  allowClientIdMetadataDocuments: boolean;
}

const REQUIRED = [
  "MCP_PUBLIC_URL",
  "MCP_ENCRYPTION_KEY",
  "DEVELOPER_FIREBASE_PROJECT_ID",
  "FIREBASE_API_KEY",
  "FIREBASE_AUTH_DOMAIN",
] as const;

/**
 * OAuth is enabled when the whole set of variables is present. A partial set is a
 * configuration mistake, not a reason to silently fall back to API-key-only mode.
 */
export function loadAuthEnv(env: NodeJS.ProcessEnv = process.env): AuthEnv | undefined {
  const present = REQUIRED.filter((name) => env[name]?.trim());
  if (present.length === 0) return undefined;
  if (present.length < REQUIRED.length) {
    const missing = REQUIRED.filter((name) => !env[name]?.trim());
    throw new Error(
      `OAuth is partially configured. Missing: ${missing.join(", ")}. ` +
        "Set all of them, or none to run in API-key mode.",
    );
  }

  const publicUrl = new URL(env.MCP_PUBLIC_URL!.replace(/\/+$/, ""));
  if (publicUrl.protocol !== "https:" && !isLoopback(publicUrl.hostname)) {
    throw new Error("MCP_PUBLIC_URL must use https (except on localhost).");
  }

  return {
    publicUrl,
    resource: new URL("/mcp", publicUrl),
    databaseUrl: env.DATABASE_URL?.trim() || undefined,
    databaseSsl: parseBoolean(env.MCP_DATABASE_SSL) ?? isManagedDatabase(env.DATABASE_URL),
    encryptionKey: parseEncryptionKey(env.MCP_ENCRYPTION_KEY!),
    developerFirebaseProjectId: env.DEVELOPER_FIREBASE_PROJECT_ID!.trim(),
    firebase: {
      apiKey: env.FIREBASE_API_KEY!.trim(),
      authDomain: env.FIREBASE_AUTH_DOMAIN!.trim(),
      projectId: env.FIREBASE_PROJECT_ID?.trim() || env.DEVELOPER_FIREBASE_PROJECT_ID!.trim(),
    },
    portalUrl: (env.ESTEVAO_PORTAL_URL ?? "https://estevao.caminhoanglicano.com.br").replace(
      /\/+$/,
      "",
    ),
    docsUrl: env.ESTEVAO_DOCS_URL?.trim() || undefined,
    allowClientIdMetadataDocuments: parseBoolean(env.MCP_ALLOW_CLIENT_ID_METADATA_DOCUMENTS) ?? true,
  };
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value == null || value.trim() === "") return undefined;
  return ["1", "true", "yes"].includes(value.trim().toLowerCase());
}

function isManagedDatabase(url: string | undefined): boolean {
  if (!url) return false;
  return !/@(localhost|127\.0\.0\.1|[a-z0-9-]+\.railway\.internal)[:/]/i.test(url);
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

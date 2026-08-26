import { LRUCache } from "lru-cache";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import { InvalidClientError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthStore } from "./store.js";

const CIMD_TIMEOUT_MS = 5_000;
const CIMD_MAX_BYTES = 64 * 1024;

/**
 * Client registry supporting both mechanisms MCP clients use in the wild:
 *
 * - Dynamic Client Registration (RFC 7591) — the client POSTs to /register.
 * - Client ID Metadata Documents — the client_id *is* an HTTPS URL serving its
 *   own metadata. Preferred by the 2025-11-25 spec.
 */
export class EstevaoClientsStore implements OAuthRegisteredClientsStore {
  private readonly cimdCache = new LRUCache<string, OAuthClientInformationFull>({
    max: 200,
    ttl: 10 * 60 * 1000,
  });

  constructor(
    private readonly store: OAuthStore,
    private readonly allowClientIdMetadataDocuments: boolean,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    if (clientId.startsWith("https://")) {
      if (!this.allowClientIdMetadataDocuments) return undefined;
      return this.fetchClientIdMetadataDocument(clientId);
    }
    return this.store.getClient(clientId);
  }

  async registerClient(
    client: OAuthClientInformationFull,
  ): Promise<OAuthClientInformationFull> {
    await this.store.saveClient(client);
    return client;
  }

  private async fetchClientIdMetadataDocument(
    clientId: string,
  ): Promise<OAuthClientInformationFull> {
    const cached = this.cimdCache.get(clientId);
    if (cached) return cached;

    const url = parseClientIdUrl(clientId);
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        headers: { Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(CIMD_TIMEOUT_MS),
      });
    } catch {
      throw new InvalidClientError("Could not fetch the client_id metadata document.");
    }
    if (!response.ok) {
      throw new InvalidClientError(
        `The client_id metadata document returned ${response.status}.`,
      );
    }

    const raw = await response.text();
    if (raw.length > CIMD_MAX_BYTES) {
      throw new InvalidClientError("The client_id metadata document is too large.");
    }

    let document: OAuthClientInformationFull;
    try {
      document = JSON.parse(raw) as OAuthClientInformationFull;
    } catch {
      throw new InvalidClientError("The client_id metadata document is not valid JSON.");
    }

    if (document.client_id !== clientId) {
      throw new InvalidClientError("The metadata document's client_id does not match its URL.");
    }
    if (!Array.isArray(document.redirect_uris) || document.redirect_uris.length === 0) {
      throw new InvalidClientError("The client_id metadata document declares no redirect_uris.");
    }
    // Client ID Metadata Document clients are public clients: they hold no secret here.
    delete document.client_secret;

    this.cimdCache.set(clientId, document);
    return document;
  }
}

/** Rejects non-HTTPS, path-less and internal-network URLs (SSRF guard). */
function parseClientIdUrl(clientId: string): URL {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    throw new InvalidClientError("Invalid client_id.");
  }
  if (url.protocol !== "https:") {
    throw new InvalidClientError("A URL client_id must use https.");
  }
  if (url.pathname === "/" || url.pathname === "") {
    throw new InvalidClientError("A URL client_id must contain a path component.");
  }
  if (url.hash) {
    throw new InvalidClientError("A URL client_id must not contain a fragment.");
  }
  if (isInternalHost(url.hostname)) {
    throw new InvalidClientError("A URL client_id must not point at an internal address.");
  }
  return url;
}

function isInternalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return true;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd")) return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4) return false;
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  return (
    a === 127 || a === 10 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)
  );
}

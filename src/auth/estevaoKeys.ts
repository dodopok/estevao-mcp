/**
 * Provisioning of Estêvão API keys on behalf of a signed-in developer.
 *
 * Uses the developer portal's own endpoints (`/api/v1/developers/api_keys`) with the
 * caller's Firebase ID token — the Estêvão API needs no changes to support OAuth here.
 * The resulting key never leaves this server: it is encrypted at rest and only ever
 * travels to the Estêvão API in the `X-API-Key` header.
 */

export class KeyProvisioningError extends Error {
  constructor(
    message: string,
    readonly code: "key_limit_reached" | "not_approved" | "unauthorized" | "upstream_error",
  ) {
    super(message);
    this.name = "KeyProvisioningError";
  }
}

export interface ProvisionedKey {
  key: string;
  keyId?: string;
  preview?: string;
}

interface ApiKeyResponse {
  id?: number;
  full_key?: string;
  key_preview?: string;
  error?: string;
  errors?: string[];
}

const REQUEST_TIMEOUT_MS = 15_000;

export interface ProvisionOptions {
  baseUrl: string;
  idToken: string;
  keyName: string;
  fetchFn?: typeof fetch;
}

/** Creates a fresh API key for the signed-in developer. */
export async function createApiKey({
  baseUrl,
  idToken,
  keyName,
  fetchFn = fetch,
}: ProvisionOptions): Promise<ProvisionedKey> {
  const response = await fetchFn(`${baseUrl}/api/v1/developers/api_keys`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ api_key: { name: keyName } }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body = (await safeJson(response)) as ApiKeyResponse | undefined;

  if (response.status === 401) {
    throw new KeyProvisioningError("The Estêvão API rejected this sign-in.", "unauthorized");
  }
  if (response.status === 403) {
    const message = body?.error ?? "";
    if (/limit/i.test(message)) {
      throw new KeyProvisioningError(
        "You have reached the maximum number of API keys on your Estêvão account. " +
          "Delete one in the developer portal and try connecting again.",
        "key_limit_reached",
      );
    }
    throw new KeyProvisioningError(
      message || "Your developer account is not approved yet.",
      "not_approved",
    );
  }
  if (!response.ok || !body?.full_key) {
    throw new KeyProvisioningError(
      body?.error ?? body?.errors?.join(", ") ?? `Estêvão API returned ${response.status}.`,
      "upstream_error",
    );
  }

  return {
    key: body.full_key,
    keyId: body.id != null ? String(body.id) : undefined,
    preview: body.key_preview,
  };
}

/**
 * Cheap liveness check for a stored key: a developer may have deleted or rotated it
 * in the portal since the last grant, in which case we mint a new one.
 */
export async function isKeyUsable(
  baseUrl: string,
  key: string,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchFn(`${baseUrl}/api/v1/prayer_books`, {
      headers: { "X-API-Key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return response.status !== 401 && response.status !== 403;
  } catch {
    // Network trouble is not proof that the key is bad — keep it.
    return true;
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

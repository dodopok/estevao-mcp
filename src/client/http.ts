import { EstevaoApiError, PremiumRequiredError, RateLimitError } from "./errors.js";

export type QueryParams = Record<string, string | number | boolean | undefined>;

const MAX_REQUESTS_PER_MINUTE = 55; // API allows 60/min per key — leave headroom
const REQUEST_TIMEOUT_MS = 15_000;

export class EstevaoHttpClient {
  private requestTimestamps: number[] = [];

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async get<T>(path: string, params: QueryParams = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    await this.throttle();
    let response: Response;
    try {
      response = await this.request(url);
    } catch {
      // one retry with jitter on network failure
      await sleep(300 + Math.random() * 500);
      response = await this.request(url);
    }

    if (response.status === 429) {
      const retryAfter = await parseRetryAfter(response);
      if (retryAfter != null && retryAfter <= 5) {
        await sleep(retryAfter * 1000);
        response = await this.request(url);
        if (response.ok) return (await response.json()) as T;
      }
      throw new RateLimitError("Rate limit exceeded", retryAfter);
    }

    if (response.status >= 500) {
      await sleep(300 + Math.random() * 500);
      response = await this.request(url);
    }

    if (!response.ok) {
      const body = await safeJson(response);
      const code = extractCode(body);
      if (response.status === 403 && code === "PREMIUM_REQUIRED") {
        throw new PremiumRequiredError(String(params["preferences[prayer_book_code]"] ?? ""));
      }
      throw new EstevaoApiError(extractMessage(body) ?? response.statusText, response.status, code);
    }

    return (await response.json()) as T;
  }

  private request(url: URL): Promise<Response> {
    this.requestTimestamps.push(Date.now());
    return this.fetchFn(url, {
      headers: { "X-API-Key": this.apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  private async throttle(): Promise<void> {
    const cutoff = Date.now() - 60_000;
    this.requestTimestamps = this.requestTimestamps.filter((t) => t > cutoff);
    if (this.requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
      const oldest = this.requestTimestamps[0];
      await sleep(oldest + 60_000 - Date.now() + 50);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function parseRetryAfter(response: Response): Promise<number | undefined> {
  const header = response.headers.get("Retry-After");
  if (header && !Number.isNaN(Number(header))) return Number(header);
  const body = (await safeJson(response)) as { error?: { retry_after?: number } } | undefined;
  return body?.error?.retry_after;
}

function extractCode(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const error = (body as { error?: unknown }).error;
  if (typeof error === "object" && error !== null) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

function extractMessage(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const record = body as { error?: { message?: string }; mensagem?: string; message?: string };
  return record.error?.message ?? record.mensagem ?? record.message;
}

export class EstevaoApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "EstevaoApiError";
  }
}

export class RateLimitError extends EstevaoApiError {
  constructor(
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message, 429, "RATE_LIMIT_EXCEEDED");
    this.name = "RateLimitError";
  }
}

export class PremiumRequiredError extends EstevaoApiError {
  constructor(readonly prayerBook?: string) {
    super(
      `The prayer book${prayerBook ? ` '${prayerBook}'` : ""} requires a premium subscription and is not available through the external API.`,
      403,
      "PREMIUM_REQUIRED",
    );
    this.name = "PremiumRequiredError";
  }
}

export interface ToolErrorResult {
  isError: true;
  content: Array<{ type: "text"; text: string }>;
  [key: string]: unknown;
}

/** Convert any error into a friendly MCP tool error result (never leak raw exceptions). */
export function toToolResult(err: unknown): ToolErrorResult {
  let text: string;
  if (err instanceof PremiumRequiredError) {
    text =
      `${err.message} Free alternatives: loc_2015 (pt-BR, default), locb_2008, loc_1662, ` +
      `loc_2019_en (en), loc_1662_en (en), loc_1979_en (en), loc_2019_es (es).`;
  } else if (err instanceof RateLimitError) {
    text =
      err.retryAfter != null
        ? `Estêvão API rate limit reached. Retry in ${err.retryAfter} seconds.`
        : "Estêvão API rate limit reached. Retry in a minute.";
  } else if (err instanceof EstevaoApiError) {
    text = `Estêvão API error (${err.status}${err.code ? ` ${err.code}` : ""}): ${err.message}`;
  } else {
    text = `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
  }
  return { isError: true, content: [{ type: "text", text }] };
}

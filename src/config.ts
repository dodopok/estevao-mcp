export interface Config {
  apiKey: string;
  baseUrl: string;
  defaultPrayerBook: string;
  timezone?: string;
}

const KEY_FORMAT = /^estevao_[0-9a-f]{48}$/;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiKey = env.ESTEVAO_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "ESTEVAO_API_KEY is required. Get one from the Estêvão developer portal and set it in the MCP server env.",
    );
  }
  if (!KEY_FORMAT.test(apiKey)) {
    throw new Error(
      "ESTEVAO_API_KEY has an unexpected format (expected 'estevao_' followed by 48 hex chars).",
    );
  }
  return {
    apiKey,
    baseUrl: (env.ESTEVAO_BASE_URL ?? "https://api.caminhoanglicano.com.br").replace(/\/+$/, ""),
    defaultPrayerBook: env.ESTEVAO_DEFAULT_PRAYER_BOOK ?? "loc_2015",
    timezone: env.ESTEVAO_TIMEZONE,
  };
}

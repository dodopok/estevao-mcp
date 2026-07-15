/**
 * Records real API responses as test fixtures.
 * Usage: ESTEVAO_API_KEY=… [ESTEVAO_BASE_URL=…] npx tsx scripts/record-fixtures.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { loadConfig } from "../src/config.js";
import { EstevaoHttpClient } from "../src/client/http.js";

const config = loadConfig();
const http = new EstevaoHttpClient(config.baseUrl, config.apiKey);
const outDir = new URL("../test/fixtures/", import.meta.url);

const targets: Array<[string, string, Record<string, string>]> = [
  ["calendar-day.json", "/api/v1/calendar/2026/7/14", { "preferences[prayer_book_code]": "loc_2015" }],
  ["lectionary-day.json", "/api/v1/lectionary/2026/7/19", { "preferences[prayer_book_code]": "loc_2015" }],
  ["daily-office.json", "/api/v1/daily_office/2026/7/14/compline", { "preferences[prayer_book_code]": "loc_2015" }],
  ["celebrations-search.json", "/api/v1/celebrations/search", { q: "Pentecostes", "preferences[prayer_book_code]": "loc_2015" }],
  ["prayer-books.json", "/api/v1/prayer_books", {}],
];

await mkdir(outDir, { recursive: true });
for (const [file, path, params] of targets) {
  const body = await http.get(path, params);
  await writeFile(new URL(file, outDir), `${JSON.stringify(body, null, 2)}\n`);
  console.log(`recorded ${file} ← ${path}`);
}

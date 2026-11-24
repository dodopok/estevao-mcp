---
name: estevao-api
description: Help developers integrate the Estevão REST API (Anglican liturgical calendar, lectionary readings, collects, celebrations, prayer books, Bible passages and versions) into their own code. Covers authentication with X-API-Key, choosing v2 or v1, building requests with book, include, fields and date ranges, reading the data/meta/links envelope, handling problem+json errors and rate limits, and caching with ETag. Use when someone is writing code against api.caminhoanglicano.com.br, asks how to call an Estevão endpoint, wants a client, cURL, TypeScript or Python example, or is migrating from v1 to v2.
---

# Building on the Estevão API

This skill is for writing code that calls the API. If the person only wants a liturgical answer
("what are the readings on Sunday?"), answer with the MCP tools instead (`anglican-liturgy`).

The reference below matches the published documentation. For a detail not covered here, read
the live reference when web access is available:
- https://estevao.caminhoanglicano.com.br/llms-full.txt (plain text, every endpoint)
- https://estevao.caminhoanglicano.com.br/docs/v2/endpoints
- https://estevao.caminhoanglicano.com.br/docs/v2/errors

Do not invent endpoints, parameters or response fields. When unsure, say so and point to the
sandbox in the portal's playground.

## Essentials

- **Base URLs**:
  - v2: `https://api.caminhoanglicano.com.br/api/v2` (use for new integrations);
  - v1: `https://api.caminhoanglicano.com.br/api/v1`.
  - Both are read-only JSON, with the same key, plan and limits.
- **Authentication**: header `X-API-Key: estevao_…`.
  - The key is created in the portal's dashboard (https://estevao.caminhoanglicano.com.br) and
    is shown once.
  - Keep it on the server, in the application's secret configuration. Never
    put it in browser or mobile app code. For a front end, call your own backend, which calls
    the API.
  - Never ask the person to paste their key into the conversation.
  - Without a valid key, the API answers `401` with code `MISSING_API_KEY`.
- **Prayer book**: v2 has no default book. Every resource that depends on it requires `book`
  (for example `loc_2015`, `loc_1662_en`). The catalogue is at `GET /prayer-books`.
- **v2 does not publish the Daily Office yet.** For offices, use v1:
  - `GET /api/v1/daily_office/{year}/{month}/{day}/{office}`, with `office` one of `morning`,
    `midday`, `evening` or `compline` (and `late_evening` where the book has it);
  - send the book as `preferences[prayer_book_code]=loc_2015`.

## v2 requests

Context parameters, flat, on any book-dependent resource:
- `book` (required);
- `bible`;
- `psalter`;
- `lectionary` (a variant from the book's capabilities);
- `reading_type`;
- `lang`.

Dates are `YYYY-MM-DD` or `today`.

| Endpoint | What it returns |
|---|---|
| `GET /days/{date}` | One liturgical day: season, colour, week, Sunday name, fast, prevailing celebration |
| `GET /days?from=&to=` or `?year=` | The same for a range: a month or a year in one call |
| `GET /days/{date}/readings` | Readings as slots; `service=all` for every office; `include=text` for the text |
| `GET /collects/{date}` | The day's collects; `include=text` adds body and preface |
| `GET /passages?ref=&bible=` | Any Bible passage (no `book`; `bible` required) |
| `GET /liturgical-explanations/{date}` | Why the day resolved that way: precedence, transfers, colour, provenance of each reading |
| `GET /years/{year}`, `/seasons`, `/key-dates`, `/lectionary-cycle` | Year overview and its parts |
| `GET /celebrations` | Search (`q`, `type`, `month`, `day`, `movable`, `year`), cursor-paginated (`limit` 1–100, `cursor`) |
| `GET /celebrations/{id}`, `GET /celebrations/types` | One celebration; the accepted types |
| `GET /prayer-books`, `/prayer-books/{code}`, `/prayer-books/{code}/preferences` | Catalogue, capabilities, accepted preferences |
| `GET /bible-versions` | Translations, with language, publisher and licence |

**`include` decides what is computed.**
- On `/days`, accepted values are `readings`, `readings.text`, `readings.morning`,
  `readings.evening`, `readings.alternatives`, `collect`, `collect.text`, `celebrations` and
  `explanation`.
- A child implies its parent: `readings.text` brings `readings`.
- An include the endpoint does not offer answers `400 INVALID_INCLUDE`, with the accepted list
  in `allowed`.

**`fields[type]` decides what is serialized**, for example
`fields[day]=date,season,color`. It does not change what is computed.

**Ranges.** `/days` takes up to 366 days per call, or 31 with `readings.text` or `explanation`.
Beyond that it answers `400 RANGE_TOO_LARGE`, with `max_days`.

**`service`** chooses the office's readings: `daily` (default), `eucharist`, `morning`,
`evening`, or `all` on `/readings`.

**`text_format`** for Bible text: `verses` (default), `plain` or `markdown`.

## v2 responses

- Every response is `{ data, meta }`; collections add `links` (`self`, `next`).
- `meta` repeats the resolved context: book, language, Bible translation and lectionary
  variant. On collections it adds `count` and `total`.
- Keys are English `snake_case`. Values such as season and colour names come in the book's
  language, or in `lang`.
- Readings are a list of slots (`first_reading`, `psalm`, `second_reading`, `gospel`…), not
  fixed keys: books appoint different numbers of readings. Iterate the list.
- No content is not an error: a day without readings answers `200` with an empty list. `404` is
  for resources that do not exist.

## Errors, limits and caching

- **Errors** are `application/problem+json`, with `type`, `title`, `status`, `detail`, a stable
  `code` and a `request_id`.
  - Branch on `code`, never on `detail`.
  - Log the `request_id`; support needs it.
  - Common codes: `MISSING_API_KEY`, `MISSING_PRAYER_BOOK`, `UNKNOWN_PRAYER_BOOK`,
    `INVALID_INCLUDE`, `INVALID_FIELDS`, `INVALID_DATE`, `MISSING_DATE_RANGE`,
    `INVALID_DATE_RANGE`, `RANGE_TOO_LARGE`, `INVALID_SERVICE`, `INVALID_TEXT_FORMAT`,
    `MISSING_REFERENCE`, `MISSING_BIBLE_VERSION`, `UNKNOWN_BIBLE_VERSION`, `PASSAGE_NOT_FOUND`,
    `INVALID_CELEBRATION_TYPE`, `INVALID_CURSOR`, `CELEBRATION_NOT_FOUND`.
- **Rate limits** are per key and per plan, daily and per minute.
  - Going over answers `429`, as `application/json` (not problem+json), with
    `error.code = "RATE_LIMIT_EXCEEDED"` and a `Retry-After` header.
  - Wait that many seconds; do not retry in a tight loop.
  - Each authenticated request counts as one call.
- **`X-Request-Cost`** reports the relative server work of a response (includes add to it). It
  is informational and never debited from the quota.
- **Caching**: responses carry an `ETag`.
  - Send it back in `If-None-Match` to get `304` with no body.
  - `Cache-Control` is one hour for dates and catalogues, five minutes for `today`.
  - Liturgical data for a past or future date does not change, so cache it.

## Examples

cURL:
```bash
curl -s "https://api.caminhoanglicano.com.br/api/v2/days/2026-12-06?book=loc_2015&include=readings,collect" \
  -H "X-API-Key: YOUR_API_KEY"
```

TypeScript (server side):
```ts
const BASE = "https://api.caminhoanglicano.com.br/api/v2";

// apiKey comes from your server's secret configuration; never ship it to a browser.
export async function getDay(apiKey: string, date: string, book: string) {
  const url = new URL(`${BASE}/days/${date}`);
  url.searchParams.set("book", book);
  url.searchParams.set("include", "readings,collect");
  const res = await fetch(url, { headers: { "X-API-Key": apiKey } });

  if (res.status === 429) {
    const wait = Number(res.headers.get("Retry-After") ?? 60);
    throw new Error(`Rate limited; retry in ${wait}s`);
  }
  if (!res.ok) {
    const problem = await res.json(); // problem+json: code, detail, request_id
    throw new Error(`${problem.code} (${problem.request_id}): ${problem.detail}`);
  }
  const { data, meta } = await res.json(); // meta: the book, language and translation that resolved it
  return { day: data, meta };
}
```

Python:
```python
import requests

BASE = "https://api.caminhoanglicano.com.br/api/v2"

# api_key comes from your server's secret configuration; never ship it to a client.
def month(api_key: str, book: str, start: str, end: str):
    res = requests.get(
        f"{BASE}/days",
        params={"book": book, "from": start, "to": end},
        headers={"X-API-Key": api_key},
        timeout=10,
    )
    if res.status_code == 429:
        raise RuntimeError(f"Rate limited; retry in {res.headers.get('Retry-After')}s")
    if not res.ok:
        problem = res.json()
        raise RuntimeError(f"{problem['code']} ({problem['request_id']}): {problem['detail']}")
    return res.json()["data"]
```

Check field names against a real response from the sandbox before relying on them. The
examples above only use the envelope and the documented parameters.

## Migrating from v1

- The `preferences[...]` blob becomes flat parameters: `book`, `bible`, `lectionary`, `psalter`,
  `reading_type` and `lang`. v2 still accepts the blob, to ease migration.
- Routes use hyphens (`key-dates`, `prayer-books`) instead of underscores.
- Dates are ISO in paths and responses.
- On v1, a call without a book returned data from a book nobody chose. On v2 it fails with
  `MISSING_PRAYER_BOOK`, so pass `book` everywhere.
- v1 stays online with no end date. Migrate one route at a time, and keep the Daily Office on
  v1 for now.

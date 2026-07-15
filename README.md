# estevao-mcp

[![npm](https://img.shields.io/npm/v/estevao-mcp)](https://www.npmjs.com/package/estevao-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-io.github.dodopok%2Festevao--mcp-blue)](https://registry.modelcontextprotocol.io/?search=estevao)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

MCP (Model Context Protocol) server for the [Estêvão API](https://github.com/dodopok/estevao-api) — the liturgical engine behind the Ordo app. Gives Claude and any MCP client accurate Anglican liturgical data: calendar (with real precedence rules), lectionary readings, and the fully assembled Daily Office across multiple editions of the Book of Common Prayer / Livro de Oração Comum.

## Quick start

You need an Estêvão API key (`estevao_…`). Then:

```bash
claude mcp add estevao --env ESTEVAO_API_KEY=estevao_your_key -- npx -y estevao-mcp
```

Or in `.mcp.json` / Claude Desktop config:

```json
{
  "mcpServers": {
    "estevao": {
      "command": "npx",
      "args": ["-y", "estevao-mcp"],
      "env": { "ESTEVAO_API_KEY": "estevao_your_key" }
    }
  }
}
```

Then ask things like *"what are the readings for next Sunday?"*, *"assemble tonight's Compline"* or *"compare Christmas in the 1662 and 2019 prayer books"*.

## Tools

Dates accept `YYYY-MM-DD`, `today` or `next-sunday`. Every tool takes an optional `prayer_book` (default `loc_2015`); all tools are read-only.

| Tool | What it does |
|---|---|
| `get_liturgical_day` | Season, color, liturgical year, celebration/saint, collect and readings for a date |
| `get_calendar_month` | Month grid: color, celebration and week per day |
| `get_year_overview` | Year structure: seasons, movable feasts and key dates |
| `get_readings` | Lectionary readings (first, psalm, second, gospel), optionally per service |
| `get_lectionary_cycle` | Sunday (A/B/C) and weekday (1/2) cycles for a year |
| `get_daily_office` | The complete Daily Office (morning/midday/evening/compline) as markdown or structured JSON |
| `search_celebrations` | Full-text search of feasts, saints and holy days |
| `list_celebrations` | Browse the sanctoral calendar with filters (type, movable, year) |
| `get_celebration` | One celebration in detail: transfer rules, calculation, collects, readings |
| `list_prayer_books` | Available prayer books (11 editions, pt-BR/en/es) and Bible versions |
| `compare_prayer_books` | Side-by-side comparison of 2–4 prayer books for the same day or office |

## Resources & prompts

- **Resources**: `ordo://prayer-books`, `ordo://bible-versions`, `ordo://today`, plus templates `ordo://day/{date}`, `ordo://office/{date}/{office_type}` (markdown) and `ordo://calendar/{year}/key-dates`.
- **Prompts** (strictly factual): `build_liturgy_sheet` (print-ready boletim), `explain_feast` (history, precedence, color), `compare_traditions` (side-by-side across editions).

> **Editorial note:** this server intentionally exposes only factual liturgical data and faithful document assembly. It does not (and will not) ship prompts that generate sermons, homilies or devotional reflections.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `ESTEVAO_API_KEY` | — (required for stdio) | API key for the Estêvão API |
| `ESTEVAO_BASE_URL` | `https://api.caminhoanglicano.com.br` | Override for local/staging |
| `ESTEVAO_DEFAULT_PRAYER_BOOK` | `loc_2015` | Default prayer book code |
| `ESTEVAO_TIMEZONE` | system | IANA timezone used to resolve `today` |

## Remote server (Streamable HTTP)

The same server can run as a remote MCP endpoint (`POST /mcp`, stateless Streamable HTTP):

```bash
npm run build && node dist/http.js          # or: docker build -t estevao-mcp . && docker run -p 3333:3333 estevao-mcp
```

Two auth modes, chosen by env:

- **Passthrough** (default, multi-tenant): don't set `ESTEVAO_API_KEY` on the server. Each client sends its own key in the `X-API-Key` header (or `Authorization: Bearer estevao_…`).
- **Single-key** (personal deployment): set `ESTEVAO_API_KEY` on the server. Optionally set `ESTEVAO_MCP_TOKEN` to require `Authorization: Bearer <token>` from clients.

Extra env: `PORT` (default 3333), `ESTEVAO_MCP_ALLOWED_HOSTS` (comma-separated; enables DNS-rebinding protection). `GET /healthz` reports the mode.

Client config for a remote deployment:

```json
{
  "mcpServers": {
    "estevao": {
      "type": "http",
      "url": "https://<your-host>/mcp",
      "headers": { "X-API-Key": "estevao_your_key" }
    }
  }
}
```

## Development

```bash
npm install
npm run typecheck && npm test    # vitest + msw fixtures, no network
npm run build                    # tsup → dist/index.js + dist/http.js
npm run inspector                # manual testing with the MCP Inspector

# end-to-end against a local estevao-api (docker-compose up in that repo):
SMOKE_KEY=estevao_… npx tsx scripts/smoke.ts
```

## Releasing

```bash
npm version patch        # bumps package.json AND server.json (version hook), commits + tags
git push --follow-tags
npm publish --access public
mcp-publisher publish    # mcp-publisher login github, first time
```

The npm `version` lifecycle hook (`scripts/sync-version.ts`) keeps `server.json` in sync and enforces the registry's 100-char description limit. The server's advertised MCP version comes from `package.json` at build time.

Alternatively, once GitHub Actions is available with the `NPM_TOKEN` secret, `git push --follow-tags` alone triggers the release workflow (npm with provenance + MCP registry via GitHub OIDC).

## License

MIT

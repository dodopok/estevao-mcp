# estevao-mcp

MCP (Model Context Protocol) server for the [Estêvão API](https://github.com/dodopok/estevao-api) — the liturgical engine behind the Ordo app. Gives Claude and any MCP client accurate Anglican liturgical data: calendar (with real precedence rules), lectionary readings, and the fully assembled Daily Office across multiple editions of the Book of Common Prayer / Livro de Oração Comum.

## Tools (Phase 1)

| Tool | What it does |
|---|---|
| `get_liturgical_day` | Season, color, liturgical year, celebration/saint, collect and readings for a date |
| `get_readings` | Lectionary readings (first, psalm, second, gospel), optionally per service |
| `get_daily_office` | The complete Daily Office (morning/midday/evening/compline) rendered as markdown or structured JSON |
| `search_celebrations` | Full-text search of feasts, saints and holy days |
| `list_prayer_books` | Available prayer books (11 editions, pt-BR/en/es) and Bible versions |

Dates accept `YYYY-MM-DD`, `today` or `next-sunday`.

## Setup

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

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `ESTEVAO_API_KEY` | — (required) | API key for the Estêvão API |
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
npm run build                    # tsup → dist/index.js
npm run inspector                # manual testing with the MCP Inspector

# end-to-end against a local estevao-api (docker-compose up in that repo):
SMOKE_KEY=estevao_… npx tsx scripts/smoke.ts
```

Editorial note: this server intentionally exposes only factual liturgical data and document assembly. It does not (and will not) ship prompts that generate sermons, homilies or devotional reflections.

## Full surface

- **11 tools**: `get_liturgical_day`, `get_calendar_month`, `get_year_overview`, `get_readings`, `get_lectionary_cycle`, `get_daily_office`, `search_celebrations`, `list_celebrations`, `get_celebration`, `list_prayer_books`, `compare_prayer_books`.
- **Resources**: `ordo://prayer-books`, `ordo://bible-versions`, `ordo://today`, and templates `ordo://day/{date}`, `ordo://office/{date}/{office_type}` (markdown), `ordo://calendar/{year}/key-dates`.
- **Prompts** (factual only): `build_liturgy_sheet`, `explain_feast`, `compare_traditions`.

## Releasing

Tag `vX.Y.Z` → GitHub Actions publishes to npm (provenance) and to the [MCP registry](https://registry.modelcontextprotocol.io) via `mcp-publisher` (GitHub OIDC). Requires the `NPM_TOKEN` repo secret and matching versions in `package.json` and `server.json`.

## License

MIT

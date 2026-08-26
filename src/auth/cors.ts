import type { NextFunction, Request, Response } from "express";

/**
 * MCP clients live in very different places: terminals (Claude Code, Codex, Gemini CLI),
 * desktop apps, editors and browsers. Browser-based ones only reach the endpoint if the
 * preflight passes and the auth challenge is readable from JavaScript — hence the explicit
 * `Access-Control-Expose-Headers` for `WWW-Authenticate`, which starts the OAuth flow.
 */
const ALLOWED_HEADERS = [
  "Authorization",
  "Content-Type",
  "Accept",
  "X-API-Key",
  "Mcp-Session-Id",
  "Mcp-Protocol-Version",
  "Last-Event-ID",
].join(", ");

const EXPOSED_HEADERS = ["WWW-Authenticate", "Mcp-Session-Id", "Mcp-Protocol-Version"].join(", ");

export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  res.setHeader("Access-Control-Expose-Headers", EXPOSED_HEADERS);
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

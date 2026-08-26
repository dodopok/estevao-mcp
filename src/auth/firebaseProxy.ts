import express, { type Request, type Response, type Router } from "express";

/**
 * Reverse proxy for Firebase Auth's sign-in helper.
 *
 * By default the Firebase Web SDK runs its sign-in handler on
 * `<project>.firebaseapp.com`, a different origin from this server. Safari's ITP
 * (16.1+) and Firefox block the cross-origin storage that flow depends on, and
 * in-app browsers — the one the Claude mobile app opens — often cannot deliver a
 * popup result back to its opener either. In both cases the user picks a Google
 * account and then nothing happens.
 *
 * Forwarding `/__/auth/*` from this host makes the whole sign-in same-origin,
 * which is the fix Firebase documents for exactly this situation.
 *
 * @see https://firebase.google.com/docs/auth/web/redirect-best-practices
 */
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "content-type",
  "cookie",
  "user-agent",
  "referer",
];

const SKIPPED_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
]);

export function createFirebaseAuthProxy(
  upstreamHost: string,
  fetchFn: typeof fetch = fetch,
): Router {
  const router = express.Router();

  // The sign-in handler POSTs a form back; keep the body untouched.
  router.use(express.raw({ type: () => true, limit: "1mb" }));

  const handler = async (req: Request, res: Response): Promise<void> => {
    const target = new URL(req.originalUrl, `https://${upstreamHost}`);
    const headers = new Headers();
    for (const name of FORWARDED_REQUEST_HEADERS) {
      const value = req.headers[name];
      if (typeof value === "string") headers.set(name, value);
    }
    headers.set("host", upstreamHost);

    let upstream: globalThis.Response;
    try {
      upstream = await fetchFn(target, {
        method: req.method,
        headers,
        body: req.method === "GET" || req.method === "HEAD" ? undefined : (req.body as Buffer),
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      console.error("Firebase auth proxy failed:", err);
      res.status(502).type("text").send("Firebase sign-in helper is unreachable.");
      return;
    }

    upstream.headers.forEach((value, name) => {
      if (!SKIPPED_RESPONSE_HEADERS.has(name.toLowerCase())) res.setHeader(name, value);
    });
    // Node exposes Set-Cookie separately; without it the sign-in state is lost.
    const setCookie = upstream.headers.getSetCookie?.();
    if (setCookie?.length) res.setHeader("Set-Cookie", setCookie);

    res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
  };

  router.all("/{*path}", handler);
  return router;
}

/** `estevao-api.firebaseapp.com` for project `estevao-api`. */
export function firebaseHelperHost(authDomain: string, projectId: string): string {
  return authDomain.endsWith(".firebaseapp.com") || authDomain.endsWith(".web.app")
    ? authDomain
    : `${projectId}.firebaseapp.com`;
}

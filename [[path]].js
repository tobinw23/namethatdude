// Cloudflare Pages Function. Handles /api/*.
//
// Optional hardening (recommended for launch): bind a KV namespace named
// NTD_SESSIONS and set a secret NTD_SECRET (see README "Go live"). When
// both are present the server becomes authoritative and /api/reveal can't
// be abused. Without them it still works, just statelessly.
import { handle } from "../../server/core.js";

export async function onRequest(context) {
  const { request, env } = context;
  const kv = env.NTD_SESSIONS; // KV binding, or undefined
  const store = kv
    ? {
        get: (k) => kv.get(k),
        put: (k, v, ttl) => kv.put(k, v, { expirationTtl: ttl }),
      }
    : null;

  return handle(request, new URL(request.url).pathname, {
    store,
    secret: env.NTD_SECRET || null,
    ip: request.headers.get("cf-connecting-ip"),
  });
}

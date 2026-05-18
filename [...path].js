// Vercel Edge Function. Handles /api/* (see vercel.json).
//
// Optional hardening: `npm i @vercel/kv`, create a Vercel KV store (it
// injects KV_REST_API_* env vars), and set NTD_SECRET. If @vercel/kv
// isn't installed/configured it degrades to stateless automatically.
import { handle } from "../server/core.js";

export const config = { runtime: "edge" };

let storePromise;
async function getStore() {
  if (storePromise !== undefined) return storePromise;
  storePromise = (async () => {
    try {
      if (!process.env.KV_REST_API_URL) return null;
      const { kv } = await import("@vercel/kv");
      return {
        get: async (k) => {
          const v = await kv.get(k);
          return v == null ? null : typeof v === "string" ? v : JSON.stringify(v);
        },
        put: (k, v, ttl) => kv.set(k, v, { ex: ttl }),
      };
    } catch {
      return null;
    }
  })();
  return storePromise;
}

export default async function handler(request) {
  const store = await getStore();
  return handle(request, new URL(request.url).pathname, {
    store,
    secret: process.env.NTD_SECRET || null,
    ip: (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null,
  });
}

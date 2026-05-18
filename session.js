// Signed session cookies + HMAC, using Web Crypto so it runs unchanged on
// Cloudflare Workers and Vercel Edge. The cookie holds an opaque random
// session id plus an HMAC so it can't be forged without NTD_SECRET.

const enc = (s) => new TextEncoder().encode(s);

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw", enc(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc(msg));
  return b64url(new Uint8Array(sig));
}

function randomId() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return b64url(a);
}

export function parseCookies(header) {
  const out = {};
  (header || "").split(/; */).forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1));
  });
  return out;
}

// Returns { sid, token, isNew }. Verifies an existing cookie; mints a new
// signed session if missing/invalid.
export async function ensureSession(cookieHeader, secret) {
  const tok = parseCookies(cookieHeader).ntd;
  if (tok) {
    const dot = tok.lastIndexOf(".");
    if (dot > 0) {
      const sid = tok.slice(0, dot);
      const mac = tok.slice(dot + 1);
      if ((await hmac(secret, sid)) === mac) return { sid, token: tok, isNew: false };
    }
  }
  const sid = randomId();
  const token = `${sid}.${await hmac(secret, sid)}`;
  return { sid, token, isNew: true };
}

export function cookieHeader(token) {
  // ~400 days. Secure + HttpOnly + Lax: not readable by JS, sent same-site.
  return `ntd=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=34560000`;
}

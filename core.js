// Server-side game core. Platform-agnostic: the Cloudflare and Vercel
// adapters pass in a `ctx` with { store, secret, ip }.
//
// If `ctx.store` is present (a KV namespace is bound), the server becomes
// AUTHORITATIVE: it counts each session's guesses, refuses guesses after
// the game is over, and only reveals the answer once that session has
// genuinely finished. /api/reveal cannot be used to spoil the day.
//
// If no store is configured (e.g. you deployed before provisioning KV),
// it degrades gracefully to the earlier stateless behaviour so the site
// still works immediately — adding KV later auto-hardens it.

import { ROSTER } from "./roster.js";
import { ensureSession, cookieHeader } from "./session.js";

// ── LAUNCH DATE ──────────────────────────────────────────────────────
// Set this to the calendar day you go live. Puzzle #1 = launch day, and
// puzzle #1 is always Brandon Phillips (the opener). Keep this value
// IDENTICAL to LAUNCH_DATE in src/App.jsx (year, month-1, day).
// Example: launching 2026-05-20  ->  Date.UTC(2026, 4, 20)
const EPOCH = Date.UTC(2025, 0, 1);
const FIRST_PLAYER = "Brandon Phillips";
// ─────────────────────────────────────────────────────────────────────

// Must match the client: maxStrikes(3) + bonusGuess(1) = 4 total guesses.
const MAX_WRONG = 4;
const RATE_LIMIT = 40;        // requests / IP / minute on mutating endpoints
const STATE_TTL = 3 * 86400;  // seconds — a day's state self-expires

export function dayNumber(d = new Date()) {
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((t - EPOCH) / 86400000) + 1;
}
function pickIndex(day) {
  const h = (day * 2654435761) % 2 ** 31;
  return Math.abs(h) % ROSTER.length;
}
export function playerForDay(day) {
  const fi = ROSTER.findIndex((p) => p.name === FIRST_PLAYER);
  if (day <= 1 && fi >= 0) return ROSTER[fi];   // opening day = the opener
  let i = pickIndex(day);
  if (i === fi) i = (i + 1) % ROSTER.length;    // don't repeat the opener early
  return ROSTER[i];
}

function norm(s) {
  return (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
export function isCorrect(guess, player) {
  const g = norm(guess);
  if (!g) return false;
  const cands = [player.name, ...(player.aliases || [])].map(norm);
  if (cands.includes(g)) return true;
  const last = norm(player.name).split(" ").slice(-1)[0];
  if (g === last) {
    const same = ROSTER.filter((p) => norm(p.name).split(" ").slice(-1)[0] === last);
    if (same.length === 1) return true;
  }
  return false;
}

function reveal(p) {
  return { answer: p.name, photo: p.photo ? `/p/${p.photo}.png` : null, accolades: p.accolades };
}

function res(obj, { status = 200, cookie } = {}) {
  const h = { "content-type": "application/json", "cache-control": "no-store" };
  if (cookie) h["set-cookie"] = cookie;
  return new Response(JSON.stringify(obj), { status, headers: h });
}

// store: { get(key)->string|null, put(key,str,ttlSeconds) }
async function loadState(store, sid, day) {
  if (!store) return null;
  try {
    const raw = await store.get(`st:${sid}:${day}`);
    return raw ? JSON.parse(raw) : { w: 0, s: false };
  } catch { return { w: 0, s: false }; }
}
async function saveState(store, sid, day, st) {
  if (!store) return;
  try { await store.put(`st:${sid}:${day}`, JSON.stringify(st), STATE_TTL); } catch {}
}
function isOver(st) { return !!st && (st.s || st.w >= MAX_WRONG); }

async function rateLimited(store, ip) {
  if (!store || !ip) return false;
  const k = `rl:${ip}:${Math.floor(Date.now() / 60000)}`;
  try {
    const n = parseInt((await store.get(k)) || "0", 10) + 1;
    await store.put(k, String(n), 120);
    return n > RATE_LIMIT;
  } catch { return false; }
}

export async function handle(request, pathname, ctx = {}) {
  const { store, secret, ip } = ctx;
  const day = dayNumber();
  const player = playerForDay(day);

  // Session (only meaningful when we have a secret + store).
  let sess = null, setCookie;
  if (secret) {
    sess = await ensureSession(request.headers.get("cookie"), secret);
    if (sess.isNew) setCookie = cookieHeader(sess.token);
  }

  if (pathname.endsWith("/today")) {
    const st = sess ? await loadState(store, sess.sid, day) : null;
    return res({
      day,
      clues: {
        pos: player.pos, num: player.num, teams: player.teams,
        years: player.years, season: player.season, accolades: player.accolades,
      },
      silhouette: player.sil ? `/d/${player.sil}.png` : null,
      // lets the client resync if the same browser already played today
      state: st ? { wrong: st.w, solved: st.s, over: isOver(st) } : null,
    }, { cookie: setCookie });
  }

  if (pathname.endsWith("/names")) {
    return res({ names: ROSTER.map((p) => p.name).sort() }, { cookie: setCookie });
  }

  if (pathname.endsWith("/guess")) {
    if (request.method !== "POST") return res({ error: "POST only" }, { status: 405, cookie: setCookie });
    if (await rateLimited(store, ip)) return res({ error: "slow down" }, { status: 429, cookie: setCookie });
    let body;
    try { body = await request.json(); } catch { return res({ error: "bad json" }, { status: 400, cookie: setCookie }); }

    // Stateless fallback (no store/session): validate only.
    if (!store || !sess) {
      const ok = isCorrect(body?.guess, player);
      return res(ok ? { correct: true, ...reveal(player) } : { correct: false }, { cookie: setCookie });
    }

    const st = await loadState(store, sess.sid, day);
    if (isOver(st)) return res({ correct: st.s, over: true, ...reveal(player) }, { cookie: setCookie });

    if (isCorrect(body?.guess, player)) {
      st.s = true; await saveState(store, sess.sid, day, st);
      return res({ correct: true, over: true, ...reveal(player) }, { cookie: setCookie });
    }
    st.w += 1; await saveState(store, sess.sid, day, st);
    const over = st.w >= MAX_WRONG;
    return res(over ? { correct: false, over: true, ...reveal(player) } : { correct: false, wrong: st.w },
      { cookie: setCookie });
  }

  if (pathname.endsWith("/reveal")) {
    if (await rateLimited(store, ip)) return res({ error: "slow down" }, { status: 429, cookie: setCookie });
    // Authoritative mode: only reveal if THIS session actually finished.
    if (store && sess) {
      const st = await loadState(store, sess.sid, day);
      if (!isOver(st)) return res({ error: "game not over" }, { status: 403, cookie: setCookie });
      return res(reveal(player), { cookie: setCookie });
    }
    // Stateless fallback.
    return res(reveal(player), { cookie: setCookie });
  }

  return res({ error: "not found" }, { status: 404, cookie: setCookie });
}

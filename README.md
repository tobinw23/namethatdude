# Name That Dude — namethatdude.com

Daily MLB player guessing game. React (Vite) front end + an edge function
that keeps the answer off the client and is the authoritative scorekeeper.

## What's in the box

- `src/` — the game (auto-detects server vs local mode)
- `functions/api/[[path]].js` — Cloudflare Pages Function
- `api/[...path].js` — Vercel Edge Function (same logic, other host)
- `server/` — shared game core, signed sessions, server-only roster
  (with answers — never shipped to the browser)
- `build_dataset.py` — Wikimedia-sourced, license-checked imagery
- `public/` — static assets, og image, robots, sitemap, headers

## Local dev

    npm install
    npm run dev          # http://localhost:5173  (local mode)
    npm run build        # -> dist/
    npm run preview

To exercise the API + cookies locally use the host emulator:
`npx wrangler pages dev dist` (Cloudflare) or `vercel dev` (Vercel).

---

# Go live (you bought the domain — now what?)

The smoothest path puts the domain, DNS, hosting, and the KV store in one
account: **Cloudflare**. Vercel notes follow.

### A. Get the code hosted (≈10 min)

1. Put this folder in a Git repo (GitHub/GitLab) and push.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to
   Git** → pick the repo.
3. Build settings: framework preset **Vite**, build command
   `npm run build`, output dir `dist`. Deploy.
4. You now have a live `*.pages.dev` URL. The game already works here
   (statelessly — see step C to harden).

### B. Attach namethatdude.com (≈5 min + DNS wait)

1. If you registered the domain **at Cloudflare**: Pages project →
   **Custom domains → Set up a domain** → `namethatdude.com`. Cloudflare
   creates the DNS record and TLS cert automatically. Add `www` too and
   redirect it to the apex (Rules → Redirect, or just add both domains).
2. If you registered **elsewhere**: either point the registrar's
   nameservers at Cloudflare (Cloudflare walks you through this — best
   option, everything in one place), or add the CNAME/records Cloudflare
   shows you at your current DNS host.
3. Wait for DNS to propagate (minutes to a couple hours). HTTPS is
   automatic once the cert issues.

### C. Turn on anti-cheat hardening (≈5 min) — recommended

Without this the site works but `/api/reveal` is spoofable. With it the
server counts each player's guesses and refuses to reveal until *their*
game is genuinely over. Verified behavior: reveal returns 403 before the
game ends, forged cookies are rejected, you can't keep guessing after a
loss.

1. Cloudflare → **Workers & Pages → KV → Create namespace**, name it
   anything (e.g. `ntd-sessions`).
2. Your Pages project → **Settings → Functions → KV namespace bindings →
   Add binding**. Variable name **must be** `NTD_SESSIONS`; select the
   namespace.
3. Same project → **Settings → Environment variables → Add**, name
   `NTD_SECRET`, value = a long random string (e.g.
   `openssl rand -hex 32`). Mark it encrypted. Add it to Production.
4. Re-deploy (or push a commit). Done — the function picks both up
   automatically and switches to authoritative mode.

Verify: open the site in a private window, fail a puzzle on purpose, then
in dev tools run `fetch('/api/reveal').then(r=>r.status)` *before*
finishing — it should be `403`.

### D. Polish

- Replace `public/og.png` if you want custom share art (1200×630). A
  generated one is already included so links unfurl today.
- `public/robots.txt` and `public/sitemap.xml` reference the domain —
  edit if your final host path differs.
- Submit the site to Google Search Console (optional, helps discovery).

### Vercel instead?

1. Import the repo at vercel.com (auto-detects Vite + the `api/` edge
   function via `vercel.json`).
2. Project → **Settings → Domains** → add `namethatdude.com`; set the A
   record (`76.76.21.21`) for the apex and a CNAME for `www` at your
   registrar, per Vercel's instructions. TLS automatic.
3. Hardening: `npm i @vercel/kv`, then Project → **Storage → Create →
   KV**; Vercel injects the `KV_REST_API_*` env vars. Add a `NTD_SECRET`
   env var. Re-deploy. The edge adapter detects KV and hardens itself.

---

## Clean imagery (run once, then re-deploy)

    pip install requests pillow
    pip install rembg onnxruntime        # optional, cleaner cutouts
    python build_dataset.py --names names.txt --out .

Pulls each player's photo from **Wikimedia Commons**, keeps only freely
licensed images (PD / CC0 / CC-BY / CC-BY-SA), skips the rest into
`skipped.txt`, writes silhouettes/photos under random opaque filenames,
regenerates `server/roster.js` (your `aliases` are preserved), and builds
`public/credits.html` (the footer links to it — CC-BY/SA require visible
attribution). Until you run it the site shows a generic drawn silhouette,
so it's launchable as-is. Not legal advice — if this earns money or draws
real traffic, have a lawyer confirm sourcing and that you're not implying
MLB/MLBPA endorsement.

## Tailwind

`index.html` uses the Tailwind Play CDN to ship fast. For production
install Tailwind properly (note in `index.html`) so CSS is purged and
there's no render-blocking script.

---

## What I added this round + recommendations

Done:
- **Server-authoritative scoring** (Cloudflare KV / Vercel KV) with
  signed httpOnly session cookies — closes the reveal-scrape hole.
- **Rate limiting** (40 req/IP/min on guess & reveal) when KV is on.
- **First-visit "How to Play"** guide + a header link to reopen it.
- **Cross-device/cleared-storage resync**: the server tells the client if
  this browser already finished today.
- **Launch hygiene**: og image, robots.txt, sitemap.xml, security headers
  (`_headers` for CF, `headers` in `vercel.json`).

Worth doing before/after launch, in rough priority:
1. **Privacy-friendly analytics** — Cloudflare Web Analytics (free, no
   cookie banner needed) or Plausible. One snippet in `index.html`.
2. **Expand the roster** — 101 players ≈ 3 months before repeats. More
   players = longer before anyone sees a repeat; easy to add.
3. **Per-difficulty stats** — streaks currently pool all difficulties;
   split the storage key by mode if you want honest leaderboards.
4. **Archive / play past puzzles** — a `?day=N` mode for missed days.
5. **Accessibility pass** — keyboard focus rings, ARIA on the modal,
   `alt` text on the reveal photo (partly done).
6. **Abuse/cost guardrails** — if it goes viral, KV has free-tier limits;
   watch usage and add caching/longer TTLs as needed.

Ask and I'll knock out any of these.

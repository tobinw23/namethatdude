#!/usr/bin/env python3
"""
build_dataset.py — clean-imagery pipeline for Name That Dude.

Sources player photos from WIKIMEDIA COMMONS (en.wikipedia lead image),
KEEPS ONLY freely-licensed images (public domain / CC0 / CC-BY / CC-BY-SA),
and skips anything non-free / fair-use / unknown. For each kept player it:

  • downloads the photo
  • (optional) removes the background with rembg
  • renders a solid-color silhouette
  • writes both under public/ with RANDOM opaque filenames so the URL can't
    leak the player's identity (the server hands these tokens out, never
    the name)
  • records the attribution (legally required for CC-BY / CC-BY-SA)

Outputs
  public/d/<token>.png        silhouettes  (served as the puzzle image)
  public/p/<token>.png        photos       (served only after game over)
  server/roster.js            regenerated with sil/photo tokens
                              (existing aliases are PRESERVED)
  public/credits.html         visible attribution page (link it on the site)
  skipped.txt                 players with no free image — curate by hand

Manual overrides
  Some players' Wikipedia lead image is non-free. Put a JSON file like:
      { "Mike Trout": "File:Mike Trout 2019.jpg" }
  and pass --overrides overrides.json to force a specific free Commons file.

Usage
  pip install requests pillow
  pip install rembg onnxruntime        # optional, cleaner cutouts
  python build_dataset.py --out . --names names.txt

I could not run this here (no network in this environment), so spot-check
it on ~5 names before a full run.
"""

import argparse
import io
import json
import os
import re
import secrets
import sys
import time

import requests
from PIL import Image

WP_API = "https://en.wikipedia.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"

# Wikimedia REQUIRES a descriptive, contactable User-Agent.
UA = "NameThatDude-dataset/1.0 (https://namethatdude.com; contact: you@example.com)"

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA})

FREE_HINTS = ("public domain", "cc0", "cc-zero", "cc by", "cc-by",
              "creative commons", "attribution")
NONFREE_HINTS = ("fair use", "non-free", "nonfree", "all rights reserved",
                  "copyright", "©")


def strip_html(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()


def wiki_lead_file(name):
    """Return the Commons File: title of the page's lead image, or None."""
    r = SESSION.get(WP_API, params={
        "action": "query", "format": "json", "redirects": 1,
        "titles": name, "prop": "pageimages", "piprop": "name",
    }, timeout=20)
    r.raise_for_status()
    pages = r.json().get("query", {}).get("pages", {})
    for p in pages.values():
        if "pageimage" in p:
            return "File:" + p["pageimage"]
    return None


def commons_imageinfo(file_title):
    """Return (image_url, license_short, attribution_dict) or None."""
    r = SESSION.get(COMMONS_API, params={
        "action": "query", "format": "json", "titles": file_title,
        "prop": "imageinfo",
        "iiprop": "url|extmetadata", "iiurlwidth": 600,
    }, timeout=20)
    r.raise_for_status()
    pages = r.json().get("query", {}).get("pages", {})
    for p in pages.values():
        infos = p.get("imageinfo")
        if not infos:
            continue
        info = infos[0]
        ext = info.get("extmetadata", {})
        lic = (ext.get("LicenseShortName", {}).get("value", "") or "").strip()
        usage = (ext.get("UsageTerms", {}).get("value", "") or "").strip()
        artist = strip_html(ext.get("Artist", {}).get("value", ""))
        lic_url = ext.get("LicenseUrl", {}).get("value", "")
        return (
            info.get("thumburl") or info.get("url"),
            lic or usage,
            {
                "artist": artist or "Unknown",
                "license": lic or usage or "Unknown",
                "license_url": lic_url,
                "source": info.get("descriptionurl", ""),
            },
        )
    return None


def is_free(license_text):
    t = (license_text or "").lower()
    if any(h in t for h in NONFREE_HINTS):
        return False
    return any(h in t for h in FREE_HINTS)


def remove_bg(png_bytes):
    try:
        from rembg import remove
    except ImportError:
        return png_bytes  # no rembg: silhouette will include background
    return remove(png_bytes)


def to_silhouette(png_bytes, color=(10, 10, 10)):
    img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 12:
                px[x, y] = (*color, a)
    out = io.BytesIO()
    img.save(out, "PNG")
    return out.getvalue()


def save_png(raw, path):
    img = Image.open(io.BytesIO(raw)).convert("RGBA")
    img.thumbnail((600, 720))
    img.save(path, "PNG")


def load_existing_roster(path):
    """Preserve hand-edited aliases across regenerations."""
    if not os.path.exists(path):
        return {}
    txt = open(path, encoding="utf-8").read()
    m = re.search(r"=\s*(\[.*\]);", txt, re.S)
    if not m:
        return {}
    try:
        arr = json.loads(m.group(1))
    except Exception:
        return {}
    return {p["name"]: p for p in arr}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--names", required=True)
    ap.add_argument("--out", default=".", help="project root")
    ap.add_argument("--overrides", help="JSON map: name -> 'File:...'")
    ap.add_argument("--sleep", type=float, default=0.6)
    args = ap.parse_args()

    root = args.out
    d_dir = os.path.join(root, "public", "d")
    p_dir = os.path.join(root, "public", "p")
    os.makedirs(d_dir, exist_ok=True)
    os.makedirs(p_dir, exist_ok=True)

    overrides = {}
    if args.overrides and os.path.exists(args.overrides):
        overrides = json.load(open(args.overrides, encoding="utf-8"))

    roster_path = os.path.join(root, "server", "roster.js")
    existing = load_existing_roster(roster_path)

    names = [ln.strip() for ln in open(args.names, encoding="utf-8") if ln.strip()]
    roster, credits, skipped = [], [], []

    for i, name in enumerate(names, 1):
        print(f"[{i}/{len(names)}] {name}", flush=True)
        base = existing.get(name, {})
        rec = {
            "name": name,
            "pos": base.get("pos", "?"),
            "num": base.get("num", "?"),
            "teams": base.get("teams", []),
            "years": base.get("years", ""),
            "season": base.get("season", ""),
            "accolades": base.get("accolades", ""),
            "aliases": base.get("aliases", []),
            "sil": None,
            "photo": None,
        }
        try:
            file_title = overrides.get(name) or wiki_lead_file(name)
            if not file_title:
                skipped.append(f"{name} (no Wikipedia image)")
                roster.append(rec)
                continue
            ii = commons_imageinfo(file_title)
            if not ii:
                skipped.append(f"{name} (no imageinfo)")
                roster.append(rec)
                continue
            img_url, lic, attr = ii
            if not is_free(lic):
                skipped.append(f"{name} (non-free: {lic or 'unknown'})")
                roster.append(rec)
                continue

            raw = SESSION.get(img_url, timeout=30).content
            tok_p = secrets.token_hex(12)
            tok_d = secrets.token_hex(12)
            save_png(raw, os.path.join(p_dir, f"{tok_p}.png"))
            sil = to_silhouette(remove_bg(raw))
            save_png(sil, os.path.join(d_dir, f"{tok_d}.png"))

            rec["photo"] = tok_p
            rec["sil"] = tok_d
            credits.append({"name": name, **attr})
        except Exception as e:  # noqa: BLE001
            print(f"  ! {e}", file=sys.stderr)
            skipped.append(f"{name} (error: {e})")
        roster.append(rec)
        time.sleep(args.sleep)

    # server/roster.js
    header = (
        "// AUTO-GENERATED server-only roster. Never bundled to the client.\n"
        "// `sil`/`photo` are opaque image tokens. `aliases` lets alternate\n"
        "// spellings count as correct (preserved across regenerations).\n"
    )
    with open(roster_path, "w", encoding="utf-8") as f:
        f.write(header + "export const ROSTER = " +
                json.dumps(roster, indent=2, ensure_ascii=False) + ";\n")

    # public/credits.html  (CC-BY / CC-BY-SA require visible attribution)
    rows = "\n".join(
        f'<li><b>{c["name"]}</b> — photo by {c["artist"]}, '
        f'{c["license"]} '
        f'(<a href="{c["source"]}">source</a>'
        f'{", <a href=%r>license</a>" % c["license_url"] if c["license_url"] else ""})'
        f"</li>"
        for c in credits
    )
    html = (
        "<!doctype html><meta charset='utf-8'>"
        "<title>Image credits — Name That Dude</title>"
        "<style>body{font-family:system-ui;max-width:760px;margin:40px auto;"
        "padding:0 16px;line-height:1.5}h1{font-size:22px}li{margin:6px 0}</style>"
        "<h1>Image credits</h1><p>Player photos are sourced from Wikimedia "
        "Commons under the licenses noted. Silhouettes are derived works of "
        "those photos.</p><ul>" + rows + "</ul>"
    )
    with open(os.path.join(root, "public", "credits.html"), "w",
              encoding="utf-8") as f:
        f.write(html)

    with open(os.path.join(root, "skipped.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(skipped) + ("\n" if skipped else ""))

    kept = sum(1 for r in roster if r["sil"])
    print(f"\nDone. {kept}/{len(roster)} players have free imagery.")
    if skipped:
        print(f"{len(skipped)} need attention -> skipped.txt")
        print("Add free images via --overrides 'File:...' and re-run.")


if __name__ == "__main__":
    main()

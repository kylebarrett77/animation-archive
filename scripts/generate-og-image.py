#!/usr/bin/env python3
"""
Generate dist/og-image.png for the Global Animation Archive.

Reads live stats from dist/index.html (regex-scraped from the rendered stats bar
so this stays honest to whatever the last build produced) and renders a 1200x630
OG card matching the site's editorial palette.

Usage:
  python3 scripts/generate-og-image.py
  # or with overrides:
  python3 scripts/generate-og-image.py --watchable 1868 --countries 62 --platforms 38
"""
import argparse
import re
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

# ── Site palette (matches build-site.js coreDesignTokens) ─────────────────────
CREAM       = (248, 246, 241)   # --cream
PAPER       = (255, 254, 249)   # --paper
INK         = ( 28,  25,  23)   # --ink
INK_LIGHT   = ( 68,  64,  60)   # --ink-light
INK_MUTED   = (107, 101,  94)   # --ink-muted
RULE        = (214, 211, 209)   # --rule
ACCENT      = (159,  18,  57)   # --accent (#9f1239)

# ── Layout ────────────────────────────────────────────────────────────────────
W, H = 1200, 630
MARGIN = 64

# ── Font resolution ───────────────────────────────────────────────────────────
def find_fonts(repo_root: Path):
    """Prefer TTFs we ship beside the script; fall back to woff2 conversion."""
    out_dir = Path(__file__).resolve().parent
    candidates = {
        'playfair':       ['playfair-display.ttf', 'playfair-display.woff2'],
        'playfair_bold':  ['playfair-display-600.ttf', 'playfair-display-600.woff2'],
        'mono':           ['jetbrains-mono.ttf', 'jetbrains-mono.woff2'],
        'mono_bold':      ['jetbrains-mono-600.ttf', 'jetbrains-mono-600.woff2'],
    }
    resolved = {}
    search_dirs = [out_dir, repo_root / 'fonts', repo_root / 'scripts']
    for key, names in candidates.items():
        found = None
        for d in search_dirs:
            for n in names:
                p = d / n
                if p.exists():
                    found = p
                    break
            if found:
                break
        if not found:
            sys.exit(f"missing font: any of {names} in {search_dirs}")
        # Pillow can't read woff2 directly — convert on the fly.
        if str(found).endswith('.woff2'):
            from fontTools.ttLib import TTFont
            ttf_path = out_dir / found.name.replace('.woff2', '.ttf')
            if not ttf_path.exists():
                f = TTFont(str(found))
                f.flavor = None
                f.save(str(ttf_path))
            found = ttf_path
        resolved[key] = str(found)
    return resolved

# ── Stats acquisition ─────────────────────────────────────────────────────────
def read_live_stats(repo_root: Path):
    idx = repo_root / 'dist' / 'index.html'
    if not idx.exists():
        return None
    html = idx.read_text(encoding='utf-8', errors='ignore')
    def grab(label):
        m = re.search(rf'<span class="stat-label">{label}</span><span class="stat-value">([\d,]+)</span>', html)
        return int(m.group(1).replace(',', '')) if m else None
    return {
        'watchable': grab('Watchable Now'),
        'total':     grab('Catalogued'),
        'countries': grab('Countries'),
        'platforms': grab('Platforms'),
    }

# ── Drawing ───────────────────────────────────────────────────────────────────
def render(stats, fonts, out_path: Path):
    img = Image.new('RGB', (W, H), CREAM)
    d = ImageDraw.Draw(img)

    # Top + bottom hairline rules — newspaper masthead idiom
    d.rectangle([0, 0, W, 4], fill=INK)
    d.rectangle([0, H - 4, W, H], fill=INK)

    # Eyebrow strip — softened per design critique. Drops from 16px to
    # 13px so it sits clearly below the headline+tagline+stats block in
    # visual weight.
    eyebrow = "EST. 2024  ·  A LIVING RESEARCH COLLECTION  ·  WORLD ANIMATION"
    f_eyebrow = ImageFont.truetype(fonts['mono'], 13)
    bb = d.textbbox((0, 0), eyebrow, font=f_eyebrow)
    d.text(((W - (bb[2]-bb[0])) / 2, MARGIN + 6), eyebrow, fill=INK_MUTED, font=f_eyebrow)

    # Headline — the watchable count.
    # Pillow's default text() anchor is "la" (left-ascender), so textbbox returns
    # absolute y-coords from the draw origin. bb[3] is the actual visual bottom
    # of the descender — use it directly for the underline.
    f_huge = ImageFont.truetype(fonts['playfair_bold'], 200)
    headline = f"{stats['watchable']:,}"
    bb = d.textbbox((0, 0), headline, font=f_huge)
    text_w = bb[2] - bb[0]
    hx = (W - text_w) / 2 - bb[0]
    hy = 120
    d.text((hx, hy), headline, fill=INK, font=f_huge)

    # Accent underline beneath the number — widened to span full digit
    # width per design critique (was 0.40, now 0.85) so the underline
    # visually anchors the entire number rather than the comma.
    text_bottom = hy + bb[3]
    underline_y = text_bottom + 18
    underline_w = text_w * 0.85
    ux = (W - underline_w) / 2
    d.rectangle([ux, underline_y, ux + underline_w, underline_y + 4], fill=ACCENT)

    # Tagline — Playfair italic
    f_tag = ImageFont.truetype(fonts['playfair'], 38)
    tagline = "animated films you can watch right now"
    tb = d.textbbox((0, 0), tagline, font=f_tag)
    tag_y = underline_y + 22
    d.text(((W - (tb[2]-tb[0])) / 2 - tb[0], tag_y), tagline, fill=INK_LIGHT, font=f_tag)
    tag_bottom = tag_y + tb[3]

    # Stats row — dropped well below the tagline
    f_stats = ImageFont.truetype(fonts['mono_bold'], 17)
    stats_line = (
        f"{stats['total']:,} CATALOGUED   ·   "
        f"{stats['countries']} COUNTRIES   ·   "
        f"{stats['platforms']} PLATFORMS   ·   "
        f"VERIFIED WATCH LINKS"
    )
    bb = d.textbbox((0, 0), stats_line, font=f_stats)
    sy = max(tag_bottom + 28, H - MARGIN - 80)
    d.text(((W - (bb[2]-bb[0])) / 2, sy), stats_line, fill=INK, font=f_stats)

    # Hairline above wordmark
    rule_y = sy + bb[3] + 18
    d.line([(MARGIN, rule_y), (W - MARGIN, rule_y)], fill=RULE, width=1)

    # Bottom row — wordmark + URL
    f_mark = ImageFont.truetype(fonts['mono_bold'], 16)
    f_url  = ImageFont.truetype(fonts['mono'], 16)
    wordmark = "GLOBAL  ANIMATION  ARCHIVE"
    url      = "animationarchive.netlify.app"
    by = H - MARGIN - 8
    d.text((MARGIN, by), wordmark, fill=INK, font=f_mark)
    bb = d.textbbox((0, 0), url, font=f_url)
    d.text((W - MARGIN - (bb[2]-bb[0]), by), url, fill=INK_MUTED, font=f_url)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, 'PNG', optimize=True)
    return out_path

# ── Country-specific render ───────────────────────────────────────────────────
def render_country(country, total, year_range, fonts, out_path: Path, tradition=None):
    """Country-specific OG variant. Replaces the headline number with the
    country name; below it, the film count + year range. Same visual
    chrome (eyebrow + accent underline + bottom rule + wordmark)."""
    img = Image.new('RGB', (W, H), CREAM)
    d = ImageDraw.Draw(img)

    d.rectangle([0, 0, W, 4], fill=INK)
    d.rectangle([0, H - 4, W, H], fill=INK)

    # Eyebrow
    eyebrow = "GLOBAL ANIMATION ARCHIVE  ·  COUNTRY"
    f_eyebrow = ImageFont.truetype(fonts['mono'], 13)
    bb = d.textbbox((0, 0), eyebrow, font=f_eyebrow)
    d.text(((W - (bb[2]-bb[0])) / 2, MARGIN + 6), eyebrow, fill=INK_MUTED, font=f_eyebrow)

    # Country name — Playfair, sized to fit. Long names (Czechoslovakia) get
    # smaller font; short names (USSR, Cuba) get larger.
    headline_size = 180 if len(country) <= 8 else (140 if len(country) <= 14 else 100)
    f_huge = ImageFont.truetype(fonts['playfair_bold'], headline_size)
    bb = d.textbbox((0, 0), country, font=f_huge)
    text_w = bb[2] - bb[0]
    hx = (W - text_w) / 2 - bb[0]
    hy = 130 if headline_size >= 140 else 160
    d.text((hx, hy), country, fill=INK, font=f_huge)

    # Accent underline
    text_bottom = hy + bb[3]
    underline_y = text_bottom + 18
    underline_w = text_w * 0.85
    ux = (W - underline_w) / 2
    d.rectangle([ux, underline_y, ux + underline_w, underline_y + 4], fill=ACCENT)

    # Tagline — italic Playfair if tradition supplied, else just the year range
    if tradition:
        f_tag = ImageFont.truetype(fonts['playfair'], 32)
        tagline = tradition[:80]  # cap so it fits
        tb = d.textbbox((0, 0), tagline, font=f_tag)
        tag_y = underline_y + 22
        d.text(((W - (tb[2]-tb[0])) / 2 - tb[0], tag_y), tagline, fill=INK_LIGHT, font=f_tag)
        tag_bottom = tag_y + tb[3]
    else:
        tag_bottom = underline_y + 22

    # Stats line — "N films catalogued · 1932–2026"
    f_stats = ImageFont.truetype(fonts['mono_bold'], 17)
    stats_line = f"{total:,} FILMS CATALOGUED" + (f"   ·   {year_range}" if year_range else "")
    bb = d.textbbox((0, 0), stats_line, font=f_stats)
    sy = max(tag_bottom + 28, H - MARGIN - 80)
    d.text(((W - (bb[2]-bb[0])) / 2, sy), stats_line, fill=INK, font=f_stats)

    # Hairline + wordmark
    rule_y = sy + bb[3] + 18
    d.line([(MARGIN, rule_y), (W - MARGIN, rule_y)], fill=RULE, width=1)

    f_mark = ImageFont.truetype(fonts['mono_bold'], 16)
    f_url  = ImageFont.truetype(fonts['mono'], 16)
    by = H - MARGIN - 8
    d.text((MARGIN, by), "GLOBAL  ANIMATION  ARCHIVE", fill=INK, font=f_mark)
    url_label = "animationarchive.netlify.app"
    bb = d.textbbox((0, 0), url_label, font=f_url)
    d.text((W - MARGIN - (bb[2]-bb[0]), by), url_label, fill=INK_MUTED, font=f_url)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, 'PNG', optimize=True)
    return out_path

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--watchable', type=int)
    ap.add_argument('--countries', type=int)
    ap.add_argument('--platforms', type=int)
    ap.add_argument('--total',     type=int)
    ap.add_argument('--out', default=None,
                    help='output PNG path (default: dist/og-image.png)')
    # Country-specific mode: --country "Japan" --country-total 812 --year-range "1932-2026"
    ap.add_argument('--country', help='render country-specific OG card')
    ap.add_argument('--country-total', type=int)
    ap.add_argument('--year-range')
    ap.add_argument('--tradition', help='optional 3-6 word tagline below the country name')
    args = ap.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    if not (repo_root / 'package.json').exists():
        repo_root = Path.cwd()

    fonts = find_fonts(repo_root)

    # Country mode
    if args.country:
        total = args.country_total or 0
        year_range = args.year_range or ''
        if not total:
            sys.exit("--country requires --country-total")
        out = Path(args.out) if args.out else (repo_root / 'dist' / 'countries' / f'{args.country.lower().replace(" ", "-")}.og.png')
        rendered = render_country(args.country, total, year_range, fonts, out, tradition=args.tradition)
        print(f"wrote {rendered} (country: {args.country}, {total} films, {year_range or 'no range'})")
        return

    # Default homepage card
    live = read_live_stats(repo_root) or {}
    stats = {
        'watchable': args.watchable or live.get('watchable') or 0,
        'total':     args.total     or live.get('total')     or 0,
        'countries': args.countries or live.get('countries') or 0,
        'platforms': args.platforms or live.get('platforms') or 0,
    }
    if not all(stats.values()):
        sys.exit(f"could not determine all stats; got {stats}. pass --watchable/--countries/--platforms.")

    out = Path(args.out) if args.out else (repo_root / 'dist' / 'og-image.png')
    rendered = render(stats, fonts, out)
    print(f"wrote {rendered} ({stats['watchable']:,} watchable / {stats['countries']} countries / {stats['platforms']} platforms)")

if __name__ == '__main__':
    main()

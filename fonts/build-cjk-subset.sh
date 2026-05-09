#!/usr/bin/env bash
# build-cjk-subset.sh — Regenerate fonts/noto-sans-sc-subset.woff2
#
# Why a subset:
#   Full Noto Sans CJK SC OTF is ~16 MB and the BMP CJK Unified Ideographs woff2
#   subset is still ~7.5 MB. Top-3500-by-frequency covers >99% of CV/JD content
#   and lands at ~1.3 MB — the right tradeoff for repo bundling vs offline / GFW
#   tolerance when fonts.googleapis.com is unreachable.
#
# Usage:
#   bash fonts/build-cjk-subset.sh
#
# Requirements:
#   - python3 + fonttools (`brew install fonttools` or `pip install fonttools[woff]`)
#   - curl
#   - iconv

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "[1/4] Downloading Noto Sans CJK SC source OTF (~16 MB)…"
curl -fsSL -o "$TMP/noto-sans-sc.otf" \
  "https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf"

echo "[2/4] Fetching Modern Chinese Character Frequency list (MTSU)…"
curl -fsSL -o "$TMP/cn_freq.gb" \
  "https://lingua.mtsu.edu/chinese-computing/statistics/char/download.php?Which=MO"
iconv -f GB2312 -t UTF-8 "$TMP/cn_freq.gb" > "$TMP/cn_freq.txt"

echo "[3/4] Extracting top 3500 chars by frequency…"
awk -F'\t' 'NR > 6 && NF > 2 { print $2 }' "$TMP/cn_freq.txt" \
  | head -3500 \
  | tr -d '\n' \
  > "$TMP/top3500.txt"
echo "    chars in input: $(wc -m < "$TMP/top3500.txt")"

echo "[4/4] Subsetting with pyftsubset → woff2…"
# Latin Basic + Latin Extended + general/CJK punctuation + halfwidth/fullwidth
# are added explicitly so the resume can render mixed CJK + English content.
pyftsubset "$TMP/noto-sans-sc.otf" \
  --output-file="$SCRIPT_DIR/noto-sans-sc-subset.woff2" \
  --flavor=woff2 \
  --text-file="$TMP/top3500.txt" \
  --unicodes="U+0020-007F,U+00A0-00FF,U+2010-2027,U+2030-2044,U+2070-209F,U+20A0-20BF,U+2100-214F,U+2200-22FF,U+3000-303F,U+30A0-30FF,U+FE30-FE4F,U+FF00-FFEF" \
  --layout-features='*' \
  --notdef-outline \
  --recommended-glyphs \
  --name-IDs='*' \
  --name-legacy

echo
echo "Done. Output:"
ls -lh "$SCRIPT_DIR/noto-sans-sc-subset.woff2"

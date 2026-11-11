#!/usr/bin/env bash
# Reproducible build of the self-hosted Malayalam face (Story 1.3).
#
# Fetches the pinned upstream Noto Sans Malayalam variable TTF (and its UI sibling, used only to
# measure the fallback's size-adjust), verifies both sha256 hashes, instances the wdth axis to 100
# (wght 400:700 stays variable), subsets to the full Malayalam script range with every layout
# feature kept, and writes public/fonts/noto-sans-malayalam-2.104.woff2. It then prints the hhea
# metrics and the size-adjust ratio that src/design/fonts.css uses for the metric-matched
# fallback face.
#
# Tooling: fonttools + brotli, installed into a throwaway venv (never a project dependency).
# Usage: web/scripts/build-font.sh            (needs python3 >= 3.10 and curl)
# Reruns are byte-identical; the committed file must match a fresh run.
set -euo pipefail

WEB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$WEB_ROOT/public/fonts/noto-sans-malayalam-2.104.woff2"

COMMIT=8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5
BASE_URL="https://raw.githubusercontent.com/google/fonts/$COMMIT/ofl"
FONT_PATH='notosansmalayalam/NotoSansMalayalam%5Bwdth,wght%5D.ttf'
FONT_SHA=312e0e7c3cc15fa09eb42a8f749eeb246b593ed420e3c81aafe8d910c3a6fb56
UI_PATH='notosansmalayalamui/NotoSansMalayalamUI%5Bwdth,wght%5D.ttf'
UI_SHA=6980d9e69af585a3346e21cdaf2e20fcbd292e24db043da679ddf2bf2acb884c

FONTTOOLS_VERSION=4.60.1
BROTLI_VERSION=1.1.0
UNICODES='U+0D00-0D7F,U+200C-200D,U+25CC,U+0964-0965'

# fontTools stamps head.modified from SOURCE_DATE_EPOCH when set: pin it so reruns are
# byte-identical (2026-11-11T00:00:00Z, the date this build was pinned).
export SOURCE_DATE_EPOCH=1794355200

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fetch() { # url dest sha256
  curl -sSfL -o "$2" "$1"
  local actual
  actual="$(shasum -a 256 "$2" | cut -d' ' -f1)"
  if [[ "$actual" != "$3" ]]; then
    echo "build-font: sha256 mismatch for $1" >&2
    echo "  expected $3" >&2
    echo "  actual   $actual" >&2
    exit 1
  fi
}

echo "build-font: fetching pinned upstream fonts (google/fonts@${COMMIT:0:7})"
fetch "$BASE_URL/$FONT_PATH" "$WORK/ml.ttf" "$FONT_SHA"
fetch "$BASE_URL/$UI_PATH" "$WORK/ml-ui.ttf" "$UI_SHA"

echo "build-font: installing fonttools $FONTTOOLS_VERSION + brotli $BROTLI_VERSION into a temp venv"
python3 -m venv "$WORK/venv"
"$WORK/venv/bin/pip" install --quiet --disable-pip-version-check \
  "fonttools==$FONTTOOLS_VERSION" "brotli==$BROTLI_VERSION"
PY="$WORK/venv/bin/python"

echo "build-font: instancing wdth=100 wght=400:700"
"$PY" -m fontTools.varLib.instancer "$WORK/ml.ttf" wdth=100 wght=400:700 -q -o "$WORK/ml-inst.ttf"

echo "build-font: subsetting ($UNICODES, all layout features)"
"$PY" -m fontTools.subset "$WORK/ml-inst.ttf" \
  --unicodes="$UNICODES" \
  --layout-features='*' \
  --flavor=woff2 \
  --output-file="$OUT"

echo "build-font: wrote ${OUT#"$WEB_ROOT/"} ($(wc -c < "$OUT" | tr -d ' ') bytes)"

# Metrics for the fallback @font-face. Overrides are scaled by size-adjust (CSS Fonts 5), so
# they are divided by it here: the fallback's line box then matches the web face's exactly.
"$PY" - "$OUT" "$WORK/ml.ttf" "$WORK/ml-ui.ttf" <<'PYEOF'
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

subset_path, ml_path, ui_path = sys.argv[1:4]
subset = TTFont(subset_path)
upm = subset["head"].unitsPerEm
hhea = subset["hhea"]

def malayalam_avg_advance(path):
    font = instantiateVariableFont(TTFont(path), {"wdth": 100, "wght": 400})
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    widths = [hmtx[cmap[cp]][0] for cp in range(0x0D00, 0x0D80) if cp in cmap and hmtx[cmap[cp]][0] > 0]
    return sum(widths) / len(widths) / font["head"].unitsPerEm, len(widths)

ml_avg, ml_n = malayalam_avg_advance(ml_path)
ui_avg, ui_n = malayalam_avg_advance(ui_path)
size_adjust = ml_avg / ui_avg
name = subset["name"].getDebugName(5)

print(f"version:      {name}")
print(f"unitsPerEm:   {upm}")
print(f"hhea ascent:  {hhea.ascent}  ({hhea.ascent / upm:.4%} of em)")
print(f"hhea descent: {hhea.descent}  ({-hhea.descent / upm:.4%} of em)")
print(f"hhea lineGap: {hhea.lineGap}  ({hhea.lineGap / upm:.4%} of em)")
print(f"avg Malayalam advance (wght 400): Noto Sans Malayalam {ml_avg:.5f} em over {ml_n} glyphs, "
      f"Noto Sans Malayalam UI {ui_avg:.5f} em over {ui_n} glyphs")
print("fallback @font-face descriptors:")
print(f"  size-adjust: {size_adjust:.4%};")
print(f"  ascent-override: {hhea.ascent / upm / size_adjust:.4%};")
print(f"  descent-override: {-hhea.descent / upm / size_adjust:.4%};")
print(f"  line-gap-override: {hhea.lineGap / upm / size_adjust:.4%};")
PYEOF

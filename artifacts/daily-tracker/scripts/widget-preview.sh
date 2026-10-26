#!/usr/bin/env bash
# Renders assets/widget/preview.png — the picture Android shows in the widget picker.
# Pure ImageMagick + the widget's own fonts, so it can be regenerated anywhere: `sh scripts/widget-preview.sh`.
set -euo pipefail
cd "$(dirname "$0")/.."

FB=assets/fonts/Manrope-ExtraBold.ttf
FS=assets/fonts/Manrope-SemiBold.ttf
OUT=assets/widget/preview.png

# 640×320 = a 4×2 widget at 2× density. Coordinates below are from the centre (gravity Center).
args=(-size 640x320 xc:none
  -fill '#151B17' -stroke 'rgba(201,168,76,0.55)' -strokewidth 2 -draw 'roundrectangle 1,1 638,318 44,44')

ring() { # cx ratio color
  local cx=$1 ratio=$2 col=$3
  local end
  end=$(awk "BEGIN { print -90 + 360 * $ratio }")
  args+=(-stroke '#2A3430' -strokewidth 14 -fill none -draw "circle $cx,128 $((cx + 64)),128")
  args+=(-stroke "$col" -strokewidth 14 -fill none -draw "stroke-linecap round ellipse $cx,128 64,64 -90,$end")
}

label() { # text font size color dx dy  (offsets from the centre of the image)
  args+=(-stroke none -strokewidth 0 -fill "$4" -font "$2" -pointsize "$3" -gravity Center -draw "text $5,$6 '$1'")
}

ring 107 0.65 '#5CD3C0'
ring 320 0.5 '#1DB954'
ring 533 0.8 '#B8A1F5'

label '1.3 L' "$FB" 30 '#F3F6F2' -213 -32
label '3' "$FB" 32 '#F3F6F2' 0 -32
label '8' "$FB" 32 '#F3F6F2' 213 -32
label 'Water' "$FS" 24 '#F3F6F2' -213 62
label 'Squats' "$FS" 24 '#F3F6F2' 0 62
label 'Meditation' "$FS" 24 '#F3F6F2' 213 62
label 'of 2 L' "$FS" 20 '#AEB8B1' -213 92
label 'of 6 snacks' "$FS" 20 '#AEB8B1' 0 92
label 'of 10 min' "$FS" 20 '#AEB8B1' 213 92

magick "${args[@]}" "$OUT"
echo "wrote $OUT"

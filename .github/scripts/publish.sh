#!/usr/bin/env bash
# 原子发布：先 build 目录整体校验，全部通过后才替换 profile/
set -euo pipefail
src="${1:-.build}"
dst="${2:-profile}"
[ -d "$src" ] || { echo "no build dir: $src" >&2; exit 1; }
tmp="$dst/.staging.$$"
mkdir -p "$tmp"
cp "$src"/*.svg "$tmp"/
# 版本戳：写进每张卡的注释，便于确认线上是哪次构建
stamp="$(date -u +%Y%m%dT%H%M%SZ)@${GITHUB_SHA:-local}"
for f in "$tmp"/*.svg; do
  printf '%s' "<!-- built $stamp -->" | cat - "$f" > "$f.tmp" && mv "$f.tmp" "$f"
done
mv "$tmp"/*.svg "$dst"/
rmdir "$tmp"
echo "published $(ls "$src"/*.svg | wc -l) cards from $src to $dst"

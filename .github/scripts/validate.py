#!/usr/bin/env python3
"""发布闸门：任何一张卡不合格就整批拒绝，线上永远保持可用的上一版。"""
import glob
import os
import sys
import xml.etree.ElementTree as ET

MAX_BYTES = 220_000
REQUIRED = ["stats", "top-langs", "streak", "contrib"]


def fail(msg):
    print("REJECT:", msg)
    sys.exit(1)


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else ".build"
    files = sorted(glob.glob(os.path.join(root, "*.svg")))
    if not files:
        fail("no svg in " + root)
    def stem(f):
        # 英文版是 stats-en-dark.svg：先去掉配色，再去掉 -en 后缀
        base = os.path.basename(f).rsplit("-", 1)[0]
        return base[:-3] if base.endswith("-en") else base

    names = {stem(f) for f in files}
    for need in REQUIRED:
        if need not in names:
            fail("missing card: " + need)
    for f in files:
        size = os.path.getsize(f)
        if size > MAX_BYTES:
            fail(f"{f} too large: {size}")
        raw = open(f, encoding="utf-8").read()
        if "<script" in raw or "javascript:" in raw:
            fail(f"{f} contains script")
        if "http" in raw.replace("http://www.w3.org", ""):
            fail(f"{f} references external URL (offline card only)")
        try:
            ET.parse(f)
        except Exception as exc:
            fail(f"{f} not well-formed xml: {exc}")
        print(f"ok {os.path.basename(f):24s} {size:>7d} B")
    print(f"PASS {len(files)} cards")


if __name__ == "__main__":
    main()

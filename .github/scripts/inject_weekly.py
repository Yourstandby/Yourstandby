#!/usr/bin/env python3
"""把最新一期 weekly 手账摘要注入 README 的 WEEKLY 标记之间。"""
import glob
import os
import re
import sys

START, END = "<!-- WEEKLY:START -->", "<!-- WEEKLY:END -->"


def latest():
    files = sorted(glob.glob("weekly/*/issue-*.md"))
    return files[-1] if files else None


def summarize(path):
    raw = open(path, encoding="utf-8").read()
    title = next((l.lstrip("# ").strip() for l in raw.splitlines() if l.startswith("# ")), path)
    body = [l.strip() for l in raw.splitlines()
            if l.strip() and not l.startswith(("#", ">", "!"))]
    bullets = [re.sub(r"^[-*]\s*", "", b) for b in body[:4]]
    link = path.replace(os.sep, "/")
    out = [f"### [{title}]({link})"]
    out += [f"- {b}" for b in bullets]
    return "\n".join(out)


def main():
    path = latest()
    if not path:
        print("no weekly issue, skip")
        return
    readme = open("README.md", encoding="utf-8").read()
    if START not in readme or END not in readme:
        sys.exit("weekly markers missing in README.md")
    block = summarize(path)
    new = re.sub(re.escape(START) + r".*?" + re.escape(END),
                 START + "\n" + block + "\n" + END, readme, flags=re.S)
    if new == readme:
        print("README unchanged")
        return
    open("README.md", "w", encoding="utf-8", newline="\n").write(new)
    print("injected", path)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""把最新一期 weekly 手账摘要注入 README 的 WEEKLY 标记之间。

手账正文是中文，所以默认只喂中文 README；英文 README 里那段是手写的，
用 README_TARGETS 指定要注入哪些文件（逗号分隔，缺标记的会跳过）。"""
import glob
import os
import re
import sys

START, END = "<!-- WEEKLY:START -->", "<!-- WEEKLY:END -->"
TARGETS = [p.strip() for p in os.environ.get("README_TARGETS", "README.zh-CN.md").split(",") if p.strip()]


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
    block = summarize(path)
    touched = 0
    for target in TARGETS:
        if not os.path.exists(target):
            print("skip (missing):", target)
            continue
        readme = open(target, encoding="utf-8").read()
        if START not in readme or END not in readme:
            print("skip (no markers):", target)
            continue
        new = re.sub(re.escape(START) + r".*?" + re.escape(END),
                     START + "\n" + block + "\n" + END, readme, flags=re.S)
        if new == readme:
            print(target, "unchanged")
            continue
        open(target, "w", encoding="utf-8", newline="\n").write(new)
        touched += 1
        print("injected", path, "->", target)
    if not touched:
        print("nothing to inject")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""生成像素风 GitHub 卡片：stats / top-langs / streak / contrib，深浅双版。
只用标准库 + 环境变量 GITHUB_TOKEN，避免依赖任何第三方卡片服务。"""
import datetime as dt
import json
import os
import sys
import urllib.request

MONO = "ui-monospace, SFMono-Regular, Consolas, Menlo, monospace"
RM = "@media (prefers-reduced-motion: reduce){*{animation:none !important}}"

PALETTE = {
    "dark": dict(bg="#16090A", surface="#22100F", line="#3D1B16", ink="#FFE9D6",
                 dim="#FFB08A", ash="#8A6A64", ember="#FF3B1F", deep="#C21B00",
                 flame="#FFB000", spark="#FFE9A8", empty="#2A1512"),
    "light": dict(bg="#FFF4EC", surface="#FFFFFF", line="#1A0D0A", ink="#1A0D0A",
                  dim="#5C3A32", ash="#8A6A64", ember="#C81E00", deep="#8A1400",
                  flame="#8A4A00", spark="#FFC98A", empty="#E7D3C6"),
}

QUERY = """
query($login:String!, $from:DateTime!, $to:DateTime!) {
  user(login:$login) {
    repositories(first:100, ownerAffiliations:OWNER, isFork:false, privacy:PUBLIC,
                 orderBy:{field:STARGAZERS, direction:DESC}) {
      totalCount
      nodes {
        name stargazerCount
        primaryLanguage { name color }
        languages(first:12, orderBy:{field:SIZE, direction:DESC}) {
          edges { size node { name } }
        }
      }
    }
    contributionsCollection(from:$from, to:$to) {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      contributionCalendar {
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}
"""


def opener():
    """显式选择代理：环境变量优先，否则直连（Windows 注册表代理常常是死端口）。"""
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if proxy:
        handler = urllib.request.ProxyHandler({"https": proxy, "http": proxy})
    else:
        handler = urllib.request.ProxyHandler({})
    return urllib.request.build_opener(handler)


PIN_QUERY = """
query($owner:String!, $name:String!) {
  repository(owner:$owner, name:$name) {
    name description stargazerCount
    primaryLanguage { name }
  }
}
"""

# 首页项目卡：改这里就行，逗号分隔；不配置环境变量时用这组默认值
PIN_REPOS = [p.strip() for p in
             os.environ.get("PIN_REPOS", "PiForge,raea,rust-anything,SAG-Wiki").split(",")
             if p.strip()]


def gql(token, query, variables):
    body = json.dumps({"query": query, "variables": variables}).encode()
    req = urllib.request.Request(
        "https://api.github.com/graphql", data=body,
        headers={"Authorization": "Bearer " + token,
                 "Content-Type": "application/json",
                 "User-Agent": "yourstandby-cards"})
    with opener().open(req, timeout=30) as resp:
        payload = json.load(resp)
    if "errors" in payload:
        raise SystemExit("GraphQL error: " + json.dumps(payload["errors"])[:400])
    return payload["data"]


def esc(text):
    return (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def shell(w, h, t, body, title, desc):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
        f'viewBox="0 0 {w} {h}" role="img" aria-labelledby="t d">'
        f'<title id="t">{title}</title><desc id="d">{desc}</desc>'
        f'<defs><style>.bar{{opacity:0;animation:on 6s steps(1,end) infinite}}'
        f'@keyframes on{{0%{{opacity:0}}6%{{opacity:1}}92%{{opacity:1}}97%{{opacity:0}}100%{{opacity:0}}}}'
        f'.cur{{animation:blink 1s steps(1,end) infinite}}'
        f'@keyframes blink{{0%,49.9%{{opacity:1}}50%,100%{{opacity:0}}}}'
        f'{RM}</style></defs>'
        f'<rect width="{w}" height="{h}" fill="{t["bg"]}"/>'
        f'<rect width="{w}" height="{h}" fill="none" stroke="{t["line"]}" stroke-width="2"/>'
        + body + "</svg>\n")


def tag(x, y, text, t, size=13, fill=None):
    fill = fill or t["ash"]
    return (f'<text x="{x}" y="{y}" font-family="{MONO}" font-size="{size}" '
            f'letter-spacing="2" fill="{fill}">{text}</text>')


def gauge(x, y, ratio, t, cells=12, cw=16, ch=10, gap=6):
    lit = max(0, min(cells, round(ratio * cells)))
    out = []
    for i in range(cells):
        on = i < lit
        cls = f' class="bar" style="animation-delay:{(i * 0.12):.2f}s"' if on else ""
        out.append(f'<rect x="{x + i * (cw + gap)}" y="{y}" width="{cw}" height="{ch}" '
                   f'fill="{t["ember"] if on else t["empty"]}"{cls}/>')
    return "".join(out)


def render_stats(data, t):
    repos = data["repositories"]
    contrib = data["contributionsCollection"]
    stars = sum(r["stargazerCount"] for r in repos["nodes"])
    langs = {}
    for r in repos["nodes"]:
        for e in r["languages"]["edges"]:
            langs[e["node"]["name"]] = langs.get(e["node"]["name"], 0) + e["size"]
    # 2×2 而不是 1×4：README 里按 480px 显示，字号必须按 1:1 设计才不会被缩小成 6px
    items = [
        ("REPOS", repos["totalCount"], 0.5),
        ("STARS", stars, 0.7),
        ("COMMITS", contrib["totalCommitContributions"], 0.8),
        ("LANGS", len(langs), 0.4),
    ]
    body = [tag(20, 28, "PROFILE SIGNALS", t, 13)]
    for i, (name, value, ratio) in enumerate(items):
        cx = 20 + (i % 2) * 228
        cy = 58 + (i // 2) * 70
        body.append(tag(cx, cy, name, t, 13))
        body.append(f'<text x="{cx}" y="{cy + 34}" font-family="{MONO}" font-size="30" '
                    f'font-weight="700" letter-spacing="1" fill="{t["ink"]}">{value}</text>')
        body.append(gauge(cx, cy + 44, ratio, t, cells=7, cw=16, ch=8, gap=6))
    return shell(476, 200, t, "".join(body), "GitHub 概况",
                 f"仓库 {repos['totalCount']} 个、Stars {stars}、提交 {contrib['totalCommitContributions']} 次、语言 {len(langs)} 种")


def render_langs(data, t):
    langs = {}
    for r in data["repositories"]["nodes"]:
        for e in r["languages"]["edges"]:
            langs[e["node"]["name"]] = langs.get(e["node"]["name"], 0) + e["size"]
    top = sorted(langs.items(), key=lambda kv: -kv[1])[:6]
    total = sum(v for _, v in top) or 1
    body = [tag(20, 28, "TOP LANGUAGES", t, 13)]
    for i, (name, size) in enumerate(top):
        y = 60 + i * 26
        ratio = size / total
        body.append(tag(20, y, name.upper()[:13], t, 13, t["ink"]))
        body.append(gauge(158, y - 10, ratio, t, cells=12, cw=13, ch=9, gap=4))
        body.append(tag(412, y, f"{ratio * 100:.0f}%", t, 12))
    return shell(476, 208, t, "".join(body), "常用语言",
                 "、".join(n for n, _ in top))


def streak_stats(calendar):
    days = [d for w in calendar["weeks"] for d in w["contributionDays"]]
    days.sort(key=lambda d: d["date"])
    best = cur = 0
    for d in days:
        cur = cur + 1 if d["contributionCount"] > 0 else 0
        best = max(best, cur)
    # 当前连续：从最后一个有贡献的日子往前数
    now = 0
    for d in reversed(days):
        if d["contributionCount"] > 0:
            now += 1
        elif now:
            break
    return now, best, sum(d["contributionCount"] for d in days)


def render_streak(data, t):
    now, best, total = streak_stats(data["contributionsCollection"]["contributionCalendar"])
    body = [tag(24, 34, "STREAK", t, 13)]
    for i, (name, value, unit) in enumerate(
            [("CURRENT", now, "天"), ("LONGEST", best, "天"), ("THIS YEAR", total, "次")]):
        x = 24 + i * 226
        body.append(tag(x, 64, name, t, 12))
        body.append(f'<text x="{x}" y="108" font-family="{MONO}" font-size="36" '
                    f'font-weight="700" fill="{t["ink"]}">{value}'
                    f'<tspan font-size="16" fill="{t["ash"]}"> {unit}</tspan></text>')
    body.append(tag(24, 138, "KEEP THE FIRE ALIVE", t, 12, t["dim"]))
    return shell(720, 160, t, "".join(body), "连续提交",
                 f"当前连续 {now} 天，最长 {best} 天，今年共 {total} 次")


def render_contrib(data, t):
    weeks = data["contributionsCollection"]["contributionCalendar"]["weeks"]
    levels = [1, 3, 6, 10]  # 0 级 = 空白，另外 4 档 */
    levels = levels
    ramp = [t["empty"], "#5A1A10", t["deep"], t["ember"], t["flame"]] if t["bg"] == PALETTE["dark"]["bg"] else \
           [t["empty"], "#F1C4AE", "#E0704F", t["ember"], t["deep"]]
    cell, gap = 11, 2
    body = []
    for wi, week in enumerate(weeks):
        for di, day in enumerate(week["contributionDays"]):
            c = day["contributionCount"]
            lvl = sum(1 for th in levels if c >= th)
            body.append(f'<rect x="{16 + wi * (cell + gap)}" y="{24 + di * (cell + gap)}" '
                        f'width="{cell}" height="{cell}" fill="{ramp[lvl]}"/>')
    w = 16 + len(weeks) * (cell + gap) + 16
    return shell(w, 24 + 7 * (cell + gap) + 20, t, "".join(body),
                 "贡献热力图", "过去一年的每日提交热力图，地牢配色")


def render_pin(repo, t):
    name = esc(repo["name"])[:24]
    desc = esc(repo["description"] or "")
    stars = repo["stargazerCount"]
    lang = (repo["primaryLanguage"] or {}).get("name") or "—"
    body = [
        f'<rect x="6" y="6" width="8" height="8" fill="{t["ember"]}" class="cur"/>',
        f'<text x="26" y="46" font-family="{MONO}" font-size="18" font-weight="700" '
        f'letter-spacing="2" fill="{t["ink"]}">{name}</text>',
        f'<text x="368" y="46" text-anchor="end" font-family="{MONO}" font-size="14" '
        f'fill="{t["flame"]}">* {stars}</text>',
        f'<rect x="16" y="62" width="368" height="2" fill="{t["line"]}"/>',
    ]
    for i in range(2):
        line = desc[i * 30:(i + 1) * 30]
        body.append(f'<text x="16" y="{88 + i * 20}" font-family="{MONO}" font-size="12" '
                    f'letter-spacing="1" fill="{t["dim"]}">{line}</text>')
    body.append(f'<rect x="16" y="150" width="8" height="8" fill="{t["ember"]}"/>')
    body.append(f'<text x="32" y="159" font-family="{MONO}" font-size="12" letter-spacing="2" '
                f'fill="{t["ash"]}">{esc(lang).upper()}</text>')
    body.append(f'<rect x="16" y="170" width="{min(stars, 20) * 8 or 0}" height="4" fill="{t["ember"]}"/>')
    return shell(400, 184, t, "".join(body), f"{repo['name']} 项目卡片", desc[:120])


def main():
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    login = os.environ.get("GH_LOGIN", "Yourstandby")
    if not token:
        raise SystemExit("missing GITHUB_TOKEN")
    today = dt.date.today()
    start = today - dt.timedelta(days=364)
    data = gql(token, QUERY, {"login": login,
                       "from": start.isoformat() + "T00:00:00Z",
                       "to": today.isoformat() + "T23:59:59Z"})["user"]
    out = os.environ.get("OUT_DIR", ".build")
    os.makedirs(out, exist_ok=True)
    writers = {"stats": render_stats, "top-langs": render_langs,
               "streak": render_streak, "contrib": render_contrib}
    pins = []
    for repo_name in PIN_REPOS:
        repo = gql(token, PIN_QUERY, {"owner": login, "name": repo_name}).get("repository")
        if repo:
            pins.append(repo)
        else:
            print("skip pin (not found):", repo_name)

    for scheme, t in PALETTE.items():
        for name, fn in writers.items():
            path = os.path.join(out, f"{name}-{scheme}.svg")
            with open(path, "w", encoding="utf-8", newline="\n") as fh:
                fh.write(fn(data, t))
            print("wrote", path)
        for repo in pins:
            path = os.path.join(out, f"pin-{repo['name'].lower()}-{scheme}.svg")
            with open(path, "w", encoding="utf-8", newline="\n") as fh:
                fh.write(render_pin(repo, t))
            print("wrote", path)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""生成像素风 GitHub 卡片：stats / top-langs / streak / contrib，深浅双版。
只用标准库 + 环境变量 GITHUB_TOKEN，避免依赖任何第三方卡片服务。"""
import datetime as dt
import glob
import json
import os
import re
import sys
import urllib.request

MONO = "ui-monospace, SFMono-Regular, Consolas, Menlo, monospace"
RM = "@media (prefers-reduced-motion: reduce){*{animation:none !important}}"

PALETTE = {
    "dark": dict(bg="#16090A", surface="#22100F", line="#3D1B16", ink="#FFE9D6",
                 dim="#FFB08A", ash="#8A6A64", ember="#FF3B1F", deep="#C21B00",
                 flame="#FFB000", spark="#FFE9A8", empty="#2A1512",
                 cyan="#2BD9FF", lime="#4CE06A", gold="#FFB000"),
    "light": dict(bg="#FFF4EC", surface="#FFFFFF", line="#1A0D0A", ink="#1A0D0A",
                  dim="#5C3A32", ash="#8A6A64", ember="#C81E00", deep="#8A1400",
                  flame="#8A4A00", spark="#FFC98A", empty="#E7D3C6",
                  cyan="#0A6E8A", lime="#1F7A3F", gold="#8A4A00"),
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
    followers { totalCount }
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
        f'.cube{{animation:rise .7s steps(4,end) both}}'
        f'@keyframes rise{{from{{opacity:0;transform:translateY(10px)}}to{{opacity:1;transform:none}}}}'
        f'.cur{{animation:blink 1s steps(1,end) infinite}}'
        f'@keyframes blink{{0%,49.9%{{opacity:1}}50%,100%{{opacity:0}}}}'
        f'{RM}</style></defs>'
        f'<rect width="{w}" height="{h}" fill="{t["bg"]}"/>'
        f'<rect width="{w}" height="{h}" fill="none" stroke="{t["line"]}" stroke-width="2"/>'
        + body + "</svg>\n")


def tag(x, y, text, t, size=13, fill=None, anchor=None):
    fill = fill or t["ash"]
    a = f' text-anchor="{anchor}"' if anchor else ""
    return (f'<text x="{x}" y="{y}"{a} font-family="{MONO}" font-size="{size}" '
            f'letter-spacing="2" fill="{fill}">{text}</text>')


def gauge(x, y, ratio, t, cells=12, cw=16, ch=10, gap=6, color=None):
    """像素条。color 传调色板键名，语义分工：
    ember=血/热力, cyan=数据/技能, lime=已通关, gold=进行中。"""
    tone = color if (color or "").startswith("#") else t[color or "ember"]
    lit = max(0, min(cells, round(ratio * cells)))
    out = []
    for i in range(cells):
        on = i < lit
        cls = f' class="bar" style="animation-delay:{(i * 0.12):.2f}s"' if on else ""
        out.append(f'<rect x="{x + i * (cw + gap)}" y="{y}" width="{cw}" height="{ch}" '
                   f'fill="{tone if on else t["empty"]}"{cls}/>')
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
        body.append(gauge(cx, cy + 44, ratio, t, cells=7, cw=16, ch=8, gap=6, color="cyan"))
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
        body.append(gauge(158, y - 10, ratio, t, cells=12, cw=13, ch=9, gap=4, color="cyan"))
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
        tone = [t["lime"], t["gold"], t["cyan"]][i]
        body.append(f'<text x="{x}" y="108" font-family="{MONO}" font-size="36" '
                    f'font-weight="700" fill="{tone}">{value}'
                    f'<tspan font-size="16" fill="{t["ash"]}"> {unit}</tspan></text>')
    body.append(tag(24, 138, "KEEP THE FIRE ALIVE", t, 12, t["dim"]))
    return shell(720, 160, t, "".join(body), "连续提交",
                 f"当前连续 {now} 天，最长 {best} 天，今年共 {total} 次")


WEEKDAY_CN = ["一", "二", "三", "四", "五", "六", "日"]


def render_rhythm(data, t):
    """提交节律：左边按月趋势折线，右边周几分布——没有 WakaTime 时的替代方案。"""
    cal = data["contributionsCollection"]["contributionCalendar"]
    months, weekday, wd_days = {}, [0] * 7, [0] * 7
    for w in cal["weeks"]:
        for d in w["contributionDays"]:
            year, month, day = d["date"].split("-")
            key = year[2:] + "/" + month
            months[key] = months.get(key, 0) + d["contributionCount"]
            idx = dt.date(int(year), int(month), int(day)).weekday()
            weekday[idx] += d["contributionCount"]
            wd_days[idx] += 1

    keys = sorted(months)[-12:]
    vals = [months[k] for k in keys]
    peak = max(vals) or 1

    body = [tag(24, 30, "CONTRIBUTION RHYTHM", t, 13)]
    # 左：月度折线 + 面积
    bx, by, bw, bh = 24, 60, 400, 96
    pts = []
    for i, v in enumerate(vals):
        x = bx + (i / max(1, len(vals) - 1)) * bw
        y = by + bh - (v / peak) * bh
        pts.append((x, y))
    area = " ".join(f"{x:.0f},{y:.0f}" for x, y in pts)
    body.append(f'<polygon points="{bx},{by + bh} {area} {bx + bw},{by + bh}" fill="{t["ember"]}" opacity="0.16"/>')
    body.append(f'<polyline points="{area}" fill="none" stroke="{t["ember"]}" stroke-width="2"/>')
    for i, (x, y) in enumerate(pts):
        body.append(f'<rect x="{x - 2:.0f}" y="{y - 2:.0f}" width="4" height="4" fill="{t["ember"]}"/>')
        if i % 2 == 0:
            body.append(tag(int(x) - 12, 176, keys[i], t, 9, t["ash"]))
    body.append(tag(bx, 196, f"PEAK {peak} / MONTH", t, 10, t["ash"]))

    # 右：周几柱状
    wx, wy, ww = 470, 156, 30
    body.append(tag(wx, 30, "BY WEEKDAY", t, 11, t["ash"]))
    wmax = max(weekday) or 1
    for i, v in enumerate(weekday):
        h = (v / wmax) * 84
        x = wx + i * 40
        body.append(f'<rect x="{x}" y="{wy - h:.0f}" width="{ww}" height="{h:.0f}" fill="{t["cyan"]}" opacity="0.85"/>')
        body.append(tag(x + 9, 176, WEEKDAY_CN[i], t, 10, t["ink"]))
    body.append(tag(wx, 196, "TOTAL COMMITS", t, 10, t["ash"]))
    return shell(760, 212, t, "".join(body), "提交节律",
                 "过去一年的月度贡献折线与周几分布")


def render_contrib3d(data, t):
    """等距投影的 3D 贡献日历：53 周 x 7 天，每格一个立方体，高度按当日贡献数。"""
    weeks = data["contributionsCollection"]["contributionCalendar"]["weeks"]
    days = [(ci, ri, d["contributionCount"])
            for ci, w in enumerate(weeks)
            for ri, d in enumerate(w["contributionDays"])]
    peak = max(c for _, _, c in days) or 1

    # 扁一点的正等距网格：周轴近水平（斜率 TH/TW≈17°），不然 53 周会塌成一条斜板
    TW, TH, MAXH = 11, 3.5, 28
    dark = t["bg"] == PALETTE["dark"]["bg"]
    ramp = (["#241110", "#5A1A10", t["deep"], t["ember"], t["flame"]] if dark
            else ["#E7D3C6", "#F0B49A", "#E0704F", t["ember"], t["deep"]])
    top_light = ["#3A1A16", "#7A2416", "#E23B18", "#FF6A4D", "#FFD27A"] if dark else \
                ["#F2E4DA", "#FFD2BC", "#F58E70", "#D8340F", "#B88300"]

    def lvl(c):
        if c <= 0:
            return 0
        if c < 3:
            return 1
        if c < 6:
            return 2
        if c < 10:
            return 3
        return 4

    body = [tag(24, 28, "CONTRIBUTION CITY", t, 13),
            tag(736, 28, f"PEAK {peak}/DAY", t, 11, t["ash"], anchor="end")]

    # 先把所有格子摊到坐标上，再按包围盒把整座城居中（视野 760 内留 24 边距）
    cells = []
    for ci, ri, cnt in days:
        cells.append({"gx": (ci - ri) * TW, "gy": (ci + ri) * TH,
                      "h": 3 + (cnt / peak) * MAXH, "ci": ci, "ri": ri, "cnt": cnt})
    gx0 = min(c["gx"] for c in cells) - TW
    gx1 = max(c["gx"] for c in cells) + TW
    gy0 = min(c["gy"] - c["h"] for c in cells) - TH   # 最高的顶面顶点
    gy1 = max(c["gy"] for c in cells) + TH            # 最前的地面顶点
    ox = 24 + (760 - 48 - (gx1 - gx0)) / 2 - gx0
    oy = 40 + (252 - (gy1 - gy0)) / 2 - gy0            # 在标题栏与页脚之间竖直居中

    # 远的先画（ci+ri 小 = 屏幕上方 = 靠后），近的后画，塔才不会盖错
    for c in sorted(cells, key=lambda c: c["gy"]):
        gx, gy, h, ci, ri, cnt = c["gx"], c["gy"], c["h"], c["ci"], c["ri"], c["cnt"]
        # 等距投影：周沿 x 走（微降），天往左上退；地面菱形中心 (x, y)，塔顶再抬 h
        x, y = ox + gx, oy + gy
        ty = y - h
        k = lvl(cnt)
        body.append(f'<g class="cube" style="animation-delay:{(ci * 0.012):.3f}s">')
        body.append(f'<polygon points="{x},{ty - TH} {x + TW},{ty} {x},{ty + TH} {x - TW},{ty}" fill="{top_light[k]}"/>')
        body.append(f'<polygon points="{x - TW},{ty} {x},{ty + TH} {x},{y + TH} {x - TW},{y}" fill="{ramp[k]}"/>')
        body.append(f'<polygon points="{x + TW},{ty} {x},{ty + TH} {x},{y + TH} {x + TW},{y}" fill="{ramp[k]}" opacity="0.72"/>')
        body.append("</g>")
    body.append(tag(24, 300, f"{len(weeks)} WEEKS · {len(days)} DAYS", t, 11, t["ash"]))
    return shell(760, 318, t, "".join(body), "3D 贡献日历",
                 "等距投影的每日贡献立方体，高度代表当日提交数")


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



ICON_SHAPES = {
    "pad": [((3, 6, 10, 5), "ink"), ((5, 7, 1, 3), "bg"), ((4, 8, 3, 1), "bg"),
            ((11, 7, 2, 2), "ember")],
    "brush": [((8, 3, 3, 8), "ink"), ((7, 11, 4, 3), "ember"), ((9, 4, 1, 6), "flame")],
    "gear": [((6, 7, 4, 4), "ember"), ((7, 4, 2, 2), "ink"), ((7, 12, 2, 2), "ink"),
             ((4, 7, 2, 2), "ink"), ((10, 7, 2, 2), "ink")],
    "coffee": [((4, 6, 7, 6), "ink"), ((11, 8, 2, 2), "ink"), ((6, 2, 1, 2), "flame"),
               ((9, 3, 1, 2), "flame"), ((5, 11, 5, 1), "ember")],
}


def draw_icon(kind, t, x0, y0, unit=3):
    out = []
    for (gx, gy, w, h), color in ICON_SHAPES.get(kind, []):
        out.append(f'<rect x="{x0 + gx * unit}" y="{y0 + gy * unit}" '
                   f'width="{w * unit}" height="{h * unit}" fill="{t[color]}"/>')
    return "".join(out)

def load_sprites():
    path = os.path.join(os.path.dirname(__file__), "..", "..", "design", "sprites.json")
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def draw_sprite(sprite, palette, x0, y0, unit=None):
    """两遍绘制：先所有描边（外扩 1 格涂黑），再所有填充 → 漫画线稿感。"""
    u = unit or sprite["unit"]
    rects = sprite["rects"]
    out = []
    for r in rects:
        if len(r) > 5 and r[5]:
            out.append(f'<rect x="{x0 + (r[0] - 1) * u}" y="{y0 + (r[1] - 1) * u}" '
                       f'width="{(r[2] + 2) * u}" height="{(r[3] + 2) * u}" '
                       f'fill="{palette["K"]}"/>')
    for r in rects:
        out.append(f'<rect x="{x0 + r[0] * u}" y="{y0 + r[1] * u}" width="{r[2] * u}" '
                   f'height="{r[3] * u}" fill="{palette[r[4]]}"/>')
    return "".join(out)


def load_quest():
    path = os.path.join(os.path.dirname(__file__), "..", "..", "design", "quest.json")
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)["stages"]


def render_trials(_data, t):
    """五关赛道：两端是角色，中间五关同一环境，数据源 design/quest.json。"""
    sp = load_sprites()
    pal = sp["palette"]
    stages = load_quest()
    body = [tag(20, 26, "THE TEN TRIALS", t, 13),
            f'<rect x="58" y="66" width="644" height="2" fill="{t["line"]}"/>',
            f'<rect x="14" y="47" width="70" height="70" fill="{t["surface"]}" '
            f'stroke="{t["line"]}" stroke-width="2"/>',
            draw_sprite(sp["sprites"][0], pal, 17, 50, unit=1),
            f'<rect x="{760 - 84}" y="47" width="70" height="70" fill="{t["surface"]}" '
            f'stroke="{t["line"]}" stroke-width="2"/>',
            draw_sprite(sp["sprites"][1], pal, 760 - 81, 50, unit=1)]
    for i, st in enumerate(stages):
        x = 118 + i * 132
        body.append(f'<rect x="{x}" y="58" width="16" height="16" fill="{st["color"]}" '
                    f'stroke="{t["line"]}" stroke-width="2"/>')
        body.append(tag(x - 4, 92, st["label"], t, 9, t["ash"]))
    return shell(760, 118, t, "".join(body), "五关赛程",
                 "同一场景两侧并行：法师用法术、战士用剑盾")


def render_party(_data, t):
    sp = load_sprites()
    pal = sp["palette"]
    mage, knight = sp["sprites"][0], sp["sprites"][1]
    # 美术分辨率写在 sprites.json 的 grid/unit 里，卡片按 grid*unit 定尺寸，
    # 换分辨率（32→64）时卡片版面不变
    u = mage.get("unit", 4)
    size = mage.get("grid", 32) * u
    # 左右严格镜像：左边距 24、内缩 8、名字左对齐；右侧全部按 760 - x - w 翻转
    box, pad = size + 16, 8
    name_y = 52 + size + 32
    role_y = name_y + 18
    body = [
        tag(20, 28, "PARTY", t, 13),
        f'<rect x="24" y="44" width="{box}" height="{box}" fill="{t["surface"]}" '
        f'stroke="{t["line"]}" stroke-width="2"/>',
        draw_sprite(mage, pal, 24 + pad, 52),
        f'<text x="{24 + pad}" y="{name_y}" font-family="{MONO}" font-size="14" '
        f'letter-spacing="1" fill="{t["ink"]}">{mage["name"]}</text>',
        tag(24 + pad, role_y, mage["role"], t, 11, t["ash"]),
        # 中线严格居中：分屏线 x=379（中心 380），VS 文字 anchor=middle
        f'<rect x="379" y="52" width="2" height="{size + 8}" fill="{t["line"]}"/>',
        f'<text x="380" y="{60 + size // 2}" text-anchor="middle" font-family="{MONO}" '
        f'font-size="16" fill="{t["ember"]}">VS</text>',
        f'<rect x="{760 - 24 - box}" y="44" width="{box}" height="{box}" '
        f'fill="{t["surface"]}" stroke="{t["line"]}" stroke-width="2"/>',
        draw_sprite(knight, pal, 760 - 24 - pad - size, 52),
        f'<text x="{760 - 24 - pad}" y="{name_y}" text-anchor="end" font-family="{MONO}" '
        f'font-size="14" letter-spacing="1" fill="{t["ink"]}">{knight["name"]}</text>',
        f'<text x="{760 - 24 - pad}" y="{role_y}" text-anchor="end" font-family="{MONO}" '
        f'font-size="11" letter-spacing="2" fill="{t["ash"]}">{knight["role"]}</text>',
    ]
    # 中间空白处：两人的基础属性，右侧战士镜像排布
    combat = load_player().get("combat", {})
    for side, who in ((0, "mage"), (1, "knight")):
        for i, (label, val) in enumerate(combat.get(who, [])):
            y = 96 + i * 30
            tone = "ember" if label == "HP" else "cyan"
            if side == 0:
                body.append(f'<text x="252" y="{y}" text-anchor="end" font-family="{MONO}" '
                            f'font-size="11" letter-spacing="1" fill="{t["ash"]}">{label}</text>')
                body.append(gauge(262, y - 9, val / 10, t, cells=6, cw=10, ch=8, gap=4, color=tone))
                body.append(f'<text x="352" y="{y}" font-family="{MONO}" font-size="11" '
                            f'fill="{t["ink"]}">{val}</text>')
            else:
                body.append(f'<text x="408" y="{y}" font-family="{MONO}" font-size="11" '
                            f'letter-spacing="1" fill="{t["ash"]}">{label}</text>')
                body.append(gauge(458, y - 9, val / 10, t, cells=6, cw=10, ch=8, gap=4, color=tone))
                body.append(f'<text x="548" y="{y}" font-family="{MONO}" font-size="11" '
                            f'fill="{t["ink"]}">{val}</text>')
    return shell(760, 52 + size + 60, t, "".join(body), "队伍",
                 f'{mage["name"]} 与 {knight["name"]} 的像素立绘')


def load_player():
    path = os.path.join(os.path.dirname(__file__), "..", "..", "design", "player.json")
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def load_player():
    path = os.path.join(os.path.dirname(__file__), "..", "..", "design", "player.json")
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


# 24x24 网格的"像素小狗魔法师"：下垂耳 + 尖顶帽 + 法杖。
# 全部整数格，unit=4 时正好 96px，放大到 192px 也不会糊。
AVATAR_SHAPES = [
        (11, 0, 2, 1, "cyan"),
        (10, 1, 4, 1, "cyan"),
        (9, 2, 6, 2, "cyan"),
        (8, 4, 8, 2, "cyan"),
        (7, 6, 10, 2, "cyan"),
        (6, 8, 12, 1, "cyan"),
        (15, 5, 2, 2, "gold"),
        (7, 9, 10, 2, "ink"),
        (6, 11, 12, 5, "ink"),
        (7, 16, 10, 1, "ink"),
        (4, 10, 2, 6, "ink"),
        (18, 10, 2, 6, "ink"),
        (9, 12, 2, 2, "bg"),
        (14, 12, 2, 2, "bg"),
        (12, 14, 2, 2, "bg"),
        (8, 17, 8, 1, "ember"),
        (8, 18, 8, 4, "ink"),
        (8, 22, 2, 2, "ink"),
        (14, 22, 2, 2, "ink"),
        (21, 11, 1, 9, "gold"),
        (20, 9, 3, 1, "gold"),
        (21, 8, 1, 3, "gold"),
]


def pixel_avatar(t, x0=20, y0=52, unit=4):
    return "".join(
        f'<rect x="{x0 + x * unit}" y="{y0 + y * unit}" '
        f'width="{w * unit}" height="{h * unit}" fill="{t[c]}"/>'
        for x, y, w, h, c in AVATAR_SHAPES)


def render_player(_data, t):
    p = load_player()
    exp_ratio = p["exp"]["current"] / p["exp"]["next"]
    sp = load_sprites()
    mage = sp["sprites"][0]
    body = [
        f'<rect x="16" y="48" width="104" height="104" fill="{t["surface"]}" '
        f'stroke="{t["line"]}" stroke-width="2"/>',
        draw_sprite(mage, sp["palette"], 36, 68, unit=1),  # 64px 美术居中放进 104px 存档框
        f'<text x="140" y="76" font-family="{MONO}" font-size="22" font-weight="700" '
        f'letter-spacing="2" fill="{t["ink"]}">{p["name"]}</text>',
        tag(140, 100, p["title"], t, 12, t["ash"]),
        f'<text x="140" y="132" font-family="{MONO}" font-size="16" letter-spacing="2" '
        f'fill="{t["flame"]}">LV.{p["level"]:02d}</text>',
        # 条的右边界 = 200 + 9*12 + 8*5 = 348，文字从 352 起，属性列从 452 起
        gauge(200, 120, exp_ratio, t, cells=9, cw=12, ch=9, gap=5, color="gold"),
        tag(358, 132, f'EXP {p["exp"]["current"]}/{p["exp"]["next"]}', t, 11, t["ash"]),
    ]
    for i, st in enumerate(p["stats"]):
        y = 76 + i * 30
        body.append(tag(452, y, st["key"], t, 12, t["ink"]))
        body.append(gauge(544, y - 10, st["value"] / st["max"], t, cells=10, cw=12, ch=9, gap=4, color="cyan"))
        body.append(tag(714, y, f'{st["value"]}', t, 12, t["dim"]))
    return shell(760, 176, t, "".join(body), "角色存档",
                 f'{p["name"]} · {p["title"]} · LV.{p["level"]}')


QUEST_MARK = {"cleared": "X", "active": ">", "locked": "-"}
QUEST_COLOR = {"cleared": "ember", "active": "flame", "locked": "ash"}


def render_quests(_data, t):
    p = load_player()
    quests = p["quests"]
    body = [tag(20, 28, "QUEST LOG", t, 13)]
    for i, q in enumerate(quests):
        y = 62 + i * 36
        color = t[QUEST_COLOR[q["status"]]] if q["status"] != "locked" else t["line"]
        body.append(f'<rect x="20" y="{y - 16}" width="16" height="16" fill="none" '
                    f'stroke="{color}" stroke-width="2"/>')
        body.append(f'<text x="24" y="{y - 4}" font-family="{MONO}" font-size="12" '
                    f'fill="{color}">{QUEST_MARK[q["status"]]}</text>')
        body.append(tag(48, y, q["name"], t, 13, t["ink"] if q["status"] != "locked" else t["ash"]))
        # 条的右边界 = 440 + 10*12 + 9*4 = 596，状态文字从 620 起
        tone = t["lime"] if q["status"] == "cleared" else (t["gold"] if q["status"] == "active" else None)
        body.append(gauge(440, y - 11, q["progress"], t, cells=10, cw=12, ch=9, gap=4, color=tone))
        body.append(tag(620, y, q["status"].upper(), t, 11,
                        t["dim"] if q["status"] != "locked" else t["ash"]))
    cleared = sum(1 for q in quests if q["status"] == "cleared")
    body.append(tag(20, 62 + len(quests) * 36 + 6,
                    f"CLEARED {cleared}/{len(quests)}", t, 12, t["ash"]))
    height = 62 + len(quests) * 36 + 20
    return shell(760, height, t, "".join(body), "任务日志",
                 f'已通关 {cleared}/{len(quests)}')


def render_inventory(_data, t):
    p = load_player()
    items = p["inventory"]
    body = [tag(20, 28, "INVENTORY", t, 13)]
    for i, it in enumerate(items):
        x = 16 + i * 184
        body.append(f'<rect x="{x}" y="44" width="172" height="132" fill="{t["surface"]}" '
                    f'stroke="{t["line"]}" stroke-width="2"/>')
        body.append(f'<rect x="{x + 20}" y="60" width="52" height="52" fill="{t["bg"]}" '
                    f'stroke="{t["line"]}" stroke-width="2"/>')
        body.append(draw_icon(it["icon"], t, x + 26, 64))
        body.append(tag(x + 20, 136, it["name"], t, 12, t["ink"]))
        body.append(tag(x + 20, 158, it["desc"], t, 11, t["ash"]))
    return shell(760, 196, t, "".join(body), "物品栏",
                 "、".join(it["name"] for it in items))


def render_gear(data, t):
    repos = data["repositories"]
    stars = sum(r["stargazerCount"] for r in repos["nodes"])
    cells = [
        ("FOLLOWERS", data["followers"]["totalCount"]),
        ("REPOS", repos["totalCount"]),
        ("STARS", stars),
        ("COMMITS", data["contributionsCollection"]["totalCommitContributions"]),
    ]
    body = []
    for i, (label, value) in enumerate(cells):
        x = 12 + i * 186
        body.append(f'<rect x="{x}" y="10" width="174" height="56" fill="{t["surface"]}" '
                    f'stroke="{t["line"]}" stroke-width="2"/>')
        body.append(f'<rect x="{x + 10}" y="20" width="8" height="8" fill="{t["ember"]}" class="cur"/>')
        body.append(tag(x + 26, 30, label, t, 11, t["ash"]))
        body.append(f'<text x="{x + 12}" y="56" font-family="{MONO}" font-size="22" '
                    f'font-weight="700" fill="{t["cyan"]}">{value}</text>')
    return shell(760, 76, t, "".join(body), "状态栏",
                 "、".join(f"{l} {v}" for l, v in cells))


def load_weekly(limit=3):
    root = os.path.join(os.path.dirname(__file__), "..", "..", "weekly")
    files = sorted(glob.glob(os.path.join(root, "*", "issue-*.md")))
    rows = []
    for f in files[-limit:][::-1]:
        raw = open(f, encoding="utf-8").read()
        title = next((l[2:].strip() for l in raw.splitlines() if l.startswith("# ")),
                     os.path.basename(f))
        num = re.search(r"issue-(\d+)", f)
        date = re.search(r"^date:\s*(\S+)", raw, re.M)
        rows.append({"issue": int(num.group(1)) if num else 0,
                     "title": title, "date": date.group(1) if date else ""})
    return rows


def render_log(_data, t):
    rows = load_weekly(3)
    body = [tag(20, 28, "BATTLE LOG", t, 13)]
    for i, r in enumerate(rows):
        y = 62 + i * 34
        body.append(tag(20, y, f'ISSUE-{r["issue"]:02d}', t, 12, t["ember"]))
        body.append(tag(112, y, r["date"], t, 12, t["ash"]))
        body.append(tag(216, y, r["title"][:24], t, 13, t["ink"]))
    height = 62 + max(len(rows), 1) * 34 + 14
    return shell(760, height, t, "".join(body), "战报日志",
                 f"最近 {len(rows)} 期手账")


def render_contact(_data, t):
    p = load_player()
    body = [tag(20, 28, "COMMS", t, 13)]
    for i, link in enumerate(p["links"]):
        y = 64 + i * 34
        body.append(f'<rect x="20" y="{y - 14}" width="8" height="8" fill="{t["ember"]}" class="cur"/>')
        body.append(tag(40, y, link["label"], t, 12, t["ash"]))
        body.append(tag(160, y, link["value"], t, 13, t["ink"]))
        body.append(tag(640, y, "ONLINE", t, 11, t["dim"]))
    height = 64 + len(p["links"]) * 34 + 12
    return shell(760, height, t, "".join(body), "通讯面板",
                 "、".join(link["label"] for link in p["links"]))



# 5x7 点阵字模，用于技术徽章（像素字体不走 @font-face，SVG 里直接画方块）
GLYPHS = {
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
    "S": ("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
    "P": ("11110", "10001", "10001", "11110", "10000", "10000", "10000"),
    "Y": ("10001", "01010", "00100", "00100", "00100", "00100", "00100"),
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "C": ("01111", "10000", "10000", "10000", "10000", "10000", "01111"),
    "#": ("01010", "01010", "11111", "01010", "11111", "01010", "01010"),
    "G": ("01111", "10000", "10000", "10111", "10001", "10001", "01111"),
    "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "N": ("10001", "11001", "10101", "10011", "10001", "10001", "10001"),
    "D": ("11110", "10001", "10001", "10001", "10001", "10001", "11110"),
    "F": ("11111", "10000", "10000", "11110", "10000", "10000", "10000"),
    "K": ("10001", "10010", "10100", "11000", "10100", "10010", "10001"),
    "H": ("10001", "10001", "10001", "11111", "10001", "10001", "10001"),
    "V": ("10001", "10001", "10001", "10001", "10001", "01010", "00100"),
    "M": ("10001", "11011", "10101", "10101", "10001", "10001", "10001"),
    "X": ("10001", "01010", "00100", "00100", "00100", "01010", "10001"),
}


def tech_tile(item, t, x, y, scale=2):
    """16x16 像素徽章：品牌色底 + 5x7 点阵字母 + 1px 黑描边。"""
    size = 16 * scale
    out = [f'<rect x="{x}" y="{y}" width="{size}" height="{size}" fill="{t["line"]}"/>',
           f'<rect x="{x + scale}" y="{y + scale}" width="{size - 2 * scale}" '
           f'height="{size - 2 * scale}" fill="{item["color"]}"/>']
    tag = item["tag"]
    text_w = len(tag) * 5 + (len(tag) - 1)
    gx = x + ((16 - text_w) // 2) * scale
    gy = y + 4 * scale
    for ci, ch in enumerate(tag):
        rows = GLYPHS.get(ch)
        if not rows:
            continue
        for ry, row in enumerate(rows):
            for rx, bit in enumerate(row):
                if bit == "1":
                    out.append(f'<rect x="{gx + (ci * 6 + rx) * scale}" y="{gy + ry * scale}" '
                               f'width="{scale}" height="{scale}" fill="#FFFFFF"/>')
    return "".join(out)


def load_icons():
    path = os.path.join(os.path.dirname(__file__), "..", "..", "design", "icons.json")
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def tech_tile(slug, icons, x, y, size=24, inset=2):
    """品牌色方块 + 官方图标 path（simple-icons，24x24 viewBox），白描边保持像素感。"""
    icon = icons.get(slug)
    if not icon:
        return ""
    scale = (size - inset * 2) / 24.0
    return (f'<rect x="{x}" y="{y}" width="{size}" height="{size}" fill="{icons and "#1A1D23"}"/>'
            f'<rect x="{x + 1}" y="{y + 1}" width="{size - 2}" height="{size - 2}" fill="{icon["hex"]}"/>'
            f'<g transform="translate({x + inset} {y + inset}) scale({scale:.4f})">'
            f'<path d="{icon["path"]}" fill="#FFFFFF"/></g>')


def load_stack():
    path = os.path.join(os.path.dirname(__file__), "..", "..", "design", "stack.json")
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def render_stack(_data, t):
    """技术栈卡片：14 格像素条 + 技术名。README 里按 760px 显示，1:1 不缩放。"""
    items = load_stack()
    icons = load_icons()
    body = [tag(20, 28, "STACK", t, 13)]
    for i, it in enumerate(items):
        y = 68 + i * 44
        body.append(tag(20, y, it["label"], t, 13, t["ink"]))
        body.append(gauge(150, y - 11, it["pct"] / it["max"], t,
                          cells=10, cw=16, ch=10, gap=5, color="cyan"))
        for j, slug in enumerate(it.get("items", [])):
            body.append(tech_tile(slug, icons, 372 + j * 32, y - 18, size=26))
    height = 72 + len(items) * 44 + 8
    return shell(760, height, t, "".join(body), "技术栈",
                 "、".join(icons[s]["title"] for it in items for s in it.get("items", []) if s in icons))


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
               "streak": render_streak, "contrib": render_contrib,
               "stack": render_stack, "player": render_player,
               "quests": render_quests, "inventory": render_inventory,
               "gear": render_gear, "log": render_log, "comms": render_contact,
               "party": render_party, "trials": render_trials,
               "contrib3d": render_contrib3d, "rhythm": render_rhythm}
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

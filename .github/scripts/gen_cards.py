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

# ---- 语言：默认中文（卡面不变），CARDS_LANG=en 出英文版 -------------------
# 英文版文件名带 -en 后缀：stats-dark.svg / stats-en-dark.svg，两套并存在 profile/。
LANG = os.environ.get("CARDS_LANG", "zh").strip().lower()
if LANG not in ("zh", "en"):
    LANG = "zh"
SUFFIX = "" if LANG == "zh" else "-" + LANG

# design/*.json 与 weekly/*.md 里手写的中文词条 → 英文。
# 只列静态词条；带数字的说明文案走 T()。
EN_TERMS = {
    # 任务日志一行只有 384px（约 39 个半角字符）
    "个人像素主题主页": "Personal pixel-art homepage",
    "像素资产库：色板 / 网格 / 精灵": "Pixel kit: palette, grid, sprites",
    "用 Rust 或 Go 写一个顺手的 CLI": "A Rust or Go CLI I actually reach for",
    "把可视化项目做成可分享的作品": "Shareable visualization project",
    "把一篇论文的想法做成能跑的原型": "Paper idea → running prototype",
    # 物品栏格子只有 132px（约 15 个半角字符），英文用短版；站内文案比这里长
    "玩通了会做笔记": "Notes when done",
    "16×16 精灵图": "16×16 sprites",
    "拆开看看原理": "Takes it apart",
    "一杯手冲的时间": "One pour-over",
    "鸡毛法师": "Feather Mage",
    "小白战士": "Snow Knight",
    "雪原": "Snowfield",
    "原始森林": "Deep forest",
    "沙漠": "Desert",
    "石坑": "Quarry",
    "水底": "Seafloor",
    "把主页做成像素工作台": "Putting the homepage on a pixel workbench",
    # PiForge 的仓库简介本身就是中文（GitHub 上的 description），项目卡要跟着换
    "把 Pi Coding Agent 装进一张安静的三栏工作台：本地优先、多会话、缓存感知。":
        "Puts the Pi Coding Agent inside one quiet three-column workbench: "
        "local-first, multi-session, cache-aware.",
    "把 Pi Coding Agent 装进一张安静的三栏工作台": "Put Pi Coding Agent in one quiet workbench",
    "已通关": "cleared",
    "进行中": "in progress",
    "未解锁": "locked",
}


def fit(text, max_px, size, track=2):
    """把一行字裁进 max_px（等宽像素字的近似宽度）。
    卡片格子是硬边界，英文比中文宽，宁可截断收尾也不让它压到隔壁格。"""
    def width(s):
        return sum((size if "\u4e00" <= ch <= "\u9fff" else size * 0.6) + track for ch in s)

    if width(text) <= max_px:
        return text
    out = ""
    for ch in text:
        if width(out + ch) + width("...") > max_px:
            break
        out += ch
    return out.rstrip(" ,·-/") + "..."


def T(zh, en):
    """卡面上的文案：默认中文，CARDS_LANG=en 时出英文。"""
    return zh if LANG == "zh" else en


def localize(svg):
    """英文卡：把渲染结果里的中文词条按 EN_TERMS 换掉。
    命中才替换；没覆盖到的中文会打印出来，方便补词表。"""
    if LANG == "zh":
        return svg
    for zh, en in EN_TERMS.items():
        if zh in svg:
            svg = svg.replace(zh, en)
    left = sorted(set(re.findall(r"[\u4e00-\u9fff]+", svg)))
    if left:
        print("  ! untouched Chinese:", " ".join(left[:8]))
    return svg

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
    return shell(476, 200, t, "".join(body), T("GitHub 概况", "GitHub snapshot"),
                 T(f"仓库 {repos['totalCount']} 个、Stars {stars}、提交 {contrib['totalCommitContributions']} 次、语言 {len(langs)} 种",
                   f"{repos['totalCount']} repos · {stars} stars · "
                   f"{contrib['totalCommitContributions']} commits · {len(langs)} languages"))


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
    return shell(476, 208, t, "".join(body), T("常用语言", "Top languages"),
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
            [("CURRENT", now, T("天", "days")), ("LONGEST", best, T("天", "days")),
             ("THIS YEAR", total, T("次", "commits"))]):
        x = 24 + i * 226
        body.append(tag(x, 64, name, t, 12))
        tone = [t["lime"], t["gold"], t["cyan"]][i]
        body.append(f'<text x="{x}" y="108" font-family="{MONO}" font-size="36" '
                    f'font-weight="700" fill="{tone}">{value}'
                    f'<tspan font-size="16" fill="{t["ash"]}"> {unit}</tspan></text>')
    body.append(tag(24, 138, "KEEP THE FIRE ALIVE", t, 12, t["dim"]))
    return shell(720, 160, t, "".join(body), T("连续提交", "Commit streak"),
                 T(f"当前连续 {now} 天，最长 {best} 天，今年共 {total} 次",
                   f"{now} days current · {best} days longest · {total} commits this year"))


WEEKDAY_CN = ["一", "二", "三", "四", "五", "六", "日"] if LANG == "zh" else \
    ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]

# 五线谱：5 条线 + 4 个间位 = 9 个音高槽，上下各留半格余量
STAFF_LINES = (84, 96, 108, 120, 132)
STAFF_TOP, STAFF_BOT, STAFF_STEP = STAFF_LINES[0], STAFF_LINES[-1], 6


def staff_note(x, y, level, t, delay=0.0):
    """第 x 列第 y 高度的一个音符。level 用音符时值编码当天强度：
    0=休止符，1=四分，2=八分，3=十六分——贡献越多，音符越密。"""
    if level == 0:
        return (f'<rect x="{x - 6}" y="{y + 3}" width="12" height="3" rx="1" '
                f'fill="{t["ash"]}" opacity="0.55"/>')
    up = y >= 108                      # 中线以下符干朝上，以上朝下（记谱惯例）
    sx = x + 5.5 if up else x - 5.5
    sy = y - 1 if up else y + 1
    ty = sy - 30 if up else sy + 30
    fill = t["flame"] if level >= 3 else t["ember"]
    parts = [
        f'<ellipse cx="{x}" cy="{y}" rx="6.5" ry="4.8" fill="{fill}" '
        f'transform="rotate(-16 {x} {y})"/>',
        f'<rect x="{sx - 1.2:.1f}" y="{min(sy, ty):.1f}" width="2.4" '
        f'height="{abs(ty - sy):.1f}" fill="{t["ink"]}"/>',
    ]
    for i in range(level - 1):         # 符尾：八分 1 条，十六分 2 条
        fy = ty + (11 * i if up else -11 * i)
        d = (f"M {sx:.1f},{fy:.1f} q 13,2 11,10 q -1,5 -4,7" if up
             else f"M {sx:.1f},{fy:.1f} q 13,-2 11,-10 q -1,-5 -4,-7")
        parts.append(f'<path d="{d}" fill="none" stroke="{t["ink"]}" stroke-width="2.6" '
                     f'stroke-linecap="round"/>')
    return (f'<g class="cube" style="animation-delay:{delay:.2f}s">'
            + "".join(parts) + "</g>")


def render_rhythm(data, t):
    """周内节律画成五线谱：7 个音符 = 最近 7 天，音高与音符时值 = 当天贡献量。
    滚动 7 天窗口，所以每跑一次卡就往前推一天（cards.yml 每日一次）。"""
    cal = data["contributionsCollection"]["contributionCalendar"]
    days = sorted((d for w in cal["weeks"] for d in w["contributionDays"]),
                  key=lambda d: d["date"])
    today = dt.date.today()
    days = [d for d in days if dt.date.fromisoformat(d["date"]) <= today][-7:]
    counts = [d["contributionCount"] for d in days]
    peak = max(counts) or 1
    total = sum(counts)

    body = [tag(24, 30, "CONTRIBUTION RHYTHM", t, 13),
            tag(736, 30, "ONE BAR = ONE WEEK · 7/4", t, 11, t["ash"], anchor="end")]
    x0, x1 = 120, 736
    for y in STAFF_LINES:
        body.append(f'<rect x="{x0}" y="{y}" width="{x1 - x0}" height="2" '
                    f'fill="{t["line"]}" opacity="0.9"/>')
    for x in (x0, x1):                 # 首尾小节线
        body.append(f'<rect x="{x - 1}" y="{STAFF_TOP - 2}" width="3" height="52" fill="{t["line"]}"/>')
    body.append(tag(x0 - 8, STAFF_TOP + 5, str(peak), t, 10, t["ash"], anchor="end"))
    body.append(tag(x0 - 8, STAFF_BOT + 5, "0", t, 10, t["ash"], anchor="end"))

    step = (x1 - 40 - 160) / 6 if len(days) > 1 else 0
    for i, d in enumerate(days):
        x = 160 + i * step
        c = d["contributionCount"]
        ratio = c / peak
        idx = round((ratio ** 0.5) * 8)          # 开方压扁长尾，低量也立得起来
        y = STAFF_BOT - idx * STAFF_STEP
        level = 0 if c == 0 else (1 if ratio < 0.45 else 2 if ratio < 0.75 else 3)
        body.append(staff_note(x, y, level, t, i * 0.09))
        is_today = i == len(days) - 1
        body.append(tag(int(x), 158, str(c), t, 11, t["ink"] if c else t["ash"], anchor="middle"))
        body.append(tag(int(x), 180, WEEKDAY_CN[dt.date.fromisoformat(d["date"]).weekday()],
                        t, 12, t["ember"] if is_today else t["ash"], anchor="middle"))

    body.append(tag(24, 200, f"PEAK {peak} / DAY · 1 NOTE = 1 DAY", t, 10, t["ash"]))
    body.append(tag(736, 200, f"Σ {total} COMMITS / 7D · AVG {total / 7:.1f}", t, 10,
                    t["ash"], anchor="end"))
    return shell(760, 212, t, "".join(body), T("提交节律 · 五线谱", "Commit rhythm · staff"),
                 T(f"最近 7 天画成一行五线谱：{max(counts)} 次为最高音，音符越密贡献越多",
                   f"The last 7 days as one line of staff: {max(counts)} commits is the top note; "
                   "the more flags, the more commits"))


def render_contrib3d(data, t):
    """等距投影的 3D 贡献日历：53 周 x 7 天，每格一个立方体，高度按当日贡献数。"""
    weeks = data["contributionsCollection"]["contributionCalendar"]["weeks"]
    days = [(ci, ri, d["contributionCount"])
            for ci, w in enumerate(weeks)
            for ri, d in enumerate(w["contributionDays"])]
    peak = max(c for _, _, c in days) or 1

    # 扁等距网格：周轴近水平（斜率 TH/TW≈18°），53 周才拉得开而不会塌成斜板
    TW, TH, PLATE, MAXH, MINH = 11, 3.5, 6, 30, 8
    BW = TW * 0.72          # 建筑占地比格子小一圈，才露得出街道
    BH = TH * 0.72
    dark = t["bg"] == PALETTE["dark"]["bg"]
    ramp = (["#241110", "#5A1A10", t["deep"], t["ember"], t["flame"]] if dark
            else ["#E7D3C6", "#F0B49A", "#E0704F", t["ember"], t["deep"]])
    top_light = ["#3A1A16", "#7A2416", "#E23B18", "#FF6A4D", "#FFD27A"] if dark else \
                ["#F2E4DA", "#FFD2BC", "#F58E70", "#D8340F", "#B88300"]
    ground = "#120707" if dark else "#DFC7B6"   # 地台边缘
    slot_a = "#2E1A16" if dark else "#F8EFE8"   # 空白日的格位，AB 交替才有地面纹理
    slot_b = "#26130F" if dark else "#F3E5DA"
    skirt_l, skirt_r = ("#120706", "#0A0404") if dark else ("#C6AB9B", "#B29686")
    edge = "#0B0505" if dark else t["line"]     # 塔的描边，稀疏的塔才立得住

    def lvl(c):
        if c < 3:
            return 1
        if c < 6:
            return 2
        if c < 10:
            return 3
        return 4

    def height(c):
        # 幂律压扁长尾：85/天 的尖顶留到 30px，个位数贡献也立得起来
        return MINH + (c / peak) ** 0.62 * (MAXH - MINH)

    body = [tag(24, 28, "CONTRIBUTION CITY", t, 13),
            tag(736, 28, f"PEAK {peak}/DAY", t, 11, t["ash"], anchor="end")]

    W = len(weeks)
    D = max(len(w["contributionDays"]) for w in weeks)
    cells = [{"rx": (ci - ri) * TW, "ry": (ci + ri) * TH, "h": height(cnt) if cnt else 0,
              "ci": ci, "ri": ri, "cnt": cnt, "chk": (ci + ri) % 2} for ci, ri, cnt in days]
    gx0 = min(c["rx"] for c in cells) - TW
    gx1 = max(c["rx"] for c in cells) + TW
    gy0 = min(c["ry"] - c["h"] for c in cells) - TH
    gy1 = max(c["ry"] for c in cells) + TH + PLATE
    ox = 24 + (760 - 48 - (gx1 - gx0)) / 2 - gx0
    oy = 40 + (252 - (gy1 - gy0)) / 2 - gy0     # 标题栏与页脚之间竖直居中

    # 地台：整个 53x7 网格投影后是一个平行四边形，一整块画完，不再叠 365 个薄片
    A = (ox, oy - TH)                                    # 后角
    B = (ox + W * TW, oy + (W - 1) * TH)                  # 右角
    C = (ox + (W - D) * TW, oy + (W + D - 2) * TH + TH)   # 前角
    E = (ox - D * TW, oy + (D - 1) * TH)                  # 左角
    body.append(f'<polygon points="{E[0]},{E[1]} {C[0]},{C[1]} {C[0]},{C[1] + PLATE} {E[0]},{E[1] + PLATE}" '
                f'fill="{skirt_l}"/>')   # 左前侧壁
    body.append(f'<polygon points="{C[0]},{C[1]} {B[0]},{B[1]} {B[0]},{B[1] + PLATE} {C[0]},{C[1] + PLATE}" '
                f'fill="{skirt_r}"/>')   # 右前侧壁
    body.append(f'<polygon points="{A[0]},{A[1]} {B[0]},{B[1]} {C[0]},{C[1]} {E[0]},{E[1]}" fill="{ground}"/>')

    # 空白日：地台上压一个浅菱形，保留日历格子感（不带动画，省体积）
    for c in cells:
        if c["cnt"]:
            continue
        x, y = ox + c["rx"], oy + c["ry"]
        body.append(f'<polygon points="{x},{y - TH} {x + TW},{y} {x},{y + TH} {x - TW},{y}" '
                    f'fill="{slot_a if c["chk"] else slot_b}"/>')

    # 让它动起来：一道极淡的扫描带从后角滑到前角，楼顶小灯错开闪
    # （.cube 的 rise 只在加载时播一次，单靠它看起来就是静止的）
    dx, dy = (W - 5) * TW, (W - 5) * TH
    body.append(
        '<style>'
        '.lip{opacity:0;animation:lip 3.6s steps(1,end) infinite}'
        '@keyframes lip{0%{opacity:0}8%{opacity:1}26%{opacity:.25}40%{opacity:1}'
        '58%{opacity:0}80%{opacity:.9}92%{opacity:0}100%{opacity:0}}'
        '.sweep{animation:sweep 14s linear infinite}'
        f'@keyframes sweep{{0%{{transform:translate(0px,0px);opacity:0}}'
        f'6%{{opacity:1}}90%{{opacity:1}}'
        f'100%{{transform:translate({dx:.1f}px,{dy:.1f}px);opacity:0}}}}'
        '</style>')
    q1 = E
    q2 = (q1[0] + 5 * TW, q1[1] + 5 * TH)
    q3 = (q2[0] - D * TW, q2[1] + D * TH)
    q4 = (q1[0] - D * TW, q1[1] + D * TH)
    body.append(f'<g class="sweep"><polygon points="{q1[0]},{q1[1]} {q2[0]},{q2[1]} '
                f'{q3[0]},{q3[1]} {q4[0]},{q4[1]}" fill="{t["spark"]}" fill-opacity="0.12"/></g>')

    # 有贡献的日子：立塔。远的先画（ci+ri 小 = 屏幕上方 = 靠后），近的后画
    for c in sorted(cells, key=lambda c: c["ry"]):
        if not c["cnt"]:
            continue
        x, y, h = ox + c["rx"], oy + c["ry"], c["h"]
        ty = y - h
        k = lvl(c["cnt"])
        body.append(f'<g class="cube" style="animation-delay:{(c["ci"] * 0.012):.3f}s">')
        st = f' stroke="{edge}" stroke-width="0.8"'
        body.append(f'<polygon points="{x},{ty - BH} {x + BW},{ty} {x},{ty + BH} {x - BW},{ty}" fill="{top_light[k]}"{st}/>')
        body.append(f'<polygon points="{x - BW},{ty} {x},{ty + BH} {x},{y + BH} {x - BW},{y}" fill="{ramp[k]}"{st}/>')
        body.append(f'<polygon points="{x + BW},{ty} {x},{ty + BH} {x},{y + BH} {x + BW},{y}" fill="{ramp[k]}" opacity="0.72"{st}/>')
        # 楼顶一颗小灯，延迟按格位错开，持续闪
        lamp = (c["ci"] * 0.29 + c["ri"] * 0.13) % 3.6
        body.append(f'<rect x="{x - 1.6:.1f}" y="{ty - 1.6:.1f}" width="3.2" height="3.2" '
                    f'fill="{t["spark"]}" class="lip" style="animation-delay:{lamp:.2f}s"/>')
        body.append("</g>")
    body.append(tag(24, 300, f"{len(weeks)} WEEKS · {len(days)} DAYS · {sum(c['cnt'] > 0 for c in cells)} ACTIVE", t, 11, t["ash"]))
    return shell(760, 318, t, "".join(body), T("3D 贡献日历", "3D contribution city"),
                 T("等距投影的每日贡献立方体，高度代表当日提交数",
                   "Isometric cubes for each day, height = that day's commits"))


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
                 T("贡献热力图", "Contribution heatmap"),
                 T("过去一年的每日提交热力图，地牢配色",
                   "Daily commit heatmap for the past year, dungeon palette"))



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
    return shell(760, 118, t, "".join(body), T("五关赛程", "Trial route"),
                 T("同一场景两侧并行：法师用法术、战士用剑盾",
                   "Same scene on both sides: the mage casts, the knight uses sword and shield"))


def party_role(entry, player):
    """角色标签：role 字段只写职业，等级由 GitHub 数据算出，别在美术数据里写死。"""
    lv = player.get("party_levels", {}).get(entry["id"])
    role = entry["role"]
    return f"{role} · LV.{lv:02d}" if isinstance(lv, int) else role


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
    p = load_player()
    body = [
        tag(20, 28, "PARTY", t, 13),
        f'<rect x="24" y="44" width="{box}" height="{box}" fill="{t["surface"]}" '
        f'stroke="{t["line"]}" stroke-width="2"/>',
        draw_sprite(mage, pal, 24 + pad, 52),
        f'<text x="{24 + pad}" y="{name_y}" font-family="{MONO}" font-size="14" '
        f'letter-spacing="1" fill="{t["ink"]}">{mage["name"]}</text>',
        tag(24 + pad, role_y, party_role(mage, p), t, 11, t["ash"]),
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
        f'font-size="11" letter-spacing="2" fill="{t["ash"]}">{party_role(knight, p)}</text>',
    ]
    # 中间空白处：两人的基础属性，右侧战士镜像排布
    combat = p.get("combat", {})
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
    return shell(760, 52 + size + 60, t, "".join(body), T("队伍", "Party"),
                 T(f'{mage["name"]} 与 {knight["name"]} 的像素立绘',
                   f'{mage["name"]} and {knight["name"]} pixel portraits'))


def player_path():
    return os.path.join(os.path.dirname(__file__), "..", "..", "design", "player.json")


def load_player():
    with open(player_path(), encoding="utf-8") as fh:
        return json.load(fh)


# ---- 等级：从 GitHub 数据换算 XP，写回 design/player.json --------------------
# 规则放在 design/leveling.json，改权重/曲线不用碰代码。

def load_leveling():
    path = os.path.join(os.path.dirname(__file__), "..", "..", "design", "leveling.json")
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def xp_of(data, weights):
    """把近一年的贡献 + 仓库体量折成 XP，并给出可核对的明细。"""
    repos = data["repositories"]
    cc = data["contributionsCollection"]
    counts = {
        "commits": cc["totalCommitContributions"],
        "pull_requests": cc["totalPullRequestContributions"],
        "issues": cc["totalIssueContributions"],
        "stars": sum(r["stargazerCount"] for r in repos["nodes"]),
        "repos": repos["totalCount"],
        "followers": data["followers"]["totalCount"],
    }
    detail = {k: {"count": v, "weight": weights.get(k, 0), "xp": v * weights.get(k, 0)}
              for k, v in counts.items()}
    return sum(d["xp"] for d in detail.values()), detail


def xp_needed(level, curve):
    """从 level 升到 level+1 需要的 XP：base * level ** exponent。"""
    return max(1, round(curve["base"] * level ** curve["exponent"]))


def cum_xp(level, curve):
    """到达 level 所需的累计 XP。"""
    return sum(xp_needed(n, curve) for n in range(1, level))


def level_from_xp(total, curve):
    """纯函数：XP -> (等级, 当前级内进度, 下一级门槛)。"""
    top = int(curve.get("max_level", 99))
    level = 1
    while level < top and cum_xp(level + 1, curve) <= total:
        level += 1
    nxt = xp_needed(level, curve)
    cur = total - cum_xp(level, curve)
    if level >= top:
        cur = nxt
    return level, max(0, min(cur, nxt)), nxt


def combat_stats(counts, leveling):
    """HP/MP/ATK 这类属性也接数据：加权指标开平方映射到 0-10。没有配置就返回 None，保留手写值。"""
    cfg = leveling.get("combat")
    if not cfg:
        return None
    floor = int(cfg.get("floor", 1))
    out = {}
    for who, attrs in cfg.items():
        if who == "floor":
            continue
        rows = []
        for label, spec in attrs.items():
            weighted = sum(counts.get(k, 0) * w for k, w in spec.get("from", {}).items())
            ref = max(1.0, float(spec.get("ref", 1)))
            val = int(round(10 * (weighted / ref) ** 0.5))
            rows.append([label, max(floor, min(10, val))])
        out[who] = rows
    return out


def party_levels(level, player, leveling):
    """队伍成员等级：主角等级 + 每个角色的 offset，同样只升不降。"""
    cap = int(leveling["curve"].get("max_level", 99))
    prev = player.get("party_levels", {})
    floor = leveling.get("never_demote", True)
    out = {}
    for who, cfg in leveling.get("party", {}).items():
        lvl = min(cap, level + int(cfg.get("offset", 0)))
        if floor and isinstance(prev.get(who), int):
            lvl = max(lvl, prev[who])
        out[who] = max(1, lvl)
    return out


def sync_player(data):
    """把算出来的 level/exp 落在 design/player.json 上；只改这三块，其它手写内容原样保留。"""
    lv = load_leveling()
    total, detail = xp_of(data, lv["weights"])
    level, cur, nxt = level_from_xp(total, lv["curve"])

    p = load_player()
    prev = p.get("level", 1)
    if lv.get("never_demote", True) and prev > level:
        # 一年窗口里的提交会过期：只升不降，进度按当前等级重算，不为负
        level = prev
        nxt = xp_needed(level, lv["curve"])
        cur = max(0, min(total - cum_xp(level, lv["curve"]), nxt))

    party = party_levels(level, p, lv)
    combat = combat_stats({k: d["count"] for k, d in detail.items()}, lv)
    out = {}
    for k, v in p.items():
        if k in ("xp", "party_levels"):
            continue
        if k == "combat" and combat:
            out["combat"] = combat
            continue
        if k == "level":
            out["level"] = level
            continue
        if k == "exp":
            out["exp"] = {"current": cur, "next": nxt}
            out["xp"] = {"total": total, "metrics": detail}
            out["party_levels"] = party
            continue
        out[k] = v
    if "xp" not in out:  # 第一次同步，player.json 还没有 xp 明细
        out["xp"] = {"total": total, "metrics": detail}
    if "party_levels" not in out:
        out["party_levels"] = party

    with open(player_path(), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    return prev, level, cur, nxt, total


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
    return shell(760, 176, t, "".join(body), T("角色存档", "Player"),
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
        body.append(tag(48, y, fit(q["name"], 384, 13), t, 13,
                        t["ink"] if q["status"] != "locked" else t["ash"]))
        # 条的右边界 = 440 + 10*12 + 9*4 = 596，状态文字从 620 起
        tone = t["lime"] if q["status"] == "cleared" else (t["gold"] if q["status"] == "active" else None)
        body.append(gauge(440, y - 11, q["progress"], t, cells=10, cw=12, ch=9, gap=4, color=tone))
        body.append(tag(620, y, q["status"].upper(), t, 11,
                        t["dim"] if q["status"] != "locked" else t["ash"]))
    cleared = sum(1 for q in quests if q["status"] == "cleared")
    body.append(tag(20, 62 + len(quests) * 36 + 6,
                    f"CLEARED {cleared}/{len(quests)}", t, 12, t["ash"]))
    height = 62 + len(quests) * 36 + 20
    return shell(760, height, t, "".join(body), T("任务日志", "Quest log"),
                 T(f'已通关 {cleared}/{len(quests)}', f'{cleared}/{len(quests)} cleared'))


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
        body.append(tag(x + 20, 136, fit(it["name"], 132, 12), t, 12, t["ink"]))
        body.append(tag(x + 20, 158, fit(it["desc"], 132, 11), t, 11, t["ash"]))
    return shell(760, 196, t, "".join(body), T("物品栏", "Inventory"),
                 "、".join(it["name"] for it in items))


# 底部状态栏：等级 / HP 全部来自 player.json，跟着 GitHub 数据一起走
HP_MAX_DEFAULT = 10


def hp_of(p):
    for entry in p.get("combat", {}).get("mage", []):
        if entry[0] == "HP":
            return int(entry[1]), int(p.get("hp_max", HP_MAX_DEFAULT))
    return 0, int(p.get("hp_max", HP_MAX_DEFAULT))


def render_footer(_data, t):
    p = load_player()
    hp, hp_max = hp_of(p)
    body = [
        f'<rect x="48" y="38" width="6" height="6" fill="{t["ember"]}" class="cur"/>',
        tag(66, 50, f'LV.{p["level"]:02d} · BUILDER', t, 20, t["ink"]),
        tag(330, 50, "HP", t, 20, t["ash"]),
        f'<text x="980" y="50" font-family="{MONO}" font-size="20" letter-spacing="3" '
        f'fill="{t["ash"]}">{hp} / {hp_max}</text>',
    ]
    for i in range(hp_max):
        on = i < hp
        cls = ' class="bar"' if on else ''
        body.append(f'<rect x="{760 + i * 20}" y="44" width="14" height="14" '
                    f'fill="{t["ember"] if on else t["line"]}"{cls}/>')
    for i, tone in enumerate(("ember", "deep", "flame", "deep")):
        body.append(f'<rect x="{i * 24}" y="78" width="16" height="8" '
                    f'fill="{t[tone]}" class="cube"/>')
    return shell(1200, 96, t, "".join(body), T("状态栏", "Status bar"),
                 T(f'{p["name"]} · LV.{p["level"]} · HP {hp}/{hp_max} · 持续构建中',
                   f'{p["name"]} · LV.{p["level"]} · HP {hp}/{hp_max} · still building'))


# banner 是手绘静态稿（火焰三帧、点阵底纹），没有生成器，
# 只能就地把里面的 LV.xx 盖成当前等级，别的像素一律不动。
LEGACY_LEVEL_CARDS = ("banner-dark.svg", "banner-light.svg")


def stamp_legacy_levels(level):
    root = os.path.join(os.path.dirname(__file__), "..", "..", "profile")
    changed = []
    for name in LEGACY_LEVEL_CARDS:
        path = os.path.join(root, name)
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as fh:
            raw = fh.read()
        new = re.sub(r"LV\.\d{2}", f"LV.{level:02d}", raw)
        if new != raw:
            with open(path, "w", encoding="utf-8", newline="\n") as fh:
                fh.write(new)
            changed.append(name)
    return changed


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
    return shell(760, 76, t, "".join(body), T("状态栏", "Status bar"),
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
    return shell(760, height, t, "".join(body), T("战报日志", "Battle log"),
                 T(f"最近 {len(rows)} 期手账", f"Latest {len(rows)} issues"))


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
    return shell(760, height, t, "".join(body), T("通讯面板", "Comms"),
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
    return shell(760, height, t, "".join(body), T("技术栈", "Stack"),
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
    return shell(400, 184, t, "".join(body),
                 T(f"{repo['name']} 项目卡片", f"{repo['name']} project card"), desc[:120])


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
    if os.environ.get("SYNC_PLAYER", "1") != "0":
        prev, lv, cur, nxt, total = sync_player(data)
        print(f"player level {prev} -> {lv}   exp {cur}/{nxt}   xp {total}")
        stamped = stamp_legacy_levels(lv)
        if stamped:
            print("stamped level into:", ", ".join(stamped))
    out = os.environ.get("OUT_DIR", ".build")
    os.makedirs(out, exist_ok=True)
    writers = {"stats": render_stats, "top-langs": render_langs,
               "streak": render_streak, "contrib": render_contrib,
               "stack": render_stack, "player": render_player,
               "quests": render_quests, "inventory": render_inventory,
               "gear": render_gear, "log": render_log, "comms": render_contact,
               "party": render_party, "trials": render_trials,
               "contrib3d": render_contrib3d, "rhythm": render_rhythm,
               "footer": render_footer}
    pins = []
    for repo_name in PIN_REPOS:
        repo = gql(token, PIN_QUERY, {"owner": login, "name": repo_name}).get("repository")
        if repo:
            pins.append(repo)
        else:
            print("skip pin (not found):", repo_name)

    for scheme, t in PALETTE.items():
        for name, fn in writers.items():
            path = os.path.join(out, f"{name}{SUFFIX}-{scheme}.svg")
            with open(path, "w", encoding="utf-8", newline="\n") as fh:
                fh.write(localize(fn(data, t)))
            print("wrote", path)
        for repo in pins:
            path = os.path.join(out, f"pin-{repo['name'].lower()}{SUFFIX}-{scheme}.svg")
            with open(path, "w", encoding="utf-8", newline="\n") as fh:
                fh.write(localize(render_pin(repo, t)))
            print("wrote", path)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""README 闸门：卡片由 validate.py 守，README 自己也得有人守。

validate.py 只管 .build/*.svg；这里管"线上真正被读到的那层"：
占位符、相对路径（含大小写）、锚点、<picture> 明暗成对、标签闭合、中英对齐、卡片体积。

用法: python .github/scripts/validate_readme.py [--strict]
  --strict   把 WARN 也当失败（本地/发布前用）
"""
import os
import re
import sys
import glob

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DOCS = ["README.md", "README.zh-CN.md"]
SITE_DATA = "site/src/data/site.ts"
CARD_MAX_BYTES = 220_000          # 与 validate.py 的 MAX_BYTES 对齐
PROFILE_BUDGET = 4_500_000        # profile/ 总量棘轮：只许往下调，不许上调

# 已登记的待修占位符。修好后从这里删掉——脚本对清单外的任何占位符都报错，
# 这样"复制模板忘改"这类事故（YOUR-USERNAME / YOUR_EMAIL）不会再上线。
KNOWN_PLACEHOLDERS = {"YOUR_EMAIL"}

errors, warnings = [], []

# Windows 控制台默认 GBK，会让中文报错变成乱码；CI 是 UTF-8，两边统一
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


SKIP_PREFIX = ("http://", "https://", "mailto:", "#", "data:", "tel:")
# README 里的卡片走 raw.githubusercontent 绝对地址（Camo 缓存更稳），
# 但它指向的仍是本仓库的文件，所以照样要能换算回相对路径来校验。
RAW_RE = re.compile(
    r"^https?://raw\.githubusercontent\.com/[^/]+/[^/]+/[^/]+/(.+)$")


def refs(text):
    """抽出所有会被浏览器真正解析的本地引用（href / src / srcset / markdown 链接）。"""
    found = []
    for m in re.finditer(r'(?:src|href)="([^"]+)"', text):
        found.append(m.group(1))
    for m in re.finditer(r'srcset="([^"]+)"', text):
        for part in m.group(1).split(","):
            url = part.strip().split(" ")[0]
            if url:
                found.append(url)
    for m in re.finditer(r'\]\(([^)\s]+)', text):
        found.append(m.group(1))
    return found


def local_path(ref):
    """归一化成本仓库的相对路径；真正的外部地址/锚点返回 None。"""
    raw = RAW_RE.match(ref)
    if raw:
        return raw.group(1).split("#", 1)[0].split("?", 1)[0]
    if ref.startswith(SKIP_PREFIX):
        return None
    path = ref.split("#", 1)[0].split("?", 1)[0]
    if not path or path.startswith("/"):
        return None
    return path


def exists_exact(rel):
    """大小写敏感的存在性检查（Windows/macOS 的默认文件系统帮不了你）。"""
    cur = ROOT
    for seg in rel.replace("\\", "/").split("/"):
        if seg in ("", "."):
            continue
        try:
            names = os.listdir(cur)
        except OSError:
            return False
        if seg not in names:
            return False
        cur = os.path.join(cur, seg)
    return True


def stem(card, keep_lang=False):
    """"stats-en-dark.svg" -> "stats"（keep_lang=True 时保留 -en）。"""
    base = os.path.basename(card)[:-4]
    base = re.sub(r"-(dark|light)$", "", base)
    return base if keep_lang else re.sub(r"-en$", "", base)


def check_doc(name):
    path = os.path.join(ROOT, name)
    text = open(path, encoding="utf-8").read()

    # 1) 占位符
    for holder in set(re.findall(r"YOUR[_-][A-Z_]+", text)):
        if holder not in KNOWN_PLACEHOLDERS:
            err(f"{name}: 未登记的占位符 {holder!r}")
    for holder in sorted(KNOWN_PLACEHOLDERS):
        if holder in text:
            warn(f"{name}: 待修占位符 {holder!r}（修好后请删 KNOWN_PLACEHOLDERS 里的这一项）")

    # 2) 相对路径存在性 + 大小写
    for ref in refs(text):
        rel = local_path(ref)
        if rel is None:
            continue
        if not exists_exact(rel):
            err(f"{name}: 引用不存在或大小写不符 -> {ref}")

    # 3) 锚点：GitHub 会把 <a id="x"> 重写成 user-content-x，两种都认
    ids = set(re.findall(r'id="([^"]+)"', text))
    for m in re.finditer(r'href="#([^"]+)"|\]\(#([^)]+)\)', text):
        frag = m.group(1) or m.group(2)
        norm = frag[len("user-content-"):] if frag.startswith("user-content-") else frag
        if norm not in ids:
            err(f"{name}: 锚点 #{frag} 没有对应的 id")
    dups = sorted({i for i in ids if len(re.findall(r'id="%s"' % re.escape(i), text)) > 1})
    for d in dups:
        warn(f"{name}: 重复的 id={d}")

    # 4) <picture> 必须成对降级：静态卡片 -> 明/暗；动画 -> webp/gif
    for i, block in enumerate(re.findall(r"<picture>(.*?)</picture>", text, re.S), 1):
        has_svg = bool(re.search(r"\.svg", block))
        if has_svg:
            if "prefers-color-scheme: dark" not in block:
                err(f"{name}: 第 {i} 个 <picture> 缺暗色 <source>")
            if not re.search(r"-dark\.svg", block):
                err(f"{name}: 第 {i} 个 <picture> 没引用 -dark.svg")
            if not re.search(r"-light\.svg", block):
                err(f"{name}: 第 {i} 个 <picture> 没引用 -light.svg")
        else:
            if 'type="image/webp"' not in block:
                err(f"{name}: 第 {i} 个 <picture> 缺 image/webp <source>")
            if not re.search(r"<img[^>]+\.gif", block):
                err(f"{name}: 第 {i} 个 <picture> 缺 .gif 兜底 <img>")

    # 5) 标签闭合
    for tag in ("a", "picture", "details", "table", "div"):
        opens = len(re.findall(r"<%s[\s>]" % tag, text))
        closes = len(re.findall(r"</%s\s*>" % tag, text))
        if opens != closes:
            err(f"{name}: <{tag}> 开合不匹配 {opens} 开 / {closes} 闭")

    # 6) GitHub 会 sanitize 行内 <svg>，白写
    if re.search(r"<svg[\s>]", text):
        err(f"{name}: 含行内 <svg>（GitHub 会 sanitize，请改成 <img src=\"x.svg\">）")

    # 7) 卡片体积
    for ref in refs(text):
        rel = local_path(ref)
        if rel and rel.startswith("profile/") and rel.endswith(".svg") and exists_exact(rel):
            size = os.path.getsize(os.path.join(ROOT, rel))
            if size > CARD_MAX_BYTES:
                err(f"{name}: 卡片超预算 {size} B > {CARD_MAX_BYTES} B -> {rel}")
    return text


def main():
    strict = "--strict" in sys.argv
    texts = {name: check_doc(name) for name in DOCS}

    # 8) 中英对齐：先确认两边引用的是同一批卡片，再确认各自用的是自己语言的版本。
    #    英文 README 该用 -en-，中文该用无后缀；只有存在 -en 变体时才强制。
    def cards(name):
        return {local_path(r) for r in refs(texts[name])
                if (local_path(r) or "").endswith(".svg")}

    zh_cards, en_cards = cards("README.md"), cards("README.zh-CN.md")
    zh_stems = {stem(c) for c in zh_cards}
    en_stems = {stem(c) for c in en_cards}
    if zh_stems != en_stems:
        err(f"中英卡片不对齐：只在 README.md -> {sorted(zh_stems - en_stems)}，"
            f"只在 README.zh-CN.md -> {sorted(en_stems - zh_stems)}")
    # 只有确实存在 -en 变体的卡片才强制语言；像 banner 这种共用的就两边都允许
    en_family = {stem(os.path.basename(p))
                 for p in glob.glob(os.path.join(ROOT, "profile", "*-en-*.svg"))}
    for name, want_en in (("README.md", True), ("README.zh-CN.md", False)):
        for c in sorted(cards(name)):
            base = os.path.basename(c)
            if stem(base) not in en_family:
                continue
            if ("-en-" in base) != want_en:
                lang = "英文 README 该用 -en 版本" if want_en else "中文 README 该用无 -en 的版本"
                err(f"{name}: {lang} -> {c}")
    a = set(re.findall(r'id="([^"]+)"', texts["README.md"]))
    b = set(re.findall(r'id="([^"]+)"', texts["README.zh-CN.md"]))
    if a != b:
        warn(f"中英 id 不一致：{sorted(a ^ b)}")

    # 9) 站点数据里的占位符
    site = os.path.join(ROOT, SITE_DATA)
    if os.path.exists(site):
        for holder in set(re.findall(r"YOUR[_-][A-Z_]+", open(site, encoding="utf-8").read())):
            if holder not in KNOWN_PLACEHOLDERS:
                err(f"{SITE_DATA}: 未登记的占位符 {holder!r}")

    # 10) profile/ 里的每个文件都得有人引用（构建中间产物不许混进发布目录）
    referenced = set()
    for name in DOCS:
        for ref in refs(texts[name]):
            rel = local_path(ref)
            if rel:
                referenced.add(rel)
    for path in sorted(glob.glob(os.path.join(ROOT, "profile", "*"))):
        rel = "profile/" + os.path.basename(path)
        if rel not in referenced:
            err(f"profile/ 有文件没人引用（死重量，删掉或移出发布目录）-> {rel}")

    # 11) profile/ 总量
    total = sum(os.path.getsize(p) for p in glob.glob(os.path.join(ROOT, "profile", "*")))
    if total > PROFILE_BUDGET:
        err(f"profile/ 总量超预算 {total} B > {PROFILE_BUDGET} B")
    else:
        print(f"profile/ {total} B / {PROFILE_BUDGET} B")

    for w in warnings:
        print("WARN:", w)
    for e in errors:
        print("REJECT:", e)
    if errors or (strict and warnings):
        sys.exit(1)
    print(f"PASS {len(DOCS)} docs, {len(warnings)} warn")


if __name__ == "__main__":
    main()

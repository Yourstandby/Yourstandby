# site · 火红像素个人站

```bash
cd site
npm install
npm run dev      # http://localhost:4321
npm run build    # 产物在 dist/
```

> 仓库是 `Yourstandby/Yourstandby`（非 `*.github.io`），所以 Pages 发布在子路径
> `https://yourstandby.github.io/Yourstandby/`。`astro.config.mjs` 的 `base` 必须与 `src/data/site.ts` 的 `base` 一致。

## 结构

| 路径 | 作用 |
|---|---|
| `src/styles/tokens.css` | 站点级 token + @import 自动生成的色板 |
| `scripts/sync-tokens.mjs` | dev/build 前把 `../design/*.json` 与 `tokens.css` 复制进来（单一真源） |
| `src/styles/pixel.css` | @font-face、布局、面板、仪表、dither |
| `src/components/*.astro` | Player / QuestLog / Inventory / LogPanel / CommsPanel / ContribPanel / Gauge |
| `src/content/notes/*.md` | 技术手账（title / date / issue） |
| `src/data/site.ts` | 面板之外的站点配置：tagline、项目列表、导航 |
| `public/motion.js` | Bayer 抖动揭示，静态托管、不打包 |

## 字体

**标题**：Press Start 2P（Google Fonts CDN）。
**正文与中文**：Fusion Pixel 12px，自托管子集，498 字 / 16KB。

来源：[TakWolf/fusion-pixel-font](https://github.com/TakWolf/fusion-pixel-font) release `2026.11.10`，
文件 `fusion-pixel-font-12px-proportional-otf.woff2` 里的 `fusion-pixel-12px-proportional-zh_hans.otf.woff2`（SIL OFL）。

重新生成子集的完整流程（改了文案、出现缺字时跑）：

```bash
# 1) 收集站点实际用到的字符（ASCII + 所有非 ASCII）
python - <<'EOF'
import glob
chars = set()
for p in ["site/src/**/*.astro", "site/src/**/*.ts", "site/src/**/*.json",
          "site/src/content/**/*.md", "design/*.json", "weekly/**/*.md", "README.md"]:
    for f in glob.glob(p, recursive=True):
        chars.update(c for c in open(f, encoding="utf-8").read()
                     if ord(c) > 0x7F and not c.isspace())
chars.update(chr(c) for c in range(0x20, 0x7F))
open(".tmp/chars.txt", "w", encoding="utf-8").write("".join(sorted(chars)))
EOF

# 2) 子集化（需要 fonttools + brotli）
python -m fontTools.subset fusion-pixel-12px-proportional-zh_hans.otf.woff2 \
  --text-file=.tmp/chars.txt --flavor=woff2 --no-hinting --desubroutinize \
  --layout-features='*' --output-file=site/public/fonts/fusion-pixel-12px-zh.woff2
```

12px 字体在 12 / 24 / 36px 下最锐利；16px 会有 1.33 倍缩放，像素边缘略软但有 `font-smoothing: none` 兜底。

## 动效清单

| 位置 | 效果 | 实现 |
|---|---|---|
| 分区入场 | 4×4 Bayer 抖动揭示 8 级 | `public/motion.js` + IntersectionObserver |
| 页面切换 | ClientRouter 转场后重播揭示 | `astro:after-swap` |
| 火焰 | 三帧逐格切换 | `Ember.astro` 内 `steps(1,end)` |
| 仪表 | 语义分色：青=数据 绿=通关 金=进度 | `Gauge.astro` 的 tone |
| 按钮 / 卡片 | hover 抬 2px，active 塌陷 | `tokens.css` / `pixel.css` |
| 光标 / 状态灯 | 严格两帧闪烁 | `px-blink` |

全部动画在 `prefers-reduced-motion: reduce` 下关闭。

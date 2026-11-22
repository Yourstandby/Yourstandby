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

12px 字体只在 **12 的整数倍**下最锐利：12 / 24 / 36 / 48 / 60 / 72。任何 10、11、13、14、16px 都是
1.1~1.33 倍重采样，边缘必然发虚（`font-smoothing: none` 只在 macOS 生效，Windows 上是灰阶抗锯齿）。
所以 `--fs-*` 阶梯只取 12 的倍数，组件里也不许写裸字号——需要新档位就回到 `tokens.css` 加。

纯拉丁 display 标题用 Press Start 2P（8px 网格），只取 8 的倍数，例如 `.brand` 固定 16px。

## 尺寸刻度（2x）

真源是 `design/tokens.css`，站点通过 `scripts/sync-tokens.mjs` 复制进 `src/styles/_tokens.generated.css`。

| token | 值 | 说明 |
|---|---|---|
| `--px-grid` | 16px | 8px 子网格的 2x，所有间距取它的倍数 |
| `--px-tile` | 32px | 点阵步长，`--maxw: 1280px` = 40 格 |
| `--px-border` | 4px | 结构框（面板 / 卡片 / 舞台） |
| `--px-hair` | 2px | 小构件内描边（徽章 / 角标 / 表格线 / 下划线） |
| `--px-shadow` | 8px 8px | 静态投影；hover 用 `--px-shadow-hover`（12px） |

精灵一律整数倍放大：队伍 `unit 8`（32px 美术 → 256px）、头像 `unit 4`（→128px）、
库存图标 16px 美术 → 64px、仪表格子 24×16。
**改美术时保持整数倍**，否则 `shape-rendering="crispEdges"` 救不回来。

### 还没做的（受资源/决策限制）

| 项 | 卡在哪 |
|---|---|
| 中文字号再上一个原生尺寸（16px） | 仓库只有子集化后的 12px woff2，没有 Fusion Pixel 的 TTF/OTF 源，也无法联网下载 |
| 精灵真 64×64 美术 | `design/sprites.json` 是 32×32 的 rect 数据（mage 23 块 / knight 20 块），做细节等于重画；现在只是 8x 整数放大，信息量没变 |
| 1280×720 固定画布 | 需要把 12 栏响应式 grid 改成绝对定位 + `transform: scale()`，10 个组件重排，移动端可读性会退化，未获确认 |
| 闯关 canvas 内部分辨率 640×180 | 提到 1280×360 只是超采样，画质不变（CSS 侧已是 `image-rendering: pixelated` 整数放大），不解决"细节不够" |
| README SVG 卡片 | `gen_cards.py` 走 GitHub API，离线跑不了；不过它不读 tokens.css，1x/2x 刻度不影响它 |

## 动效清单

| 位置 | 效果 | 实现 |
|---|---|---|
| 分区入场 | 4×4 Bayer 抖动揭示 8 级 | `public/motion.js` + IntersectionObserver |
| 页面切换 | ClientRouter 转场后重播揭示 | `astro:after-swap` |
| 火焰 | 三帧逐格切换 | `Ember.astro` 内 `steps(1,end)` |
| 仪表 | 语义分色：青=数据 绿=通关 金=进度 | `Gauge.astro` 的 tone |
| 按钮 / 卡片 | hover 抬 4px + 投影 8→12px，active 塌陷 | `tokens.css` / `pixel.css` |
| 光标 / 状态灯 | 严格两帧闪烁 | `px-blink` |

全部动画在 `prefers-reduced-motion: reduce` 下关闭。

## 十关闯关动画（THE TEN TRIALS）

`public/quest.js` 是引擎，`src/components/QuestStage.astro` 是外壳。

- 内部分辨率固定 **320×180**，CSS 放大 + `image-rendering: pixelated`，所以任何屏幕下都是清晰的硬边像素。
- 用 Canvas 逐帧（rAF）而不是 SVG/DOM：像素角色做位移时，DOM 会因布局和亚像素取整抖动，Canvas 只画矩形，天然对齐。

### 关卡表

`quest.js` 顶部的 `LEVELS` 数组就是全部编排，改这里即可：

```js
{ who: 'mage', env: 'snow', act: 'icewall', place: '雪原', tech: '法杖点地…' }
```

- `who`：`mage` / `knight`，决定用哪个精灵、从哪一侧进场
- `env`：`snow` `forest` `desert` `quarry` `water`，对应 `terrain()` 与 `hazard()` 里的分支
- `act`：`icewall` `fire` `orb` `petrify` `bubble` `shield` `slash` `swirl` `charge` `blade`，对应 `effect()` 里的分支

双方顺序互为倒序：法师 雪原→水底，战士 水底→雪原，交替播放，第十关后在中央会合。

### 时间线

每关 5.5s，`SEG` 控制各阶段时长：

| 阶段 | 内容 |
|---|---|
| `enter` | 上下黑条收拢（像素擦除） |
| `walk` | 角色从场外走到站位 |
| `hazard` | 危险物登场（雪崩/毒蛇/沙暴/石头人/暗流） |
| `act` | 施法或挥剑，特效随进度生长 |
| `clear` | 危险消散 |
| `exit` | 黑条合拢，切下一关 |

### 调试

在网址后加参数可定格任意一帧，用来截图核对：

```
/?lv=3&t=2.2      // 第 4 关的第 2.2 秒
```

### 无障碍与性能

- `prefers-reduced-motion: reduce` → 不跑动画，只画一张静态帧
- 画布离开视口时停止 rAF
- 没有第三方依赖，`quest.js` 约 20KB 未压缩

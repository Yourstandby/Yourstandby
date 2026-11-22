# site · 火红像素个人站

```bash
cd site
npm install
npm run dev      # http://localhost:4321
npm run build    # 产物在 dist/
```

## 结构

| 路径 | 作用 |
|---|---|
| `src/styles/tokens.css` | 站点级 token，并 @import 自动生成的色板 |
| `scripts/sync-tokens.mjs` | dev/build 前把 `../design/tokens.css` 复制进来（单一真源） |
| `src/styles/pixel.css` | 布局与组件（卡片、导航、仪表条、dither） |
| `public/motion.js` | Bayer 抖动揭示，静态托管、不打包 |
| `src/content/notes/*.md` | 技术手账，frontmatter: title / date / issue |
| `src/data/site.ts` | 个人信息、技术栈、项目列表（改这里就够） |

## 字体

- 拉丁：Press Start 2P（标题）+ Silkscreen（正文），走 Google Fonts CDN。
- 中文：默认回落系统黑体。想要真正的像素中文，自托管 **Fusion Pixel 12px**：

```css
@font-face {
  font-family: 'Fusion Pixel';
  src: url('/fonts/fusion-pixel-12px.woff2') format('woff2');
  font-display: swap;
  /* 只加载用到的字，避免拉一个 10MB 的全字库 */
  unicode-range: U+4E00-9FFF;
}
:root { --font-body: Silkscreen, 'Fusion Pixel', ui-monospace, system-ui, sans-serif; }
```

字体文件放 `public/fonts/`，用 `pyftsubset`（fonttools）按实际用字裁剪到几十 KB。

## 动效清单

| 位置 | 效果 | 实现 |
|---|---|---|
| 分区入场 | 4×4 Bayer 抖动揭示 8 级 | `public/motion.js` + IntersectionObserver |
| 页面切换 | ClientRouter 转场后重播揭示 | `astro:after-swap` |
| 火焰 | 三帧逐格切换 | `Ember.astro` 内 `steps(1,end)` |
| 按钮 | hover 抬 2px、active 塌陷 | `tokens.css` `.px-btn` |
| 光标 | 严格两帧闪烁 | `.px-caret` |

所有动画在 `prefers-reduced-motion: reduce` 下关闭。

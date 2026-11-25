// 64×64 像素角色：用图元画网格 → 自动合并成 rect 数据 + 自动 N px 描边。
// 运行：node design/build-sprites.mjs（覆写 design/sprites.json 并打印 ASCII 预览）
// 参考图：马尔济斯战士（纯白绒毛 + 藏青长袍 + 背后斜剑）/ 金毛法师（垂耳 + 青绿尖帽 + 发光法杖）
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const N = 64;
const here = dirname(fileURLToPath(import.meta.url));

class Grid {
  constructor() { this.g = Array.from({ length: N }, () => Array(N).fill(null)); }
  set(x, y, k) { x |= 0; y |= 0; if (x >= 0 && x < N && y >= 0 && y < N) this.g[y][x] = k; }
  rect(x, y, w, h, k) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, k); }
  col(x, y0, y1, k) { for (let y = y0; y <= y1; y++) this.set(x, y, k); }
  row(y, x0, x1, k) { for (let x = x0; x <= x1; x++) this.set(x, y, k); }
  ellipse(cx, cy, rx, ry, k) {
    for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
      const dx = (x - cx) / (rx + 0.5), dy = (y - cy) / (ry + 0.5);
      if (dx * dx + dy * dy <= 1) this.set(x, y, k);
    }
  }
  /** 斜线（方形笔头） */
  line(x0, y0, x1, y1, w, k) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.rect(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), w, w, k);
    }
  }
  /** 沿圆周撒小毛团，做出蓬松的剪影边缘（只撒上半圈） */
  fluff(cx, cy, rx, ry, n, k, from = Math.PI * 1.05, to = Math.PI * 1.95) {
    for (let i = 0; i < n; i++) {
      const a = from + (to - from) * (i / (n - 1));
      this.rect(Math.round(cx + Math.cos(a) * rx) - 1, Math.round(cy + Math.sin(a) * ry) - 1, 2, 2, k);
    }
  }
}

/** 描边：非空格向外膨胀 n 格涂 K（尺寸通用） */
function outlineN(g, n = 2) {
  const S = g.length;
  const out = Array.from({ length: S }, () => Array(S).fill(null));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (g[y][x]) continue;
    let near = false;
    for (let dy = -n; dy <= n && !near; dy++) for (let dx = -n; dx <= n; dx++) {
      if (dx * dx + dy * dy > n * n + n) continue;
      const ny = y + dy, nx = x + dx;
      if (ny >= 0 && ny < S && nx >= 0 && nx < S && g[ny][nx]) { near = true; break; }
    }
    if (near) out[y][x] = 'K';
  }
  return out;
}

/** 网格 → 矩形（先按行合并同色连续段，再纵向合并相同跨度） */
function toRects(grid) {
  const S = grid.length;
  const spans = [];
  for (let y = 0; y < S; y++) {
    let x = 0;
    while (x < S) {
      const k = grid[y][x];
      if (!k) { x++; continue; }
      let w = 1;
      while (x + w < S && grid[y][x + w] === k) w++;
      spans.push({ x, y, w, k });
      x += w;
    }
  }
  const byRow = new Map();
  for (const s of spans) {
    if (!byRow.has(s.y)) byRow.set(s.y, new Map());
    byRow.get(s.y).set(s.x + ':' + s.w + ':' + s.k, s);
  }
  const merged = [];
  const done = new Set();
  for (const s of spans) {
    if (done.has(s)) continue;
    let h = 1;
    for (;;) {
      const next = byRow.get(s.y + h)?.get(s.x + ':' + s.w + ':' + s.k);
      if (!next || done.has(next)) break;
      done.add(next); h++;
    }
    merged.push([s.x, s.y, s.w, h, s.k, 0]);
  }
  return merged;
}

function raster(rects, size = N) {
  const g = Array.from({ length: size }, () => Array(size).fill(null));
  for (const r of rects) for (let y = r[1]; y < r[1] + r[3]; y++) for (let x = r[0]; x < r[0] + r[2]; x++) g[y][x] = r[4];
  return g;
}

/** 狗嘴：小鼻子 + 两拱 w 形嘴 */
function muzzle(g, cx, cy, nose, mouth) {
  g.rect(cx - 1, cy, 3, 2, nose);
  g.rect(cx - 5, mouth, 2, 1, 'K'); g.rect(cx - 3, mouth + 1, 2, 1, 'K');
  g.rect(cx - 1, mouth, 2, 1, 'K'); g.rect(cx + 1, mouth + 1, 2, 1, 'K');
  g.rect(cx + 3, mouth, 2, 1, 'K');
}

// ---------------- 小白战士：马尔济斯 ----------------
function knight() {
  const g = new Grid();
  // 背后斜挎长剑（先画，被身体压住）
  g.rect(11, 12, 5, 4, 't');            // 柄头
  g.line(10, 16, 8, 25, 3, 'W');        // 剑柄
  g.line(3, 26, 14, 28, 2, 't');        // 护手
  g.line(8, 28, 5, 42, 3, 'T');         // 剑身
  g.rect(3, 40, 6, 5, 'T');             // 剑尖
  // 蓬松的大头（马尔济斯是绒毛，剪影要毛茸茸）
  g.fluff(32, 20, 16, 13, 5, 'B');
  g.ellipse(32, 20, 16, 13, 'B');
  // 耳簇（圆润，向上外翻）
  g.ellipse(18, 12, 7, 8, 'B'); g.ellipse(46, 12, 7, 8, 'B');
  g.ellipse(18, 13, 3, 3, 'b'); g.ellipse(46, 13, 3, 3, 'b');
  // 脸：眼 + 口鼻
  g.rect(24, 19, 3, 3, 'K'); g.rect(37, 19, 3, 3, 'K');
  muzzle(g, 32, 24, 'K', 27);
  // 下颌绒毛阴影
  g.rect(22, 31, 20, 2, 'b');
  // 藏青长袍：三阶（亮边 C / 本体 A / 暗部 a）
  g.rect(13, 33, 38, 16, 'A');
  g.rect(11, 49, 42, 7, 'A');
  g.col(13, 34, 55, 'C'); g.col(14, 34, 55, 'C');
  g.row(33, 14, 49, 'C');
  g.col(48, 34, 55, 'a'); g.col(49, 34, 55, 'a');
  g.rect(11, 54, 42, 2, 'a');
  // 斜挎皮带 + 金属胸扣
  g.line(19, 33, 44, 50, 2, 'W');
  g.rect(29, 37, 5, 4, 'T'); g.rect(30, 39, 3, 1, 't');
  // 白爪子（袍下露出）+ 脚
  g.rect(17, 51, 7, 4, 'B'); g.rect(40, 51, 7, 4, 'B');
  g.rect(16, 56, 10, 7, 'B'); g.rect(39, 56, 10, 7, 'B');
  g.rect(16, 61, 10, 2, 'b'); g.rect(39, 61, 10, 2, 'b');
  return g;
}

// ---------------- 鸡毛法师：金毛 ----------------
function mage() {
  const g = new Grid();
  // 垂耳（金毛垂到下颌，比脸深一档）
  g.ellipse(13, 33, 7, 12, 'f');
  g.ellipse(51, 33, 7, 12, 'f');
  // 头（宽而圆）+ 口鼻部浅色块
  g.ellipse(32, 32, 17, 12, 'F');
  // 脸：眼 + 口鼻
  g.rect(25, 31, 3, 3, 'K'); g.rect(36, 31, 3, 3, 'K');
  g.rect(25, 31, 1, 1, 'l'); g.rect(36, 31, 1, 1, 'l');
  muzzle(g, 32, 37, 'K', 40);
  // 青绿斗篷：三阶
  g.rect(12, 44, 40, 11, 'C');
  g.rect(10, 52, 44, 7, 'C');
  g.col(13, 45, 57, 'h'); g.col(14, 45, 57, 'h');
  g.rect(10, 57, 44, 2, 'i');
  // 前爪 + 脚
  g.rect(21, 50, 8, 6, 'F'); g.rect(35, 50, 8, 6, 'F');
  g.rect(19, 58, 11, 5, 'F'); g.rect(34, 58, 11, 5, 'F');
  g.rect(19, 61, 11, 2, 'f'); g.rect(34, 61, 11, 2, 'f');
  // 法杖 + 胸口发光宝珠
  g.rect(31, 44, 3, 20, 'W'); g.col(33, 44, 63, 'w');
  g.ellipse(32, 48, 6, 6, 'G'); g.ellipse(30, 46, 3, 3, 'g'); g.rect(35, 51, 1, 1, 'g');
  // 帽子：尖帽（尖端向右上翘）+ 帽檐
  for (let y = 3; y <= 16; y++) {
    const t = (y - 3) / 13;
    const half = Math.round(2 + 17 * t);
    const cx = Math.round(47 - 15 * t);
    g.rect(cx - half, y, half * 2, 1, 'H');
    g.rect(cx - half, y, Math.max(1, Math.round(half * 0.5)), 1, 'h');
  }
  g.ellipse(32, 20, 23, 4, 'H');
  g.rect(11, 17, 42, 2, 'h');
  g.rect(11, 23, 42, 2, 'i');
  return g;
}

// ---------------- 16×16 图标版（跳跃动画里"刚好一格"用的） ----------------
// 64 格美术缩到 16 格时，眼睛只占 3~6 个源像素，投票必输给毛色 —— 会变成没脸。
// 所以这一版是**单独手绘**的 16×16，脸上直接 1px 眼睛 + 3px 嘴，1:1 渲染不走缩放。
const ICON16 = {
  mage: [
    '..........HH....',
    '........HHHHH...',
    '......HHHHHHHH..',
    '....HHHHHHHHHHH.',
    '..hhhhhhhhhhhhh.',
    '.HHHHHHHHHHHHHHH',
    '..iiiiiiiiiiiii.',
    '..fFFFFFFFFFFf..',
    '.ffFFKFFFFFKFff.',
    '.ffFFFFKKKFFFff.',
    '..CCCCCGGCCCCC..',
    '.CCCCCCGGGCCCCC.',
    '.CCCCCCWCCCCCCC.',
    '..FFCCCWCCCCFF..',
    '...FFF....FFF...',
    '................',
  ],
  knight: [
    '................',
    '..BB........BB..',
    '.BBBB......BBBB.',
    '.BBBBBBBBBBBBBB.',
    '.BBBBKBBBBKBBBB.',
    '.BBBBBKKKKBBBBB.',
    '..BBBBBBBBBBBB..',
    '..CCAAAAAAAAAA..',
    '.WAAAAAAAAAAAA..',
    '.AWAAAAAAAAAAA..',
    '..AWWWAAAAAAT...',
    '.AAABBBBBBBAAA..',
    '...BBBBBBBBBB...',
    '...BB.....BB....',
    '...BB.....BB....',
    '................',
  ],
};

/** ASCII 行 → 网格（'.' 表示空） */
function parseAscii(rows) {
  const S = rows.length;
  rows.forEach((r, y) => {
    if (r.length !== S) throw new Error('图标行长度不对: 第 ' + y + ' 行是 ' + r.length + ' 列');
  });
  return rows.map((r) => r.split('').map((c) => (c === '.' ? null : c)));
}

const PALETTE = {
  K: '#1A1D23',
  B: '#F7F5F0', b: '#C9CFD8',          // 马尔济斯：纯白毛 / 冷灰阴影
  F: '#EFD9A6', f: '#C79B54', l: '#F9EFD2',  // 金毛：金毛色 / 垂耳与阴影 / 口鼻高光
  A: '#2E4A6B', C: '#4A6D8C', a: '#22374E',  // 藏青长袍：本体 / 亮边 / 暗部
  H: '#2F6675', h: '#4E97A4', i: '#1F4A55',  // 青绿帽与斗篷：本体 / 亮部 / 暗部
  G: '#4FD1C5', g: '#A9F0EA', R: '#C0392B', r: '#7E170E',
  W: '#8B5E3C', w: '#5C3A22', T: '#C8CDD4', t: '#9AA3AC',
  Y: '#C9A227', y: '#E8D48B', M: '#3D5A80', m: '#2C4159',
};

function build(name, id, role, fn, outline = 2) {
  const art = fn();
  const ol = outlineN(art.g, outline);
  const rects = [...toRects(ol), ...toRects(art.g)];
  const back = raster(rects).map((row) => row.map((v) => v ?? ' ').join(''));
  const orig = art.g.map((row, y) => row.map((v, x) => v ?? ol[y][x] ?? ' ').join(''));
  // 16×16 图标版：1px 描边，整只占一格
  const g16 = parseAscii(ICON16[id]);
  const ol16 = outlineN(g16, 1);
  const rects16 = [...toRects(ol16), ...toRects(g16)];
  const back16 = raster(rects16, 16).map((row) => row.map((v) => v ?? ' ').join(''));
  return {
    id, name, role, grid: N, unit: 2, rects,
    icon16: { grid: 16, rects: rects16 },
    _ascii: back, _ok: back.join('') === orig.join(''),
    _ascii16: back16,
  };
}

const out = [
  // role 只写职业：等级由 gen_cards.py 按 GitHub 数据算出来，别在这里写死
  build('鸡毛法师', 'mage', 'MAGE', mage),
  build('小白战士', 'knight', 'KNIGHT', knight),
];

const only = process.argv[2];
for (const s of out) {
  if (only && only !== s.id) continue;
  console.log('### ' + s.id + '  rects=' + s.rects.length + ' lossless=' + s._ok);
  console.log(s._ascii.join('\n'));
  console.log('--- icon16（1:1，正好一格）');
  console.log(s._ascii16.join('\n'));
}

const json = {
  note: '64×64 像素角色。rect = [x, y, w, h, 调色板键, 是否额外描边]。由 design/build-sprites.mjs 生成：图元绘画 → 自动 2px 描边 → 合并矩形。别手改，改脚本。',
  palette: PALETTE,
  sprites: out.map(({ id, name, role, grid, unit, rects, icon16 }) => ({ id, name, role, grid, unit, rects, icon16 })),
};
await writeFile(resolve(here, 'sprites.json'), JSON.stringify(json, null, 1) + '\n', 'utf8');
console.log('\nwrote design/sprites.json');

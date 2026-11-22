// 64×64 像素角色：用图元画网格 → 自动合并成 rect 数据 + 自动 N px 描边。
// 运行：node design/build-sprites.mjs（覆写 design/sprites.json 并打印 ASCII 预览）
// 参考图：白柴战士（藏青长袍 + 背后佩剑 + 斜挎皮带） / 奶油柴法师（青绿尖帽 + 斗篷 + 发光法杖）
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
  ellipse(cx, cy, rx, ry, k) {
    for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
      const dx = (x - cx) / (rx + 0.5), dy = (y - cy) / (ry + 0.5);
      if (dx * dx + dy * dy <= 1) this.set(x, y, k);
    }
  }
  /** 斜线（方形笔头），用来画斜挎皮带 */
  line(x0, y0, x1, y1, w, k) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.rect(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), w, w, k);
    }
  }
}

/** 描边：非空格向外膨胀 n 格涂 K */
function outlineN(g, n = 2) {
  const out = Array.from({ length: N }, () => Array(N).fill(null));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (g[y][x]) continue;
    let near = false;
    for (let dy = -n; dy <= n && !near; dy++) for (let dx = -n; dx <= n; dx++) {
      if (dx * dx + dy * dy > n * n + n) continue;
      const ny = y + dy, nx = x + dx;
      if (ny >= 0 && ny < N && nx >= 0 && nx < N && g[ny][nx]) { near = true; break; }
    }
    if (near) out[y][x] = 'K';
  }
  return out;
}

/** 网格 → 矩形（先按行合并同色连续段，再纵向合并相同跨度） */
function toRects(grid) {
  const spans = [];
  for (let y = 0; y < N; y++) {
    let x = 0;
    while (x < N) {
      const k = grid[y][x];
      if (!k) { x++; continue; }
      let w = 1;
      while (x + w < N && grid[y][x + w] === k) w++;
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

function raster(rects) {
  const g = Array.from({ length: N }, () => Array(N).fill(null));
  for (const r of rects) for (let y = r[1]; y < r[1] + r[3]; y++) for (let x = r[0]; x < r[0] + r[2]; x++) g[y][x] = r[4];
  return g;
}

/** 柴犬的 w 形嘴：两个小拱 */
function smile(g, cy) {
  g.rect(27, cy, 2, 1, 'K'); g.rect(29, cy + 1, 2, 1, 'K');
  g.rect(31, cy, 2, 1, 'K'); g.rect(33, cy + 1, 2, 1, 'K');
  g.rect(35, cy, 2, 1, 'K');
}

// ---------------- 小白战士：白柴 + 藏青长袍 + 背后佩剑 ----------------
function knight() {
  const g = new Grid();
  // 背后斜挎的剑（先画，被身体压住）
  g.rect(11, 12, 5, 4, 't');          // 柄头
  g.line(10, 16, 8, 25, 3, 'W');      // 剑柄
  g.line(3, 26, 14, 28, 2, 't');      // 护手
  g.line(8, 28, 5, 42, 3, 'T');       // 剑身（斜向下，刃尖留在画布内）
  g.rect(3, 40, 6, 5, 'T');           // 剑尖
  // 耳朵（贴头顶两侧，向外探出）
  g.rect(12, 1, 10, 9, 'B'); g.rect(14, 3, 5, 4, 'b');
  g.rect(42, 1, 10, 9, 'B'); g.rect(44, 3, 5, 4, 'b');
  // 头 + 下颌阴影
  g.ellipse(32, 20, 16, 12, 'B');
  g.rect(20, 29, 24, 3, 'b');
  // 脸：圆点眼 + w 嘴
  g.rect(25, 17, 3, 3, 'K'); g.rect(36, 17, 3, 3, 'K');
  smile(g, 24);
  // 藏青长袍
  g.rect(13, 32, 38, 18, 'A');
  g.rect(11, 50, 42, 6, 'A');
  g.col(13, 34, 54, 'C'); g.col(14, 34, 54, 'C');
  g.col(48, 34, 54, 'a'); g.col(49, 34, 54, 'a');
  // 斜挎皮带（细）+ 胸扣
  g.line(19, 32, 44, 50, 2, 'W');
  g.rect(29, 36, 5, 4, 'T'); g.rect(30, 38, 3, 1, 't');
  // 脚
  g.rect(16, 55, 9, 6, 'B'); g.rect(39, 55, 9, 6, 'B');
  g.rect(16, 59, 9, 2, 'b'); g.rect(39, 59, 9, 2, 'b');
  return g;
}

// ---------------- 鸡毛法师：奶油柴 + 青绿尖帽 + 发光法杖 ----------------
function mage() {
  const g = new Grid();
  // 耳朵（帽檐两侧露出，内耳用毛色阴影而不是黑色）
  g.rect(5, 24, 13, 12, 'F'); g.rect(7, 26, 8, 7, 'f');
  g.rect(46, 24, 13, 12, 'F'); g.rect(47, 26, 8, 7, 'f');
  // 头 + 下颌阴影
  g.ellipse(32, 32, 16, 11, 'F');
  g.rect(18, 40, 28, 3, 'f');
  // 脸：圆点眼 + w 嘴
  g.rect(25, 32, 3, 3, 'K'); g.rect(36, 32, 3, 3, 'K');
  smile(g, 37);
  // 斗篷
  g.rect(13, 44, 38, 12, 'C');
  g.rect(11, 52, 42, 6, 'C');
  g.col(14, 45, 53, 'h');
  g.rect(11, 56, 42, 2, 'i');
  // 前爪 + 脚
  g.rect(21, 50, 8, 7, 'F'); g.rect(35, 50, 8, 7, 'F');
  g.rect(19, 58, 11, 5, 'F'); g.rect(34, 58, 11, 5, 'F');
  g.rect(19, 61, 11, 2, 'f'); g.rect(34, 61, 11, 2, 'f');
  // 法杖 + 发光宝珠（胸口高度，画在最前面）
  g.rect(31, 44, 3, 20, 'W'); g.col(33, 44, 63, 'w');
  g.ellipse(32, 48, 6, 6, 'G'); g.ellipse(30, 46, 3, 3, 'g');
  // 帽子：先尖帽（尖端向右上翘）再帽檐压住头顶
  for (let y = 4; y <= 16; y++) {
    const t = (y - 4) / 12;
    const half = Math.round(2 + 16 * t);
    const cx = Math.round(46 - 14 * t);
    g.rect(cx - half, y, half * 2, 1, 'H');
    g.rect(cx - half, y, Math.max(1, Math.round(half * 0.55)), 1, 'h');
  }
  g.ellipse(32, 20, 22, 4, 'H');
  g.rect(12, 17, 40, 2, 'h');
  g.rect(11, 23, 42, 2, 'i');  // 帽檐底影压在额头上，别留一条纯 H 的边
  return g;
}

const PALETTE = {
  K: '#1A1D23',          // 描边/眼睛
  B: '#F5F2EA', b: '#C9C5B6',   // 白柴毛色 / 阴影
  F: '#F2D8A8', f: '#D9B87F',   // 奶油毛色 / 阴影
  A: '#2E4A6B', a: '#22374E', C: '#4A6D8C',  // 藏青长袍 / 暗部 / 亮边
  H: '#2F6675', h: '#4E97A4', i: '#1F4A55',  // 青绿帽 / 亮部 / 暗部
  R: '#C0392B', r: '#7E170E', G: '#4FD1C5', g: '#A9F0EA',
  W: '#8B5E3C', w: '#5C3A22', T: '#C8CDD4', t: '#9AA3AC',
  Y: '#C9A227', y: '#E8D48B', M: '#3D5A80', m: '#2C4159',
};

function build(name, id, role, fn, outline = 2) {
  const art = fn();
  const ol = outlineN(art.g, outline);
  const rects = [...toRects(ol), ...toRects(art.g)]; // 描边先画，填充后画
  // 自检：矩形回填必须与「描边 ∪ 填充」逐格相同
  const back = raster(rects).map((row) => row.map((v) => v ?? ' ').join(''));
  const orig = art.g.map((row, y) => row.map((v, x) => v ?? ol[y][x] ?? ' ').join(''));
  return { id, name, role, grid: N, unit: 2, rects, _ascii: back, _ok: back.join('') === orig.join('') };
}

const out = [
  build('鸡毛法师', 'mage', 'MAGE · LV.03', mage),
  build('小白战士', 'knight', 'KNIGHT · LV.05', knight),
];

const only = process.argv[2];
for (const s of out) {
  if (only && only !== s.id) continue;
  console.log('### ' + s.id + '  rects=' + s.rects.length + ' lossless=' + s._ok);
  console.log(s._ascii.join('\n'));
}

const json = {
  note: '64×64 像素角色。rect = [x, y, w, h, 调色板键, 是否额外描边]。由 design/build-sprites.mjs 生成：图元绘画 → 自动 2px 描边 → 合并矩形。别手改，改脚本。',
  palette: PALETTE,
  sprites: out.map(({ id, name, role, grid, unit, rects }) => ({ id, name, role, grid, unit, rects })),
};
await writeFile(resolve(here, 'sprites.json'), JSON.stringify(json, null, 1) + '\n', 'utf8');
console.log('\nwrote design/sprites.json');

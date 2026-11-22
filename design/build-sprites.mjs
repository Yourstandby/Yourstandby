// 64×64 像素角色：用图元画网格 → 自动合并成 rect 数据 + 自动 1px 描边。
// 运行：node design/build-sprites.mjs   （会覆写 design/sprites.json 并打印 ASCII 预览）
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const N = 64;
const here = dirname(fileURLToPath(import.meta.url));

class Grid {
  constructor() { this.g = Array.from({ length: N }, () => Array(N).fill(null)); }
  set(x, y, k) { x |= 0; y |= 0; if (x >= 0 && x < N && y >= 0 && y < N) this.g[y][x] = k; }
  rect(x, y, w, h, k) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, k); }
  ellipse(cx, cy, rx, ry, k) {
    for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
      const dx = (x - cx) / (rx + 0.5), dy = (y - cy) / (ry + 0.5);
      if (dx * dx + dy * dy <= 1) this.set(x, y, k);
    }
  }
  col(x, y0, y1, k) { for (let y = y0; y <= y1; y++) this.set(x, y, k); }
  /** 复制自身（用于对称镜像） */
  mirrorX() { for (let y = 0; y < N; y++) for (let x = 0; x < N / 2; x++) { const v = this.g[y][N - 1 - x]; if (v) this.g[y][x] = v; } }
}

/** 描边：所有非空格的 1 格膨胀，涂 K → 漫画线稿感（不写进 art，自动生成） */
function outline(g) {
  const out = Array.from({ length: N }, () => Array(N).fill(null));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (g[y][x]) continue;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
      const ny = y + dy, nx = x + dx;
      if (ny >= 0 && ny < N && nx >= 0 && nx < N && g[ny][nx]) { near = true; break; }
    }
    if (near) out[y][x] = 'K';
  }
  return out;
}

/** 网格 → 矩形（先按行合并同色连续段，再纵向合并相同跨度） */
function toRects(grid) {
  const spans = []; // {x,y,w,k}
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
  // 按行索引，纵向合并同 x / 同宽 / 同色的段
  const byRow = new Map();
  for (const s of spans) {
    const key = s.y;
    if (!byRow.has(key)) byRow.set(key, new Map());
    byRow.get(key).set(s.x + ':' + s.w + ':' + s.k, s);
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

// ---------------- 鸡毛法师 ----------------
function mage() {
  const g = new Grid();
  // 法杖
  g.rect(8, 16, 4, 48, 'W'); g.col(11, 16, 63, 'w');
  // 杖顶宝石
  g.ellipse(10, 12, 7, 7, 'G'); g.ellipse(8, 10, 3, 3, 'g'); g.rect(10, 4, 2, 1, 'g');
  // 帽羽
  g.rect(33, 0, 3, 11, 'M'); g.col(35, 0, 10, 'm');
  // 帽锥
  for (let y = 9; y <= 30; y++) {
    const t = (y - 9) / 21, half = Math.round(3 + 13 * t);
    g.rect(34 - half, y, half * 2, 1, 'M');
    g.rect(34 + half - 3, y, 3, 1, 'm');
  }
  // 帽檐
  g.rect(15, 30, 38, 4, 'M'); g.rect(15, 33, 38, 1, 'm');
  // 头
  g.rect(22, 34, 24, 16, 'F'); g.rect(43, 34, 3, 16, 'f'); g.rect(22, 47, 24, 3, 'f');
  // 眼睛（带 1px 高光）
  g.rect(26, 38, 4, 5, 'K'); g.rect(39, 38, 4, 5, 'K');
  g.rect(26, 38, 1, 1, 'B'); g.rect(39, 38, 1, 1, 'B');
  // 嘴
  g.rect(32, 45, 5, 2, 'K');
  // 左臂（握杖）
  g.rect(12, 43, 11, 7, 'R'); g.rect(10, 43, 3, 7, 'F');
  // 领甲
  g.rect(20, 50, 28, 5, 'C'); g.rect(20, 54, 28, 1, 'a');
  // 袍
  g.rect(22, 55, 24, 5, 'R'); g.rect(18, 58, 32, 4, 'R');
  g.col(21, 55, 61, 'r'); g.rect(42, 55, 3, 6, 'r');
  // 腰带
  g.rect(18, 57, 32, 2, 'Y');
  // 右臂
  g.rect(46, 46, 6, 8, 'R'); g.rect(48, 53, 5, 4, 'F');
  // 靴
  g.rect(23, 61, 9, 3, 'a'); g.rect(36, 61, 9, 3, 'a');
  return g;
}

// ---------------- 小白战士 ----------------
function knight() {
  const g = new Grid();
  // 羽饰
  g.rect(33, 0, 3, 8, 'R'); g.col(35, 0, 7, 'r');
  // 头盔
  g.ellipse(34, 16, 13, 10, 'B');
  g.rect(21, 16, 27, 9, 'B');
  g.rect(21, 21, 27, 4, 'b');
  g.rect(33, 6, 2, 19, 'b');
  // 面甲缝
  g.rect(25, 17, 19, 3, 'K');
  // 护颈
  g.rect(27, 29, 15, 4, 'A');
  // 躯干
  g.rect(22, 33, 25, 12, 'A');
  g.rect(22, 33, 2, 12, 'C'); g.rect(45, 33, 2, 12, 'a');
  // 腰带
  g.rect(22, 43, 25, 3, 'Y'); g.rect(22, 43, 25, 1, 'y');
  // 腿 + 靴
  g.rect(25, 46, 7, 13, 'A'); g.rect(36, 46, 7, 13, 'A');
  g.rect(23, 58, 9, 4, 'B'); g.rect(35, 58, 9, 4, 'B'); g.rect(23, 61, 9, 1, 'b');
  g.rect(35, 61, 9, 1, 'b');
  // 盾（左）
  g.rect(4, 28, 17, 22, 'B'); g.rect(4, 28, 17, 2, 'b'); g.rect(4, 48, 17, 2, 'b');
  g.rect(11, 33, 4, 11, 'Y'); g.rect(8, 37, 10, 3, 'Y');
  // 剑（右）
  g.rect(53, 4, 2, 4, 'T'); g.rect(52, 8, 4, 36, 'T'); g.col(55, 8, 43, 't');
  g.rect(46, 44, 16, 3, 'Y'); g.rect(46, 44, 16, 1, 'y');
  g.rect(52, 47, 4, 6, 'W'); g.rect(51, 53, 6, 2, 'Y');
  // 握剑的手
  g.rect(50, 45, 4, 5, 'B'); g.rect(50, 49, 4, 1, 'b');
  return g;
}

const PALETTE = {
  K: '#1A1D23', M: '#3D5A80', m: '#2C4159', F: '#F2D8A8', f: '#D9B87F',
  C: '#4A6D8C', a: '#35506B', R: '#C0392B', r: '#7E170E', G: '#4FD1C5', g: '#A9F0EA',
  W: '#8B5E3C', w: '#5C3A22', B: '#F5F2EA', b: '#C9C5B6', A: '#2E4A6B',
  Y: '#C9A227', y: '#E8D48B', T: '#C8CDD4', t: '#9AA3AC',
};

function build(name, id, role, fn) {
  const art = fn();
  const ol = outline(art.g);
  const rects = [...toRects(ol), ...toRects(art.g)]; // 描边先画，填充后画
  // 自检：来回栅格化必须与手工网格完全一致
  // expected = 描边 ∪ 填充；back = 矩形回填，两者必须逐格相同
  const back = raster(rects).map((row) => row.map((v) => v ?? ' ').join(''));
  const orig = art.g.map((row, y) => row.map((v, x) => v ?? ol[y][x] ?? ' ').join(''));
  const ok = back.join('') === orig.join('');
  return { id, name, role, grid: N, unit: 2, rects, _ascii: back, _ok: ok };
}

const out = [
  build('鸡毛法师', 'mage', 'MAGE · LV.03', mage),
  build('小白战士', 'knight', 'KNIGHT · LV.05', knight),
];

for (const s of out) { console.log('### ' + s.id + '  rects=' + s.rects.length + ' lossless=' + s._ok); console.log(s._ascii.join('\n')); }

const json = {
  note: '64×64 像素角色。rect = [x, y, w, h, 调色板键, 是否额外描边]。由 design/build-sprites.mjs 生成：图元绘画 → 自动 1px 描边 → 合并矩形。别手改，改脚本。',
  palette: PALETTE,
  sprites: out.map(({ id, name, role, grid, unit, rects }) => ({ id, name, role, grid, unit, rects })),
};
await writeFile(resolve(here, 'sprites.json'), JSON.stringify(json, null, 1) + '\n', 'utf8');
console.log('\nwrote design/sprites.json');

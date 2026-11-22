/* 马里奥式踩踏：两人在贡献格上随机跳跃（含后退、原地跳、换行），踩过的格子点亮。
   node + @napi-rs/canvas 逐帧渲染 → GIF + 动画 WebP。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import gifenc from 'gifenc';
import sharp from 'sharp';

const { GIFEncoder, quantize, applyPalette } = gifenc;
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const FPS = Number(process.argv[2] || 20);

const COLS = 53, ROWS = 7, CELL = 16, GAP = 2;
const GRID_W = COLS * (CELL + GAP) - GAP;
const GRID_H = ROWS * (CELL + GAP) - GAP;
const W = GRID_W + 24, H = 320;
const GX = 12, GY = 132;
const HERO = 16;          // 只有一格大小

/* 浅色纸底 */
const C = {
  paper: '#FFF4EC', line: '#E2D2C4', textDim: '#9A8074',
  empty: '#EFE4D8', l1: '#DCCFC2', l2: '#E8A17F', l3: '#D8563C', l4: '#C81E00',
  hit: '#FFB000', hitEdge: '#FFE0A0',
  ember: '#C81E00', cyan: '#0A6E8A', spark: '#FF8A3D', dust: '#C9B5A6'
};
const RAMP = [C.empty, C.l1, C.l2, C.l3, C.l4];

async function loadCalendar() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const login = process.env.GH_LOGIN || 'Yourstandby';
  if (!token) throw new Error('missing GITHUB_TOKEN');
  const today = new Date();
  const from = new Date(today.getTime() - 364 * 864e5).toISOString();
  const body = {
    query: 'query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}',
    variables: { login, from, to: today.toISOString() }
  };
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'User-Agent': 'yourstandby-hop' },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors).slice(0, 300));
  return json.data.user.contributionsCollection.contributionCalendar.weeks
    .map((w) => w.contributionDays.map((d) => d.contributionCount));
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 随机游走：会后退、会原地跳、会换行，但总体朝终点推进 */
function planPath(startCol, startRow, endCol, seed) {
  const rnd = mulberry32(seed);
  const bias = Math.sign(endCol - startCol);
  const jumps = [];
  let col = startCol, row = startRow, guard = 0;
  while (col !== endCol && guard++ < 90) {
    const r = rnd();
    let step;
    if (r < 0.16) step = 0;                                       // 原地跳
    else if (r < 0.30) step = -bias * (1 + Math.floor(rnd() * 2)); // 往回退
    else step = bias * (1 + Math.floor(rnd() * 3));               // 前进 1-3 格
    let next = col + step;
    if ((endCol - next) * bias < 4) next = endCol;                 // 临近终点直接落位
    next = Math.max(0, Math.min(COLS - 1, next));
    let nextRow = row;
    if (rnd() < 0.4) nextRow = Math.max(0, Math.min(ROWS - 1, row + (rnd() < 0.5 ? -1 : 1)));
    jumps.push({ fromCol: col, fromRow: row, toCol: next, toRow: nextRow,
                 dur: 0.34 + rnd() * 0.16, height: 22 + rnd() * 20, pause: rnd() < 0.2 ? 0.09 : 0 });
    col = next; row = nextRow;
  }
  return jumps;
}

function align(tracks) {
  const total = (t) => t.reduce((s, j) => s + j.dur + j.pause, 0);
  const max = Math.max(...tracks.map(total));
  for (const tr of tracks) { const k = max / total(tr); for (const j of tr) { j.dur *= k; j.pause *= k; } }
  return max;
}

const CROUCH = 0.14, LAND = 0.84;
function poseAt(p) {
  if (p < CROUCH) {
    const q = p / CROUCH;
    return { squash: 1 - 0.09 * Math.sin(q * Math.PI * 0.5), height: 0, crouch: q };
  }
  if (p > LAND) {
    const q = Math.min(1, (p - LAND) / (1 - LAND));
    const squash = q < 0.5 ? 0.91 + (1.01 - 0.91) * (q / 0.5) : 1.01 - 0.01 * ((q - 0.5) / 0.5);
    return { squash, height: 0, land: q };
  }
  const q = (p - CROUCH) / (LAND - CROUCH);
  const arc = Math.pow(Math.sin(Math.PI * q), 0.62);
  return { squash: q < 0.12 ? 0.91 + 0.09 * (q / 0.12) : 1, height: arc };
}

const SPR = JSON.parse(fs.readFileSync(path.join(root, 'public/sprites.json'), 'utf8'));
const SPRITE = {
  mage: SPR.sprites.find((s) => s.id === 'mage'),
  knight: SPR.sprites.find((s) => s.id === 'knight')
};

/* 把 sprites.json 的网格烘焙成一格大小（HERO×HERO），必须整只都在格子里：
   - 源分辨率取自 sprite.grid（现在是 64），不能写死 32，否则只拷到左上四分之一
   - 缩小用「多数投票」而不是最近邻抽样：16px 下最近邻会把细线整块丢掉，
     投票能保住剪影和主色，人物不会缺胳膊少腿
   HERO 必须 == CELL，人物正好占一格 */
const baked = {};
for (const id of ['mage', 'knight']) {
  const sp = SPRITE[id], pal = SPR.palette;
  const g = sp.grid || 32;
  const px = Array.from({ length: g }, () => Array(g).fill(null));
  for (const r of sp.rects) if (r[5]) for (let y = r[1] - 1; y < r[1] + r[3] + 1; y++) for (let x = r[0] - 1; x < r[0] + r[2] + 1; x++) {
    if (px[y] && px[y][x] === null) px[y][x] = 'K';
  }
  for (const r of sp.rects) for (let y = r[1]; y < r[1] + r[3]; y++) for (let x = r[0]; x < r[0] + r[2]; x++) {
    if (px[y] && px[y][x] !== undefined) px[y][x] = r[4];
  }
  const oc = createCanvas(HERO, HERO);
  const octx = oc.getContext('2d');
  octx.imageSmoothingEnabled = false;
  for (let ty = 0; ty < HERO; ty++) for (let tx = 0; tx < HERO; tx++) {
    const x0 = Math.floor((tx * g) / HERO), x1 = Math.max(x0 + 1, Math.ceil(((tx + 1) * g) / HERO));
    const y0 = Math.floor((ty * g) / HERO), y1 = Math.max(y0 + 1, Math.ceil(((ty + 1) * g) / HERO));
    const votes = new Map();
    let total = 0, opaque = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      total++;
      const k = px[y]?.[x];
      if (k) { opaque++; votes.set(k, (votes.get(k) || 0) + 1); }
    }
    if (opaque / total < 0.5) continue;         // 半格以上是空的就留空，保住剪影
    let pick = 'K', best = 0;
    for (const [k, c] of votes) if (c > best) { best = c; pick = k; }
    octx.fillStyle = pal[pick];
    octx.fillRect(tx, ty, 1, 1);
  }
  baked[id] = oc;
}

function drawHero(ctx, id, x, y, squash, flip) {
  const h = Math.max(12, Math.round(HERO * squash));
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (flip) { ctx.translate(Math.round(x) + HERO, Math.round(y) + HERO - h); ctx.scale(-1, 1); }
  else ctx.translate(Math.round(x), Math.round(y) + HERO - h);
  ctx.drawImage(baked[id], 0, 0, HERO, HERO, 0, 0, HERO, h);
  ctx.restore();
}

/* 落地冲击波：两帧内向外扩一圈方环 */
function drawShock(ctx, x, y, p, color) {
  if (p <= 0 || p >= 1) return;
  const r = Math.round(p * 14);
  ctx.fillStyle = color;
  ctx.globalAlpha = 1 - p;
  ctx.fillRect(x - r, y - r, HERO + r * 2, 2);
  ctx.fillRect(x - r, y + HERO + r - 2, HERO + r * 2, 2);
  ctx.fillRect(x - r, y - r, 2, HERO + r * 2);
  ctx.fillRect(x + HERO + r - 2, y - r, 2, HERO + r * 2);
  ctx.globalAlpha = 1;
}

const cellX = (c) => GX + c * (CELL + GAP);
const cellY = (r) => GY + r * (CELL + GAP);

function stateAt(t, track, startCol, startRow) {
  let acc = 0, cur = { col: startCol, row: startRow };
  const landed = [];
  for (const j of track) {
    const span = j.dur + j.pause;
    const landedAt = acc + j.dur;
    if (t <= acc + span) {
      const p = Math.min(1, Math.max(0, (t - acc) / j.dur));
      const pose = t > landedAt ? { squash: 1, height: 0, land: 1 } : poseAt(p);
      const col = j.fromCol + (j.toCol - j.fromCol) * p;
      const row = j.fromRow + (j.toRow - j.fromRow) * p;
      return { col, row, pose, landedAt, landed };
    }
    acc += span;
    cur = { col: j.toCol, row: j.toRow };
    landed.push({ col: j.toCol, row: j.toRow });
  }
  return { col: cur.col, row: cur.row, pose: { squash: 1, height: 0 }, landedAt: acc, landed };
}

function pressOf(t, landedAt) {
  const q = (t - landedAt) / 0.22;
  if (q < 0 || q > 1) return 0;
  return Math.sin((1 - q) * Math.PI * 0.5);
}

let grid, trackM, trackK, TOTAL;

function renderHop(ctx, t) {
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = C.textDim;
  for (let i = 0; i < 5; i++) ctx.fillRect(GX + i * 8, 34, 6, 6);
  ctx.fillStyle = C.line;
  ctx.fillRect(GX, 50, GRID_W, 2);

  const m = stateAt(t, trackM, 0, 1);
  const k = stateAt(t, trackK, COLS - 1, 5);
  const mPress = pressOf(t, m.landedAt);
  const kPress = pressOf(t, k.landedAt);

  const lit = new Set();
  for (const p of m.landed) lit.add(p.col + ':' + p.row);
  for (const p of k.landed) lit.add(p.col + ':' + p.row);
  const mCol = Math.round(m.col), mRow = Math.round(m.row);
  const kCol = Math.round(k.col), kRow = Math.round(k.row);

  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const count = (grid[c] && grid[c][r]) || 0;
      let fill = RAMP[count <= 0 ? 0 : count < 3 ? 1 : count < 6 ? 2 : count < 10 ? 3 : 4];
      const isLit = lit.has(c + ':' + r);
      let sink = 0;
      if (c === mCol && r === mRow && mPress > 0) sink = Math.round(mPress * 7);
      if (c === kCol && r === kRow && kPress > 0) sink = Math.round(kPress * 7);
      // 左右相邻格被震塌 1px
      if (Math.abs(c - mCol) === 1 && r === mRow && mPress > 0.4) sink = 1;
      if (Math.abs(c - kCol) === 1 && r === kRow && kPress > 0.4) sink = 1;
      if (isLit) {
        ctx.fillStyle = C.hit;
        ctx.fillRect(cellX(c), cellY(r) + sink, CELL, CELL - sink);
        ctx.fillStyle = C.hitEdge;
        ctx.fillRect(cellX(c), cellY(r) + sink, CELL, 2);
      } else {
        ctx.fillStyle = fill;
        ctx.fillRect(cellX(c), cellY(r) + sink, CELL, CELL - sink);
      }
    }
  }

  const mX = cellX(m.col), mY = cellY(m.row) + CELL - HERO;
  const kX = cellX(k.col), kY = cellY(k.row) + CELL - HERO;
  const mSink = Math.round(mPress * 7), kSink = Math.round(kPress * 7);
  drawShock(ctx, mX, mY, mPress > 0 ? 1 - mPress : 0, C.hit);
  drawShock(ctx, kX, kY, kPress > 0 ? 1 - kPress : 0, C.spark);

  drawHero(ctx, 'mage', mX, mY + mSink - m.pose.height, m.pose.squash, false);
  drawHero(ctx, 'knight', kX, kY + kSink - k.pose.height, k.pose.squash, true);

  if (mPress > 0.2) for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? C.dust : C.hitEdge;
    ctx.fillRect(mX - 3 + i * 6, cellY(m.row) + CELL + 1 + (i % 2) * 2, 2, 2);
  }
  if (kPress > 0.2) for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? C.dust : C.spark;
    ctx.fillRect(kX - 3 + i * 6, cellY(k.row) + CELL + 1 + (i % 2) * 2, 2, 2);
  }

  const barY = H - 26;
  ctx.fillStyle = C.line; ctx.fillRect(GX, barY, GRID_W, 4);
  ctx.fillStyle = C.ember;
  ctx.fillRect(GX, barY, GRID_W * 0.5 * (m.col / (COLS - 1)), 4);
  ctx.fillStyle = C.cyan;
  const kp = 1 - k.col / (COLS - 1);
  ctx.fillRect(GX + GRID_W - GRID_W * 0.5 * kp, barY, GRID_W * 0.5 * kp, 4);

  if (t > TOTAL - 1.0) {
    const cx = GX + GRID_W / 2;
    for (let i = 0; i < 8; i++) {
      const ang = t * 5 + i * 0.8;
      ctx.fillStyle = i % 2 ? C.hit : C.spark;
      ctx.fillRect(Math.round(cx + Math.cos(ang) * 24), Math.round(cellY(3) - 10 + Math.sin(ang) * 13), 3, 3);
    }
  }
}

grid = await loadCalendar();
trackM = planPath(0, 1, 26, 20261122);
trackK = planPath(52, 5, 26, 77712345);
const travel = align([trackM, trackK]);
const cycle = travel + 1.2;
TOTAL = cycle;
const frames = Math.round(cycle * FPS);

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
const framesBuf = [];
for (let f = 0; f < frames; f++) {
  renderHop(ctx, (f / FPS) % cycle);
  const { data } = ctx.getImageData(0, 0, W, H);
  framesBuf.push(Buffer.from(data));
}
console.log('canvas', W + 'x' + H, '| frames', frames, '@', FPS, 'fps | cycle', cycle.toFixed(2) + 's');
console.log('mage jumps', trackM.length, '| knight jumps', trackK.length);

const sample = [];
for (let i = 0; i < framesBuf.length; i += Math.max(1, Math.floor(framesBuf.length / 30))) sample.push(framesBuf[i]);
const palette = quantize(Buffer.concat(sample), 256, { format: 'rgb565' });

const gif = GIFEncoder();
for (const f of framesBuf) gif.writeFrame(applyPalette(f, palette, 'rgb565'), W, H, { palette, delay: Math.round(1000 / FPS) });
gif.finish();
const gifBuf = Buffer.from(gif.bytes());
fs.writeFileSync(path.join(root, '../profile/hop.gif'), gifBuf);
await sharp(gifBuf, { animated: true }).webp({ lossless: true, effort: 6 })
  .toFile(path.join(root, '../profile/hop.webp'));
const ws = fs.statSync(path.join(root, '../profile/hop.webp')).size;
console.log('GIF', (gifBuf.length / 1024).toFixed(0), 'KB | WEBP', (ws / 1024).toFixed(0), 'KB');

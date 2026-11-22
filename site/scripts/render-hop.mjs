/* 马里奥式踩踏：鸡毛法师与小白战士在贡献热力格上跳跃，踩过的格子亮起。
   node + @napi-rs/canvas 逐帧渲染 → GIF + 动画 WebP。
   用法：GITHUB_TOKEN=xxx node scripts/render-hop.mjs [fps] */
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

const W = 640, H = 200;
const COLS = 53, ROWS = 7, CELL = 9, GAP = 1;
const GRID_W = COLS * (CELL + GAP) - GAP;
const GX = Math.round((W - GRID_W) / 2);
const GY = 96;

const STEP = 20;        // 每跳 2 格
const HOP = 0.3;        // 每次跳跃时长（秒），20fps 下每跳 6 帧
const JUMP = 13;        // 跳跃高度
const HOLDS = [13, 13]; // 各跳 13 次 = 26 格，正好在中列（26）会合

const C = {
  ink: '#1A1D23', bg: '#0B0C0E', line: '#3D1B16',
  ember: '#FF3B1F', deep: '#C21B00', flame: '#FFB000', spark: '#FFE9A8',
  cyan: '#2BD9FF', gold: '#FFB000', ash: '#8A6A64',
  empty: '#241110', lvl1: '#4A1A12', lvl2: '#8A2416', lvl3: '#C21B00', lvl4: '#FF6A3D'
};

/* ---------- 数据 ---------- */
async function loadCalendar() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const login = process.env.GH_LOGIN || 'Yourstandby';
  if (!token) throw new Error('missing GITHUB_TOKEN');
  const today = new Date();
  const from = new Date(today.getTime() - 364 * 864e5).toISOString();
  const to = today.toISOString();
  const body = {
    query: 'query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}',
    variables: { login, from, to }
  };
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'User-Agent': 'yourstandby-hop' },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors).slice(0, 300));
  const weeks = json.data.user.contributionsCollection.contributionCalendar.weeks;
  return weeks.map((w) => w.contributionDays.map((d) => d.contributionCount));
}

/* ---------- 精灵 ---------- */
const SPR = JSON.parse(fs.readFileSync(path.join(root, 'public/sprites.json'), 'utf8'));
const HERO = {
  mage: SPR.sprites.find((s) => s.id === 'mage'),
  knight: SPR.sprites.find((s) => s.id === 'knight')
};

function drawHero(ctx, id, x, y, squash) {
  const sprite = HERO[id];
  const pal = SPR.palette;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (squash !== 1) {
    ctx.translate(0, 32);
    ctx.scale(1, squash);
    ctx.translate(0, -32);
  }
  for (const r of sprite.rects) {
    if (r[5]) { ctx.fillStyle = pal.K; ctx.fillRect(r[0] - 1, r[1] - 1, r[2] + 2, r[3] + 2); }
  }
  for (const r of sprite.rects) {
    ctx.fillStyle = pal[r[4]];
    ctx.fillRect(r[0], r[1], r[2], r[3]);
  }
  ctx.restore();
}

/* ---------- 状态 ---------- */
function levelOf(count) {
  if (count <= 0) return 0;
  if (count < 3) return 1;
  if (count < 6) return 2;
  if (count < 10) return 3;
  return 4;
}
const RAMP = [C.empty, C.lvl1, C.lvl2, C.lvl3, C.lvl4];

/* 一次跳跃：返回位置和当前跳跃进度 */
function hop(t, startCol, dir, hops) {
  const idx = Math.min(hops, Math.max(0, Math.floor(t / HOP)));
  const p = idx >= hops ? 1 : Math.min(1, (t - idx * HOP) / HOP);
  const from = startCol + dir * idx * 2;
  const to = startCol + dir * (idx + 1) * 2;
  const x = (from + (to - from) * p) * (CELL + GAP);
  const y = -4 * JUMP * p * (1 - p);
  return { idx, p, x, y };
}

function squashOf(p) {
  if (p <= 0.001) return 1;
  if (p < 0.16) return 0.82 + (p / 0.16) * 0.18;
  if (p > 0.9) return 0.86 + ((1 - p) / 0.1) * 0.14;
  return 1;
}

function renderHop(ctx, t, grid, sparks) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // 顶部标题
  ctx.fillStyle = C.ash;
  for (let i = 0; i < 4; i++) ctx.fillRect(GX + i * 6, 22, 4, 4);
  ctx.fillStyle = C.line;
  ctx.fillRect(GX, 34, GRID_W, 1);

  const m = hop(t, 0, 1, HOLDS[0]);
  const k = hop(t, COLS - 1, -1, HOLDS[1]);
  const progressM = m.idx, progressK = k.idx;

  // 网格
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const count = (grid[c] && grid[c][r]) || 0;
      let lvl = levelOf(count);
      const x = GX + c * (CELL + GAP);
      const y = GY + r * (CELL + GAP);
      // 已踩过的格子提亮一级
      const stepped = (r === 3 && c <= m.idx * 2) || (r === 4 && c >= COLS - 1 - k.idx * 2);
      if (stepped) lvl = Math.min(4, Math.max(1, lvl + 1));
      ctx.fillStyle = RAMP[lvl];
      ctx.fillRect(x, y, CELL, CELL);
    }
  }

  // 落点光斑
  const rowY = GY + 3 * (CELL + GAP);
  const rowY2 = GY + 4 * (CELL + GAP);

  // 角色
  drawHero(ctx, 'mage', GX + m.x, rowY - 32 + m.y, squashOf(m.p));
  drawHero(ctx, 'knight', GX + k.x - 32, rowY2 - 32 + k.y, squashOf(k.p));

  // 落地火花
  if (m.p > 0.9 || m.p < 0.08) {
    const cx = GX + m.x + 16;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i % 2 ? C.spark : C.ember;
      ctx.fillRect(cx - 10 + i * 8, rowY + 2, 2, 2);
    }
  }
  if (k.p > 0.9 || k.p < 0.08) {
    const cx = GX + k.x - 16;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i % 2 ? C.spark : C.cyan;
      ctx.fillRect(cx - 10 + i * 8, rowY2 + 2, 2, 2);
    }
  }

  // 进度条
  const barW = GRID_W;
  ctx.fillStyle = C.line;
  ctx.fillRect(GX, H - 22, barW, 3);
  ctx.fillStyle = C.ember;
  ctx.fillRect(GX, H - 22, barW * (progressM / HOLDS[0]) * 0.5, 3);
  ctx.fillStyle = C.cyan;
  ctx.fillRect(GX + barW - barW * (progressK / HOLDS[1]) * 0.5, H - 22, barW * (progressK / HOLDS[1]) * 0.5, 3);

  // 相遇火花
  if (m.idx >= HOLDS[0] && k.idx >= HOLDS[1]) {
    const cx = GX + GRID_W / 2;
    for (let i = 0; i < 6; i++) {
      const ang = t * 4 + i * 1.05;
      ctx.fillStyle = i % 2 ? C.spark : C.gold;
      ctx.fillRect(Math.round(cx + Math.cos(ang) * 18), Math.round(rowY - 20 + Math.sin(ang) * 10), 2, 2);
    }
  }
}

/* ---------- 主流程 ---------- */
const grid = await loadCalendar();
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
const cycle = HOLDS[0] * HOP + 0.9;
const frames = Math.round(cycle * FPS);

const framesBuf = [];
for (let f = 0; f < frames; f++) {
  renderHop(ctx, (f / FPS) % cycle, grid, null);
  const { data } = ctx.getImageData(0, 0, W, H);
  framesBuf.push(Buffer.from(data));
}
console.log('frames:', frames, 'at', FPS, 'fps, cycle', cycle.toFixed(2), 's');

const sample = [];
for (let i = 0; i < framesBuf.length; i += Math.max(1, Math.floor(framesBuf.length / 30))) sample.push(framesBuf[i]);
const palette = quantize(Buffer.concat(sample), 256, { format: 'rgb565' });

const gif = GIFEncoder();
for (const f of framesBuf) {
  gif.writeFrame(applyPalette(f, palette, 'rgb565'), W, H, { palette, delay: Math.round(1000 / FPS) });
}
gif.finish();
const gifBuf = Buffer.from(gif.bytes());
fs.writeFileSync(path.join(root, '../profile/hop.gif'), gifBuf);
await sharp(gifBuf, { animated: true }).webp({ lossless: true, effort: 6 })
  .toFile(path.join(root, '../profile/hop.webp'));
const ws = fs.statSync(path.join(root, '../profile/hop.webp')).size;
console.log('GIF ', (gifBuf.length / 1024).toFixed(0), 'KB');
console.log('WEBP', (ws / 1024).toFixed(0), 'KB  (' + (gifBuf.length / ws).toFixed(1) + 'x smaller)');

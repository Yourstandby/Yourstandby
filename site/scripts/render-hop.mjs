/* 马里奥式踩踏：两人在贡献热力格上随机跳跃，带蓄力 / 滞空 / 落地缓冲。
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
const MAGE_ROW = 3, KNIGHT_ROW = 4;

/* 浅色纸底，和 README 卡片同色，不再是黑块 */
const C = {
  paper: '#FFF4EC', gridEmpty: '#E9DACD', line: '#D9C8BA',
  text: '#5C3A32', textDim: '#9A8074',
  lvl1: '#C9B5A6', lvl2: '#E8A17F', lvl3: '#D8563C', lvl4: '#C81E00',
  hit: '#FFB000', ember: '#C81E00', cyan: '#0A6E8A', spark: '#FF8A3D'
};
const RAMP = [C.gridEmpty, C.lvl1, C.lvl2, C.lvl3, C.lvl4];

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
  return json.data.user.contributionsCollection.contributionCalendar.weeks
    .map((w) => w.contributionDays.map((d) => d.contributionCount));
}

/* ---------- 随机但可复现 ---------- */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 生成一条跳跃路径：步长 1-3 格随机、高度与时长都抖动，终点固定 */
function planPath(from, to, seed) {
  const rnd = mulberry32(seed);
  const dir = Math.sign(to - from);
  const jumps = [];
  let cur = from;
  while (cur !== to) {
    const remain = Math.abs(to - cur);
    let step = 1 + Math.floor(rnd() * 3);
    step = Math.min(step, remain);
    jumps.push({
      from: cur,
      to: cur + dir * step,
      dur: 0.30 + rnd() * 0.16,      // 0.30 - 0.46s
      height: 10 + rnd() * 8,        // 10 - 18px
      pause: rnd() < 0.25 ? 0.10 : 0 // 偶尔在落地后停一拍
    });
    cur += dir * step;
  }
  return jumps;
}

/* 把两条路径的总时长拉齐，保证同时抵达中列 */
function align(tracks) {
  const total = (t) => t.reduce((s, j) => s + j.dur + j.pause, 0);
  const max = Math.max(...tracks.map(total));
  for (const t of tracks) {
    const k = max / total(t);
    for (const j of t) { j.dur *= k; j.pause *= k; }
  }
  return max;
}

/* ---------- 姿态 ---------- */
const CROUCH = 0.14;   // 蓄力占比
const LAND = 0.84;     // 触地时刻

function poseAt(p) {
  // 返回 { squash, height }
  // 形变上限压到 ±10%，角色造型不会被压走样；力度靠平台下沉和尘土表达
  if (p < CROUCH) {
    const q = p / CROUCH;
    return { squash: 1 - 0.09 * Math.sin(q * Math.PI * 0.5), height: 0, crouch: q };
  }
  if (p > LAND) {
    const q = Math.min(1, (p - LAND) / (1 - LAND));
    const squash = q < 0.5 ? 0.91 + (1.01 - 0.91) * (q / 0.5)
                           : 1.01 - 0.01 * ((q - 0.5) / 0.5);
    return { squash, height: 0, land: q };
  }
  const q = (p - CROUCH) / (LAND - CROUCH);   // 0..1 飞行段
  // sin^0.62 让顶部更平 → 明显的滞空
  const arc = Math.pow(Math.sin(Math.PI * q), 0.62);
  return { squash: q < 0.12 ? 0.91 + 0.09 * (q / 0.12) : 1, height: arc };
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

function drawShadow(ctx, x, rowY, heightRatio) {
  const w = Math.max(6, Math.round(16 - heightRatio * 8));
  ctx.fillStyle = 'rgba(92,58,50,0.22)';
  ctx.fillRect(Math.round(x + 16 - w / 2), rowY + CELL + 2, w, 2);
}

/* ---------- 主渲染 ---------- */
let grid, trackM, trackK, TOTAL;

function stateAt(t, track, startCol) {
  let acc = 0;
  let col = startCol;
  for (let i = 0; i < track.length; i++) {
    const j = track[i];
    const span = j.dur + j.pause;
    const landedAt = acc + j.dur;      // 本次跳跃的触地时刻
    if (t <= acc + span) {
      const local = Math.min(1, Math.max(0, (t - acc) / j.dur));
      const endCol = t > landedAt ? j.to : col + (j.to - col) * local;
      const pose = t > landedAt ? { squash: 1, height: 0 } : poseAt(local);
      return { col: endCol, pose, landedAt };
    }
    acc += span;
    col = j.to;
  }
  return { col, pose: { squash: 1, height: 0 }, landedAt: acc };
}

/* 落地后 0.2s 内平台被踩下的深度（0..1） */
function pressOf(t, landedAt) {
  const q = (t - landedAt) / 0.2;
  if (q < 0 || q > 1) return 0;
  return Math.sin((1 - q) * Math.PI * 0.5);
}

function renderHop(ctx, t) {
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, W, H);

  // 标题点阵
  ctx.fillStyle = C.textDim;
  for (let i = 0; i < 4; i++) ctx.fillRect(GX + i * 6, 22, 4, 4);
  ctx.fillStyle = C.line;
  ctx.fillRect(GX, 34, GRID_W, 1);

  const m = stateAt(t, trackM, 0);
  const k = stateAt(t, trackK, COLS - 1);
  const mPress = m.col % 1 < 0.02 ? pressOf(t, m.landedAt) : 0;
  const kPress = k.col % 1 > 0.98 ? pressOf(t, k.landedAt) : 0;

  // 网格：踩过的行段提亮
  const mCol = Math.min(COLS - 1, Math.round(m.col));
  const kCol = Math.max(0, Math.round(k.col));
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const count = (grid[c] && grid[c][r]) || 0;
      let lvl = count <= 0 ? 0 : count < 3 ? 1 : count < 6 ? 2 : count < 10 ? 3 : 4;
      const stepped = (r === MAGE_ROW && c <= mCol) || (r === KNIGHT_ROW && c >= kCol);
      if (stepped && lvl < 2) lvl = 2;
      const x = GX + c * (CELL + GAP);
      const y = GY + r * (CELL + GAP);
      // 被踩中的那一格向下压扁
      let sink = 0;
      if (r === MAGE_ROW && c === mCol) sink = Math.round(mPress * 3);
      if (r === KNIGHT_ROW && c === kCol) sink = Math.round(kPress * 3);
      ctx.fillStyle = RAMP[lvl];
      ctx.fillRect(x, y + sink, CELL, CELL - sink);
      if (sink > 0) {
        ctx.fillStyle = C.hit;
        ctx.fillRect(x, y + sink, CELL, 1);
      }
    }
  }

  const mRowY = GY + MAGE_ROW * (CELL + GAP);
  const kRowY = GY + KNIGHT_ROW * (CELL + GAP);
  const mX = GX + m.col * (CELL + GAP);
  const kX = GX + k.col * (CELL + GAP) - 32;

  // 角色脚底跟着平台一起下沉；落地再多沉 1px，制造受力感
  const mLand = m.pose.land ? Math.round((1 - m.pose.land) * 2) : 0;
  const kLand = k.pose.land ? Math.round((1 - k.pose.land) * 2) : 0;
  const mSink = Math.round(mPress * 3) + mLand;
  const kSink = Math.round(kPress * 3) + kLand;
  drawShadow(ctx, mX, mRowY + mSink, m.pose.height / 18);
  drawHero(ctx, 'mage', mX, mRowY - 32 + mSink - m.pose.height, m.pose.squash);

  drawShadow(ctx, kX, kRowY + kSink, k.pose.height / 18);
  drawHero(ctx, 'knight', kX, kRowY - 32 + kSink - k.pose.height, k.pose.squash);

  // 落地尘土：代替被压扁的角色本体
  if (mPress > 0.2) {
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i % 2 ? C.lvl2 : C.lvl1;
      ctx.fillRect(mX + 4 + i * 9, mRowY + 4 + (i % 2) * 2, 2, 2);
    }
  }
  if (kPress > 0.2) {
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i % 2 ? C.lvl2 : C.lvl1;
      ctx.fillRect(kX + 6 + i * 9, kRowY + 4 + (i % 2) * 2, 2, 2);
    }
  }

  // 底部进度条
  const barY = H - 20;
  ctx.fillStyle = C.line;
  ctx.fillRect(GX, barY, GRID_W, 3);
  const pm = m.col / (COLS - 1);
  const pk = 1 - k.col / (COLS - 1);
  ctx.fillStyle = C.ember;
  ctx.fillRect(GX, barY, GRID_W * 0.5 * pm, 3);
  ctx.fillStyle = C.cyan;
  ctx.fillRect(GX + GRID_W - GRID_W * 0.5 * pk, barY, GRID_W * 0.5 * pk, 3);

  // 会合火花
  if (t > TOTAL - 0.9) {
    const cx = GX + GRID_W / 2;
    for (let i = 0; i < 7; i++) {
      const ang = t * 5 + i * 0.9;
      ctx.fillStyle = i % 2 ? C.hit : C.spark;
      ctx.fillRect(Math.round(cx + Math.cos(ang) * 20), Math.round(mRowY - 24 + Math.sin(ang) * 11), 2, 2);
    }
  }
}

/* ---------- 主流程 ---------- */
grid = await loadCalendar();
trackM = planPath(0, 26, 20261122);
trackK = planPath(52, 26, 77712345);
const travel = align([trackM, trackK]);
const cycle = travel + 1.1;
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
console.log('frames:', frames, 'at', FPS, 'fps, cycle', cycle.toFixed(2) + 's,',
  'mage jumps', trackM.length, 'knight jumps', trackK.length);

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

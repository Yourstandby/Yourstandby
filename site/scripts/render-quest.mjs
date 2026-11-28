/* 在 Node 里跑同一份 quest.js，把整段闯关渲染成帧，输出 GIF 与动画 WebP。
   用法：node scripts/render-quest.mjs [fps] */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import gifenc from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifenc;
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const FPS = Number(process.argv[2] || 12);

const SPR = JSON.parse(fs.readFileSync(path.join(root, 'public/sprites.json'), 'utf8'));
// 关卡表可能还没被 sync 复制过（CI 里直接跑本脚本），先兜底复制一份
const questPub = path.join(root, 'public/quest.json');
if (!fs.existsSync(questPub)) {
  fs.copyFileSync(path.join(root, '..', 'design', 'quest.json'), questPub);
}
const QUEST = JSON.parse(fs.readFileSync(questPub, 'utf8'));
const src = fs.readFileSync(path.join(root, 'public/quest.js'), 'utf8');

const canvas = createCanvas(640, 180);
const ctx = canvas.getContext('2d');
const canvasEl = {
  width: 640, height: 180,
  getContext: () => ctx,
  getAttribute: () => '',
  addEventListener() {}
};

const win = { matchMedia: () => ({ matches: false }), };
const g = {
  document: { getElementById: (id) => (id === 'quest-canvas' ? canvasEl : null) },
  window: win,
  location: { search: '?k=0&t=0' },
  fetch: (url) => Promise.resolve({ json: () => Promise.resolve(String(url).includes('quest.json') ? QUEST : SPR) }),
  requestAnimationFrame: () => {},
  URLSearchParams,
  IntersectionObserver: undefined
};
new Function('document', 'window', 'location', 'fetch', 'requestAnimationFrame', 'URLSearchParams', 'IntersectionObserver', src)(
  g.document, g.window, g.location, g.fetch, g.requestAnimationFrame, URLSearchParams, undefined);

await new Promise((r) => setTimeout(r, 60));
const R = win.__QUEST_RENDER__;
const INFO = win.__QUEST_INFO__;
if (!R) throw new Error('__QUEST_RENDER__ missing');

const frames = [];
const step = 1 / FPS;
const grab = () => {
  const { data } = ctx.getImageData(0, 0, 640, 180);
  frames.push(Buffer.from(data));
};

for (let k = 0; k < INFO.stages; k++) {
  for (let t = 0; t < INFO.total; t += step) { R({ k, t }); grab(); }
}
for (let t = 0; t < INFO.meet + 2.8; t += step) { R({ meet: 1, t }); grab(); }

console.log('frames:', frames.length, 'at', FPS, 'fps');

// 全局调色板：像素风颜色数远小于 256，取所有帧的并集量化一次，避免逐帧色偏
const sample = [];
for (let i = 0; i < frames.length; i += Math.max(1, Math.floor(frames.length / 40))) sample.push(frames[i]);
const merged = Buffer.concat(sample);
const palette = quantize(merged, 256, { format: 'rgb565' });
console.log('palette size:', palette.length / 3);

const gif = GIFEncoder();
for (const f of frames) {
  gif.writeFrame(applyPalette(f, palette, 'rgb565'), 640, 180, { palette, delay: Math.round(1000 / FPS) });
}
gif.finish();
const gifBuf = Buffer.from(gif.bytes());
const gifPath = path.join(root, '..', 'profile', 'quest.gif');
fs.writeFileSync(gifPath, gifBuf);
console.log('GIF   ', (gifBuf.length / 1024).toFixed(0) + ' KB', gifPath);

// 动画 WebP：无损（像素画无损压缩率极高）与有损各出一份对比
const losslessPath = path.join(root, '..', 'profile', 'quest.webp');
// 有损版只是给人看体积对比的中间产物，写到 .tmp/（已 gitignore），不进发布目录
const lossyPath = path.join(root, '..', '.tmp', 'quest-lossy.webp');
fs.mkdirSync(path.dirname(lossyPath), { recursive: true });
await sharp(gifBuf, { animated: true }).webp({ lossless: true, effort: 6 }).toFile(losslessPath);
await sharp(gifBuf, { animated: true }).webp({ quality: 88, effort: 6 }).toFile(lossyPath);
const ls = fs.statSync(losslessPath).size, ly = fs.statSync(lossyPath).size;
console.log('WEBP  ', (ls / 1024).toFixed(0) + ' KB lossless → ' + (gifBuf.length / ls).toFixed(1) + '× 更小');
console.log('WEBP  ', (ly / 1024).toFixed(0) + ' KB q88      → ' + (gifBuf.length / ly).toFixed(1) + '× 更小');

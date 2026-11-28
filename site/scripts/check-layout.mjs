/* 排版回归检查：真的开一个无头浏览器，量「有没有被裁掉的内容 / 有没有把文档撑宽」。
   双语化之后英文比中文长，1280×720 那块固定画布和 390px 窄屏最容易出问题，所以固化成脚本。

   用法：
     npm run preview          # 另开一个终端，跑在 http://localhost:4321/Yourstandby/
     npm run check:layout     # 退出码非 0 就是有元素被裁/溢出
   参数：node scripts/check-layout.mjs <url> [宽度,宽度,...]                      */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL = process.argv[2] || 'http://localhost:4321/Yourstandby/';
const WIDTHS = (process.argv[3] || '1600,1440,1280,390').split(',').map(Number);
const LANGS = ['en', 'zh'];
const PORT = 9411;

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean);
const BROWSER = CANDIDATES.find((p) => fs.existsSync(p));
if (!BROWSER) {
  console.error('找不到 Chrome / Edge，设 CHROME_PATH 指过去');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ys-layout-'));
const browser = spawn(BROWSER, [
  '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', 'about:blank'
], { stdio: 'ignore' });

async function endpoint() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error('浏览器调试端口没起来');
}

const ws = new WebSocket(await endpoint());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);
  msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
};
const send = (method, params = {}) => {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
};

/* 判据只有两条：
   1. 容器 scrollWidth/scrollHeight 超过自身 → 内容被裁（固定画布里 overflow:hidden 会吃掉多余部分）
   2. 文档 scrollWidth 超过视口 → 整页横向滚，说明有叶子节点顶出去了 */
const MEASURE = `(() => {
  const cw = document.documentElement.clientWidth;
  const clipped = [];
  document.querySelectorAll('.panel, .card, .trk, .sec__head, .stage__cap, .hero').forEach((el) => {
    const v = el.scrollHeight - el.clientHeight;
    const h = el.scrollWidth - el.clientWidth;
    if (v > 1 || h > 1) clipped.push({ cls: String(el.className || '').slice(0, 34), v, h });
  });
  const wide = [];
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.right <= cw + 1) return;
    if (el.parentElement.getBoundingClientRect().right > cw + 1) return;
    wide.push({ cls: String(el.className || el.tagName).slice(0, 30), right: Math.round(r.right) });
  });
  return JSON.stringify({
    overflowX: document.documentElement.scrollWidth - cw,
    dash: (() => { const d = document.querySelector('.dash'); return d ? [Math.round(d.getBoundingClientRect().width), Math.round(d.getBoundingClientRect().height)] : null; })(),
    clipped, wide: wide.slice(0, 5)
  });
})()`;

let failed = 0;
for (const width of WIDTHS) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 1400, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL });
  for (let i = 0; i < 40; i++) {
    if (await evalJs('document.readyState === "complete" && document.querySelectorAll(".panel").length > 4')) break;
    await sleep(200);
  }
  await evalJs('document.fonts.ready.then(() => true)');
  await sleep(500);

  for (const lang of LANGS) {
    await evalJs(`document.documentElement.setAttribute('data-lang','${lang}')`);
    await sleep(250);
    const r = JSON.parse(await evalJs(MEASURE));
    const bad = r.clipped.length + r.wide.length + (r.overflowX > 1 ? 1 : 0);
    if (bad) failed++;
    const label = `${lang}@${width}`;
    console.log(
      (bad ? 'FAIL ' : 'ok   ') + label.padEnd(9) +
      ' dash=' + JSON.stringify(r.dash) + ' overflowX=' + r.overflowX +
      (r.clipped.length ? '\n       clipped: ' + r.clipped.map((c) => `${c.cls}(h+${c.h} v+${c.v})`).join(', ') : '') +
      (r.wide.length ? '\n       wide: ' + r.wide.map((w) => w.cls).join(', ') : '')
    );
  }
}

ws.close();
browser.kill();
console.log(failed ? `\n${failed} 个视口/语言组合有排版问题` : '\n全部视口 × 语言都没有裁切或横向溢出');
process.exit(failed ? 1 : 0);

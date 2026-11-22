import { readFile, writeFile } from 'node:fs/promises';
const p = 'dist/index.html';
let s = await readFile(p, 'utf8');
const probe = `<script>
window.addEventListener('load', () => setTimeout(() => {
  const box = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
  const panels = [...document.querySelectorAll('.dash > *')].map((el) => ({
    cls: el.className.replace(/\s+/g, '.').slice(0, 30),
    box: [Math.round(el.getBoundingClientRect().width), Math.round(el.getBoundingClientRect().height)],
    scroll: [el.scrollWidth, el.scrollHeight]
  }));
  document.title = 'MEASURE' + JSON.stringify({ board: box('.dash'), panels });
}, 500));
</script>`;
s = s.replace('</body>', probe + '</body>');
await writeFile('dist/_probe.html', s, 'utf8');
console.log('probe written');

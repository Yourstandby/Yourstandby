// 构建前把 design/tokens.css 复制进 src/styles，避免 CSS 跨项目根 @import 被 Vite 丢弃。
// 单一真源仍是 design/tokens.css（README 的 SVG 卡片也用它）。
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../design/tokens.css');
const out = resolve(here, '../src/styles/_tokens.generated.css');

const css = await readFile(src, 'utf8');
const banner = '/* 自动生成，请勿手改。源文件：design/tokens.css */\n';
await writeFile(out, banner + css, 'utf8');
console.log('tokens synced:', out);

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

// 技术栈数据同样只有一份：design/stack.json，卡片脚本和站点都读它
const stackSrc = resolve(here, '../../design/stack.json');
const stackOut = resolve(here, '../src/data/stack.generated.json');
await writeFile(stackOut, await readFile(stackSrc, 'utf8'), 'utf8');
console.log('stack synced:', stackOut);

const spritesSrc = resolve(here, '../../design/sprites.json');
const spritesOut = resolve(here, '../src/data/sprites.generated.json');
await writeFile(spritesOut, await readFile(spritesSrc, 'utf8'), 'utf8');
await writeFile(resolve(here, '../public/sprites.json'), await readFile(spritesSrc, 'utf8'), 'utf8');
const questSrc = resolve(here, '../../design/quest.json');
await writeFile(resolve(here, '../public/quest.json'), await readFile(questSrc, 'utf8'), 'utf8');
console.log('sprites synced:', spritesOut, '+ public/sprites.json');

const playerSrc = resolve(here, '../../design/player.json');
const playerOut = resolve(here, '../src/data/player.generated.json');
await writeFile(playerOut, await readFile(playerSrc, 'utf8'), 'utf8');
console.log('player synced:', playerOut);

/* 从 simple-icons 提取技术栈需要的官方图标（24x24 path），写成 design/icons.json。
   改了技术栈后重跑：node scripts/extract-icons.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as si from 'simple-icons';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../design/icons.json');

const NEED = [
  'typescript', 'python', 'rust', 'dotnet', 'go',  // simple-icons 没有 csharp，用 .NET 官方图标代表 C#
  'react', 'astro', 'css',
  'nodedotjs', 'fastapi', 'postgresql',
  'git', 'docker', 'githubactions',
  'svg', 'figma', 'framer'
];

const icons = {};
for (const slug of NEED) {
  const icon = Object.values(si).find((i) => i && i.slug === slug);
  if (!icon) { console.log('MISSING', slug); continue; }
  icons[slug] = { title: icon.title, hex: '#' + icon.hex, path: icon.path };
}
fs.writeFileSync(out, JSON.stringify(icons, null, 1) + '\n');
console.log('icons:', Object.keys(icons).length, '->', out);

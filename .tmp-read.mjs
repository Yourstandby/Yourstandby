
import fs from 'fs';
function tpl(f){let s=fs.readFileSync(f,'utf8');return s.replace(/<style[\s\S]*?<\/style>/g,'[STYLE...]');}
console.log('##### Inventory.astro\n'+tpl('site/src/components/Inventory.astro'));
console.log('##### pixel.css (grep)\n');
const css=fs.readFileSync('site/src/styles/pixel.css','utf8');
css.split(/\r?\n/).forEach((l,i)=>{ if(/font-face|--font|skip|\.nav|@media \(prefers|^html|:root|body\s*\{/.test(l)) console.log((i+1)+': '+l); });
console.log('##### quest.json diff');
const a=fs.readFileSync('design/quest.json','utf8'), b=fs.readFileSync('site/public/quest.json','utf8');
console.log(a===b ? 'IDENTICAL' : 'DIFFERENT');
console.log('##### design/quest.json\n'+a);

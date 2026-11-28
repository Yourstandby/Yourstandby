// 与 astro.config.mjs 的 base 保持一致（GitHub 项目页子路径）
export const base = '/Yourstandby';

import stackData from './stack.generated.json';
// 等级 / HP 只有一份真源：design/player.json，CI 每天按 GitHub 数据回写后同步到这里
import playerData from './player.generated.json';

// 文案（会随语言切换的部分）在 src/i18n/copy.ts，这里只留不需要翻译的数据
export const site = {
  name: "Yourstandby",
  email: "YOUR_EMAIL",
  url: "https://yourstandby.github.io",
  github: "https://github.com/Yourstandby",
  level: playerData.level,
  hp: Number(playerData.combat.mage[0][1]),
  hpMax: Number(playerData.hp_max ?? 10),
  stack: stackData
};

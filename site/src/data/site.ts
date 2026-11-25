// 与 astro.config.mjs 的 base 保持一致（GitHub 项目页子路径）
export const base = '/Yourstandby';

import stackData from './stack.generated.json';
// 等级 / HP 只有一份真源：design/player.json，CI 每天按 GitHub 数据回写后同步到这里
import playerData from './player.generated.json';

export const site = {
  name: "Yourstandby",
  tagline: "把想法烧成可以跑起来的东西",
  email: "YOUR_EMAIL",
  url: "https://yourstandby.github.io",
  github: "https://github.com/Yourstandby",
  level: playerData.level,
  hp: Number(playerData.combat.mage[0][1]),
  hpMax: 10,
  stack: stackData,
  projects: [
    { name: "PiForge", repo: "https://github.com/Yourstandby/PiForge", desc: "把 Pi Coding Agent 装进一张安静的三栏工作台：本地优先、多会话、缓存感知。", tag: "DESKTOP" },
    { name: "raea", repo: "https://github.com/Yourstandby/raea", desc: "用 React + TypeScript 描述视频、动效、3D 与游戏，在自己的 GPU 上渲染。", tag: "RENDER" },
    { name: "rust-anything", repo: "https://github.com/Yourstandby/rust-anything", desc: "一次一个模块地把整个应用改写成 Rust，每步都对照原程序录制的行为验证。", tag: "TOOLING" },
    { name: "SAG-Wiki", repo: "https://github.com/Yourstandby/SAG-Wiki", desc: "面向人和 agent 的轻量知识库，索引极快、检索极准。", tag: "KNOWLEDGE" }
  ],
  nav: [
    { href: "/#about", label: "About" },
    { href: "/#stack", label: "Stack" },
    { href: "/#projects", label: "Projects" },
    { href: "/notes/", label: "Notes" },
    { href: "/#connect", label: "Connect" }
  ]
};

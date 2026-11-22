// 与 astro.config.mjs 的 base 保持一致（GitHub 项目页子路径）
export const base = '/Yourstandby';

export const site = {
  name: "Yourstandby",
  tagline: "把想法烧成可以跑起来的东西",
  email: "YOUR_EMAIL",
  url: "https://yourstandby.github.io",
  github: "https://github.com/Yourstandby",
  level: 3,
  hp: 7,
  hpMax: 10,
  stack: [
    { label: "LANGUAGES", value: "TypeScript / Python / Go", pct: 14, max: 18 },
    { label: "FRONTEND", value: "React / Astro / 原生 CSS", pct: 12, max: 18 },
    { label: "BACKEND", value: "Node / FastAPI / Postgres", pct: 10, max: 18 },
    { label: "TOOLING", value: "Git / Docker / Actions", pct: 13, max: 18 },
    { label: "DESIGN", value: "像素风 / SVG / 动效", pct: 14, max: 18 }
  ],
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

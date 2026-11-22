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
    { name: "YOUR_PROJECT_1", repo: "https://github.com/Yourstandby/YOUR_REPO_1", desc: "一句话说清它解决什么问题。", tag: "TODO" },
    { name: "YOUR_PROJECT_2", repo: "https://github.com/Yourstandby/YOUR_REPO_2", desc: "一句话说清它解决什么问题。", tag: "TODO" }
  ],
  nav: [
    { href: "/#about", label: "About" },
    { href: "/#stack", label: "Stack" },
    { href: "/#projects", label: "Projects" },
    { href: "/notes/", label: "Notes" },
    { href: "/#connect", label: "Connect" }
  ]
};

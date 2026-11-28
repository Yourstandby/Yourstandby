import type { Lang } from './lang.ts';

/** 一条文案的两版：en 是默认展示，zh 是可选切换。 */
export interface Bilingual { en: string; zh: string }

/**
 * 站点全部可见文案的唯一来源。
 * 约定：英文在前（默认语言），中文在后；标点用各自语言的习惯。
 * 需要插值的写成 \`{key}\`，由 pair(k, vars) 替换。
 */
export const copy = {
  meta: {
    // <meta name="description"> 与分享摘要
    description: {
      en: 'Materials science by training, AI research by trade. Papers by day, ideas hammered into working software by night.',
      zh: '材料专业出身，现在做 AI 研究。白天读论文，晚上把想法烧成能跑、能用的东西。'
    }
  },

  a11y: {
    skip: { en: 'Skip to content', zh: '跳到主内容' },
    mainNav: { en: 'Main navigation', zh: '主导航' },
    langSwitch: { en: 'Language', zh: '语言' },
    ember: { en: 'Pixel flame', zh: '像素火焰' },
    avatar: { en: '{name} avatar', zh: '{name}头像' },
    contrib: { en: 'Daily commit heatmap for the last 365 days, dungeon palette', zh: '过去一年每日提交热力图，地牢配色' },
    trials: {
      en: 'Split-screen trial animation: the same scene on both sides, the mage casting spells and the knight with sword and shield, each crossing five environments before meeting in the middle',
      zh: '双屏闯关动画：左右两侧同一场景，鸡毛法师用法术、小白战士用剑盾，各自通过五种环境后在中央相遇'
    },
    progress: { en: 'Progress {pct}%', zh: '进度 {pct}%' }
  },

  hero: {
    kicker: { en: 'BUILDING IN PUBLIC SINCE 2026', zh: '2026 起公开建造中' },
    tagline: { en: 'Burning ideas into things that run', zh: '把想法烧成可以跑起来的东西' },
    bio: {
      en: 'Materials science by training, AI research by trade. I like to understand how a thing works before I touch it: papers by day, ideas hammered into working software by night.',
      zh: '材料专业出身，现在做 AI 研究。习惯先搞清楚原理再动手：白天读论文，晚上把想法烧成能跑、能用的东西。'
    },
    readLog: { en: 'Read the log', zh: '读手账' }
  },

  nav: [
    { href: '/#about', label: { en: 'About', zh: '关于' } },
    { href: '/#stack', label: { en: 'Stack', zh: '技术栈' } },
    { href: '/#projects', label: { en: 'Projects', zh: '项目' } },
    { href: '/notes/', label: { en: 'Notes', zh: '手账' } },
    { href: '/#connect', label: { en: 'Connect', zh: '联系' } }
  ],

  sections: {
    dashboard: { en: 'DASHBOARD', zh: '面板' },
    trials: { en: 'TEN TRIALS', zh: '十重试炼' },
    stack: { en: 'STACK', zh: '技术栈' },
    projects: { en: 'PROJECTS', zh: '项目' },
    notes: { en: 'NOTES', zh: '手账' }
  },

  panels: {
    party: { en: 'PARTY', zh: '队伍' },
    player: { en: 'PLAYER', zh: '角色存档' },
    comms: { en: 'COMMS', zh: '通讯' },
    questLog: { en: 'QUEST LOG', zh: '任务日志' },
    inventory: { en: 'INVENTORY', zh: '装备' },
    battleLog: { en: 'BATTLE LOG', zh: '战斗日志' },
    contrib: { en: 'CONTRIBUTIONS · LAST 365 DAYS', zh: '贡献 · 近一年' },
    trials: { en: 'THE TEN TRIALS · TWO SCREENS', zh: 'THE TEN TRIALS · 双屏' },
    allLogs: { en: 'ALL LOGS →', zh: '全部手账 →' },
    online: { en: 'ONLINE', zh: '在线' }
  },

  party: {
    mage: { en: 'Feather Mage', zh: '鸡毛法师' },
    knight: { en: 'Snow Knight', zh: '小白战士' }
  },

  stackLabels: {
    LANGUAGES: { en: 'LANGUAGES', zh: '语言' },
    FRONTEND: { en: 'FRONTEND', zh: '前端' },
    BACKEND: { en: 'BACKEND', zh: '后端' },
    TOOLING: { en: 'TOOLING', zh: '工具链' },
    DESIGN: { en: 'DESIGN', zh: '设计' }
  },

  statsLabels: {
    CODE: { en: 'CODE', zh: '代码' },
    DESIGN: { en: 'DESIGN', zh: '设计' },
    SYSTEMS: { en: 'SYSTEMS', zh: '系统' },
    CURIOUS: { en: 'CURIOUS', zh: '好奇心' }
  },

  status: {
    cleared: { en: 'CLEARED', zh: '已通关' },
    active: { en: 'ACTIVE', zh: '进行中' },
    locked: { en: 'LOCKED', zh: '未解锁' }
  },
  questLog: {
    clearedCount: { en: 'CLEARED {n}/{m}', zh: '已通关 {n}/{m}' }
  },

  // 顺序与 design/player.json 的 quests / inventory 一一对应
  questNames: [
    { en: 'Personal pixel-art homepage', zh: '个人像素主题主页' },
    { en: 'Pixel asset kit: palette / grid / sprites', zh: '像素资产库：色板 / 网格 / 精灵' },
    { en: 'A Rust or Go CLI I actually reach for', zh: '用 Rust 或 Go 写一个顺手的 CLI' },
    { en: 'Make the visualization project something shareable', zh: '把可视化项目做成可分享的作品' },
    { en: "Turn a paper's idea into a running prototype", zh: '把一篇论文的想法做成能跑的原型' }
  ] as Bilingual[],
  inventoryDesc: [
    { en: 'Takes notes when a game clicks', zh: '玩通了会做笔记' },
    { en: '16×16 sprite work', zh: '16×16 精灵图' },
    { en: 'Takes it apart to see why it works', zh: '拆开看看原理' },
    { en: 'The length of one pour-over', zh: '一杯手冲的时间' }
  ] as Bilingual[],

  // key 与 quest.json 的 env 对齐，quest.js 在运行时也读这份
  stages: {
    snow: {
      place: { en: 'Snowfield', zh: '雪原' },
      l: { en: 'Staff taps the ground, an ice wall holds the avalanche', zh: '法杖点地，冰墙挡住雪崩' },
      r: { en: 'Shield as a sled, rides under the avalanche', zh: '盾当滑板，从雪崩底下冲过' }
    },
    forest: {
      place: { en: 'Deep forest', zh: '原始森林' },
      l: { en: 'Sparks off the staff tip, the vipers back off', zh: '杖头迸火星，毒蛇退散' },
      r: { en: 'One wide slash cuts vines and snakes together', zh: '横扫一剑，藤蔓和蛇一起断' }
    },
    desert: {
      place: { en: 'Desert', zh: '沙漠' },
      l: { en: 'Condenses a water orb, drags himself up to drink', zh: '凝出水球，拖着身子喝下去' },
      r: { en: 'Plants the greatsword for shade, follows the glare to an oasis', zh: '大剑插沙遮阴，反光找到绿洲' }
    },
    quarry: {
      place: { en: 'Quarry', zh: '石坑' },
      l: { en: 'Petrify hex pins the pursuers in place', zh: '石化咒把追兵定在原地' },
      r: { en: "Shield boss smashes the golem's knees", zh: '盾面撞碎石人的膝盖' }
    },
    water: {
      place: { en: 'Seafloor', zh: '水底' },
      l: { en: 'Casts a breathing ward, wrapped in a bubble', zh: '撑开呼吸法阵，气泡裹身' },
      r: { en: 'Greatsword stirs a vortex to ride upward', zh: '大剑搅出涡流借力上浮' }
    }
  },

  notes: {
    title: { en: 'TECH LOG', zh: '技术手账' },
    desc: { en: 'One short post a week: specific, and only about the traps I actually fell into.', zh: '每周一篇，短、具体、只写自己真踩过的坑。' },
    back: { en: '← Back to the log', zh: '← 返回手账' },
    untranslated: { en: 'This entry is written in Chinese only.', zh: '本篇只有中文版。' }
  },

  projects: [
    {
      name: 'PiForge', tag: 'DESKTOP', repo: 'https://github.com/Yourstandby/PiForge',
      desc: { en: 'Puts the Pi Coding Agent inside one quiet three-column workbench: local-first, multi-session, cache-aware.', zh: '把 Pi Coding Agent 装进一张安静的三栏工作台：本地优先、多会话、缓存感知。' }
    },
    {
      name: 'raea', tag: 'RENDER', repo: 'https://github.com/Yourstandby/raea',
      desc: { en: 'Describe video, motion, 3D and games in React + TypeScript, rendered on your own GPU.', zh: '用 React + TypeScript 描述视频、动效、3D 与游戏，在自己的 GPU 上渲染。' }
    },
    {
      name: 'rust-anything', tag: 'TOOLING', repo: 'https://github.com/Yourstandby/rust-anything',
      desc: { en: 'Rewrite a whole app in Rust one unit at a time, each step checked against behavior recorded from the original.', zh: '一次一个模块地把整个应用改写成 Rust，每步都对照原程序录制的行为验证。' }
    },
    {
      name: 'SAG-Wiki', tag: 'KNOWLEDGE', repo: 'https://github.com/Yourstandby/SAG-Wiki',
      desc: { en: 'A lightweight knowledge base for humans and agents: index fast, retrieve precisely.', zh: '面向人和 agent 的轻量知识库，索引极快、检索极准。' }
    }
  ] as { name: string; tag: string; repo: string; desc: Bilingual }[]
} as const;

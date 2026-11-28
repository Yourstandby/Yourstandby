import { copy, type Bilingual } from './copy.ts';

export type Lang = 'en' | 'zh';
export const LANGS: readonly Lang[] = ['en', 'zh'];
/** 默认英文；中文只在用户主动切换（或 localStorage 里记着）时出现 */
export const DEFAULT_LANG: Lang = 'en';
export const LANG_KEY = 'ys.lang';
export const LANG_EVENT = 'langchange';

/** 模板里统一的取值入口：pick('en', 'hero.tagline') 或带插值 pick(lang, 'questLog.clearedCount', { n: 2, m: 5 }) */
export function pair(key: string, vars?: Record<string, string | number>): Bilingual {
  const node = key.split('.').reduce<any>((acc, k) => (acc == null ? acc : acc[k]), copy as any);
  const fill = (raw: string) => {
    if (!vars) return raw;
    return Object.entries(vars).reduce((out, [k, v]) => out.split(`{${k}}`).join(String(v)), raw);
  };
  if (typeof node === 'string') return { en: fill(node), zh: fill(node) };
  return { en: fill(node?.en ?? ''), zh: fill(node?.zh ?? '') };
}

/** 数据驱动的文案（数组 / 对象）按语言取值 */
export function one<T extends Bilingual>(v: T, lang: Lang): string {
  return v[lang];
}

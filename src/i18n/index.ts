import { useEffect, useState } from 'preact/hooks';
import { en, zh, type Lang } from './strings';

export type { Lang };

const KEY = 'wafer-road:lang';
let current: Lang = 'zh-TW';
try {
  const saved = localStorage.getItem(KEY);
  if (saved === 'en' || saved === 'zh-TW') current = saved;
} catch {
  /* storage may be unavailable */
}
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}
export function setLang(l: Lang): void {
  current = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = l === 'en' ? 'en' : 'zh-Hant';
  listeners.forEach((f) => f());
}

export function t(key: string, params?: Record<string, string | number>, lang: Lang = current): string {
  const dict = lang === 'en' ? en : zh;
  let s = dict[key] ?? zh[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Hook: re-renders on language change. */
export function useLang(): Lang {
  const [l, setL] = useState(current);
  useEffect(() => {
    const f = () => setL(current);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  return l;
}

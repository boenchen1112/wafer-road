import { describe, expect, it } from 'vitest';
import { en, zh } from '../src/i18n/strings';

// Raw source text of every UI / online module (resolved at transform time by Vite).
const sources = import.meta.glob('../src/{ui,online}/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('i18n dictionaries', () => {
  it('zh-TW and en define exactly the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
  });

  it('no translation is empty', () => {
    for (const d of [zh, en]) for (const [k, v] of Object.entries(d)) expect([k, v.trim().length > 0]).toEqual([k, true]);
  });

  it('every literal t("key") used by the UI exists in both dictionaries', () => {
    const missing: string[] = [];
    expect(Object.keys(sources).length).toBeGreaterThan(5);
    for (const [file, text] of Object.entries(sources)) {
      // t('key') calls, plus any 'online.*' key literal (covers conditionals like cond ? 'online.a' : 'online.b')
      for (const m of [...text.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g), ...text.matchAll(/'(online\.[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)'/g)]) {
        if (!(m[1] in zh) || !(m[1] in en)) missing.push(`${file}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('dynamic online key families are complete', () => {
    for (const code of ['no_room', 'in_progress', 'room_full', 'not_ready', 'replaced', 'network', 'unconfigured']) {
      expect(zh[`online.fatal.${code}`]).toBeTruthy();
      expect(en[`online.fatal.${code}`]).toBeTruthy();
    }
    for (const code of ['not_host', 'wrong_phase', 'bad_settings', 'seats_open', 'not_your_turn', 'illegal_action', 'rate_limited']) {
      expect(zh[`online.err.${code}`]).toBeTruthy();
      expect(en[`online.err.${code}`]).toBeTruthy();
    }
  });
});

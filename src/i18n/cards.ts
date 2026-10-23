import type { CardKind } from '../engine';
import type { Lang } from './strings';

/** One manifest maps card kind -> art path (relative to the site base). Replace files/paths here to swap art. */
export const CARD_ART: Record<CardKind | 'back' | 'initialWafer', string> = {
  thinFilm: 'cards/thin-film.webp',
  photolithography: 'cards/photolithography.webp',
  doping: 'cards/doping.webp',
  metallization: 'cards/metallization.webp',
  foundry: 'cards/foundry.webp',
  agingEquipment: 'cards/aging-equipment.webp',
  exposureError: 'cards/exposure-error.webp',
  ionImplant: 'cards/ion-implant.webp',
  blackout: 'cards/blackout.webp',
  toxicGas: 'cards/toxic-gas.webp',
  rookieEngineer: 'cards/rookie-engineer.webp',
  blockedExit: 'cards/blocked-exit.webp',
  generator: 'cards/generator.webp',
  emergencyExit: 'cards/emergency-exit.webp',
  yearEndBonus: 'cards/year-end-bonus.webp',
  back: 'cards/back.webp',
  initialWafer: 'cards/initial-wafer.webp',
};

export function artUrl(key: keyof typeof CARD_ART): string {
  return import.meta.env.BASE_URL + CARD_ART[key];
}

export type CardGroup = 'process' | 'regress' | 'event' | 'disaster' | 'protection' | 'function';

interface Meta {
  group: CardGroup;
  name: Record<Lang, string>;
  text: Record<Lang, string>;
}

export const CARD_META: Record<CardKind, Meta> = {
  thinFilm: {
    group: 'process',
    name: { 'zh-TW': '薄膜', en: 'Thin Film' },
    text: {
      'zh-TW': '打在自己第 0 階的晶圓上，完成第一階製程（0→1）。',
      en: 'Play on one of your own wafers at step 0 to complete step 1 (0→1).',
    },
  },
  photolithography: {
    group: 'process',
    name: { 'zh-TW': '微影蝕刻', en: 'Photolithography & Etch' },
    text: {
      'zh-TW': '打在自己第 1 階的晶圓上，完成第二階製程（1→2）。',
      en: 'Play on one of your own wafers at step 1 to complete step 2 (1→2).',
    },
  },
  doping: {
    group: 'process',
    name: { 'zh-TW': '摻雜', en: 'Doping' },
    text: {
      'zh-TW': '打在自己第 2 階的晶圓上，完成第三階製程（2→3）。',
      en: 'Play on one of your own wafers at step 2 to complete step 3 (2→3).',
    },
  },
  metallization: {
    group: 'process',
    name: { 'zh-TW': '金屬層', en: 'Metallization' },
    text: {
      'zh-TW': '打在自己第 3 階的晶圓上，完成第四階製程（3→4），晶圓完成！',
      en: 'Play on one of your own wafers at step 3 to complete step 4 (3→4): the wafer is finished!',
    },
  },
  foundry: {
    group: 'process',
    name: { 'zh-TW': '晶圓代工', en: 'Foundry' },
    text: {
      'zh-TW': '萬用製程卡：可當作自己所選晶圓需要的下一階製程卡。',
      en: 'Wild process card: counts as whichever next step the chosen wafer of yours needs.',
    },
  },
  agingEquipment: {
    group: 'regress',
    name: { 'zh-TW': '設備老舊', en: 'Aging Equipment' },
    text: {
      'zh-TW': '指定任一玩家（含自己）剛好在第 1 階的晶圓，退回第 0 階。',
      en: "Target any player's wafer (yours included) that is exactly at step 1: it goes back to step 0.",
    },
  },
  exposureError: {
    group: 'regress',
    name: { 'zh-TW': '曝光量錯誤', en: 'Exposure Error' },
    text: {
      'zh-TW': '指定任一玩家（含自己）剛好在第 2 階的晶圓，退回第 1 階。',
      en: "Target any player's wafer (yours included) that is exactly at step 2: it goes back to step 1.",
    },
  },
  ionImplant: {
    group: 'regress',
    name: { 'zh-TW': '離子佈植問題', en: 'Ion Implant Issue' },
    text: {
      'zh-TW': '指定任一玩家（含自己）剛好在第 3 階的晶圓，退回第 2 階。',
      en: "Target any player's wafer (yours included) that is exactly at step 3: it goes back to step 2.",
    },
  },
  blackout: {
    group: 'event',
    name: { 'zh-TW': '大停電', en: 'Blackout' },
    text: {
      'zh-TW':
        '所有玩家（含出牌者）：沒有發電機者，所有未完成晶圓倒退 1 步；有發電機者改為棄置 1 張發電機並不受影響。',
      en: 'Every player (including you): without a Generator, all unfinished wafers move back 1 step; with a Generator, discard exactly one Generator instead and stay unaffected.',
    },
  },
  toxicGas: {
    group: 'event',
    name: { 'zh-TW': '毒氣外洩', en: 'Toxic Gas Leak' },
    text: {
      'zh-TW': '指定 1 名玩家：其所有未完成晶圓倒退 1 步；若其有逃生通道，則改為棄置 1 張逃生通道並不受影響。',
      en: 'Target 1 player: all of their unfinished wafers move back 1 step; if they have an Emergency Exit, they discard one instead and are unaffected.',
    },
  },
  rookieEngineer: {
    group: 'disaster',
    name: { 'zh-TW': '新進工程師', en: 'Rookie Engineer' },
    text: {
      'zh-TW': '指定 1 名擁有發電機的玩家，使其棄置 1 張發電機。',
      en: 'Target 1 player who has a Generator: they discard one Generator.',
    },
  },
  blockedExit: {
    group: 'disaster',
    name: { 'zh-TW': '通道阻塞', en: 'Blocked Exit' },
    text: {
      'zh-TW': '指定 1 名擁有逃生通道的玩家，使其棄置 1 張逃生通道。',
      en: 'Target 1 player who has an Emergency Exit: they discard one Emergency Exit.',
    },
  },
  generator: {
    group: 'protection',
    name: { 'zh-TW': '發電機', en: 'Generator' },
    text: {
      'zh-TW': '正面朝上放在自己面前，保護你所有晶圓；每張可擋下 1 次「大停電」，用過即棄置。可疊加。',
      en: 'Place face-up in front of you; covers all your wafers. Each one blocks one Blackout, then is discarded. Stackable.',
    },
  },
  emergencyExit: {
    group: 'protection',
    name: { 'zh-TW': '逃生通道', en: 'Emergency Exit' },
    text: {
      'zh-TW': '正面朝上放在自己面前，保護你所有晶圓；每張可擋下 1 次「毒氣外洩」，用過即棄置。可疊加。',
      en: 'Place face-up in front of you; covers all your wafers. Each one blocks one Toxic Gas Leak, then is discarded. Stackable.',
    },
  },
  yearEndBonus: {
    group: 'function',
    name: { 'zh-TW': '年終獎金', en: 'Year-End Bonus' },
    text: {
      'zh-TW': '打出後抽 2 張牌，再選擇：打出 1 張牌並棄 1 張牌，或直接棄 2 張牌。手牌回到 4 張。限時模式結束時，留在手上每張 +1 分。',
      en: 'Draw 2, then either play 1 card and discard 1, or discard 2. Your hand ends at 4. In Timed mode, each one still in hand at the end is worth +1 point.',
    },
  },
};

export function cardName(kind: CardKind, lang: Lang): string {
  return CARD_META[kind].name[lang];
}
export function cardText(kind: CardKind, lang: Lang): string {
  return CARD_META[kind].text[lang];
}

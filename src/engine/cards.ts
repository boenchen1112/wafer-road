import type { Card, CardKind } from './types';

export const HAND_SIZE = 4;
export const WAFERS_PER_PLAYER = 2;
export const COMPLETE_STEP = 4;

export const DECK_COUNTS: Record<CardKind, number> = {
  thinFilm: 12,
  photolithography: 9,
  doping: 7,
  metallization: 5,
  foundry: 3,
  agingEquipment: 4,
  exposureError: 3,
  ionImplant: 2,
  blackout: 4,
  toxicGas: 4,
  rookieEngineer: 2,
  blockedExit: 2,
  generator: 4,
  emergencyExit: 4,
  yearEndBonus: 3,
};

export const DECK_SIZE = Object.values(DECK_COUNTS).reduce((a, b) => a + b, 0); // 68

export const KIND_ORDER = Object.keys(DECK_COUNTS) as CardKind[];

/** Step a process card advances FROM (the wafer must be exactly there). */
export const PROCESS_FROM: Partial<Record<CardKind, number>> = {
  thinFilm: 0,
  photolithography: 1,
  doping: 2,
  metallization: 3,
};

/** Step a regression card requires the wafer to be AT (it moves to step-1). */
export const REGRESS_AT: Partial<Record<CardKind, number>> = {
  agingEquipment: 1,
  exposureError: 2,
  ionImplant: 3,
};

export function isProcess(k: CardKind): boolean {
  return k in PROCESS_FROM || k === 'foundry';
}
export function isRegression(k: CardKind): boolean {
  return k in REGRESS_AT;
}
export function isProtection(k: CardKind): boolean {
  return k === 'generator' || k === 'emergencyExit';
}
/** Cards that need a target player (not wafer). */
export function needsPlayerTarget(k: CardKind): boolean {
  return k === 'toxicGas' || k === 'rookieEngineer' || k === 'blockedExit';
}

/** Unsorted, deterministic deck list with ids 0..67. */
export function buildDeck(): Card[] {
  const deck: Card[] = [];
  let id = 0;
  for (const kind of KIND_ORDER) {
    for (let i = 0; i < DECK_COUNTS[kind]; i++) deck.push({ id: id++, kind });
  }
  return deck;
}

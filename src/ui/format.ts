import type { GameEvent } from '../engine';
import { cardName } from '../i18n/cards';
import { t, type Lang } from '../i18n';
import type { Seat } from './store';

export function seatName(seats: Seat[], i: number, lang: Lang): string {
  return t(seats[i].kind === 'human' ? 'lobby.name' : 'lobby.bot', { n: i + 1 }, lang);
}

/** Returns null for events that are not shown in the log. */
export function formatEvent(e: GameEvent, seats: Seat[], lang: Lang): { text: string; tone: string } | null {
  const n = (i: number) => seatName(seats, i, lang);
  const c = (k: Parameters<typeof cardName>[0]) => cardName(k, lang);
  switch (e.type) {
    case 'turnStart':
      return { text: t('log.turn', { name: n(e.player) }, lang), tone: 'turn' };
    case 'draw':
      return null;
    case 'reshuffle':
      return { text: t('log.reshuffle', { n: e.count }, lang), tone: 'info' };
    case 'play':
      if (e.target && e.target.player !== e.player) {
        const w = e.target.wafer !== undefined ? ' · ' + t('log.waferN', { n: e.target.wafer + 1 }, lang) : '';
        return { text: t('log.playOn', { name: n(e.player), card: c(e.card.kind), target: n(e.target.player) + w }, lang), tone: 'play' };
      }
      return { text: t('log.play', { name: n(e.player), card: c(e.card.kind) }, lang), tone: 'play' };
    case 'discard':
      return { text: t('log.discard', { name: n(e.player), card: c(e.card.kind) }, lang), tone: 'discard' };
    case 'advance':
      return { text: t('log.advance', { name: n(e.player), w: e.wafer + 1, to: e.to }, lang), tone: 'good' };
    case 'regress':
      return { text: t('log.regress', { name: n(e.player), w: e.wafer + 1, to: e.to }, lang), tone: 'bad' };
    case 'protect':
      return { text: t('log.protect', { name: n(e.player), card: c(e.card.kind) }, lang), tone: 'info' };
    case 'blocked':
      return {
        text: t('log.blocked', { name: n(e.player), card: c(e.by), cause: c(e.cause) }, lang),
        tone: 'block',
      };
    case 'loseProtection':
      return { text: t('log.lose', { name: n(e.player), card: c(e.card.kind) }, lang), tone: 'bad' };
    case 'noEffect':
      return { text: t('log.noEffect', { name: n(e.player), cause: c(e.cause) }, lang), tone: 'info' };
    case 'finalRound':
      return { text: t('log.finalRound', undefined, lang), tone: 'turn' };
    case 'gameOver':
      return { text: t('log.gameOver', undefined, lang), tone: 'turn' };
  }
}

/**
 * Per-player redaction. The server never sends a GameState to a client; it sends
 * the output of buildGameView, which is rebuilt field by field from an allow-list:
 *   - the recipient's own hand (and nobody else's, only counts),
 *   - deck size (not order), the public discard pile, wafers and protections,
 *   - log events, each re-created from an allow-list of public fields.
 * The seed, RNG state and deck order are never copied.
 */
import { legalActions, type Card, type GameEvent, type GameState } from '../engine';
import type { GameView, LogEntry, SeatView } from './protocol';

const copyCard = (c: Card): Card => ({ id: c.id, kind: c.kind });

/** Re-create an event from public fields only; unknown event types are dropped. */
export function redactEvent(e: GameEvent): GameEvent | null {
  switch (e.type) {
    case 'turnStart':
      return { type: 'turnStart', player: e.player };
    case 'draw':
      // The identity of drawn cards is hidden; only how many.
      return { type: 'draw', player: e.player, count: e.count };
    case 'reshuffle':
      return { type: 'reshuffle', count: e.count };
    case 'play':
      return {
        type: 'play',
        player: e.player,
        card: copyCard(e.card),
        ...(e.target ? { target: e.target.wafer === undefined ? { player: e.target.player } : { player: e.target.player, wafer: e.target.wafer } } : {}),
      };
    case 'discard':
      return { type: 'discard', player: e.player, card: copyCard(e.card) };
    case 'advance':
      return { type: 'advance', player: e.player, wafer: e.wafer, from: e.from, to: e.to };
    case 'regress':
      return { type: 'regress', player: e.player, wafer: e.wafer, from: e.from, to: e.to, cause: e.cause, by: e.by };
    case 'protect':
      return { type: 'protect', player: e.player, card: copyCard(e.card) };
    case 'blocked':
      return { type: 'blocked', player: e.player, by: e.by, cause: e.cause, actor: e.actor };
    case 'loseProtection':
      return { type: 'loseProtection', player: e.player, card: copyCard(e.card), cause: e.cause, actor: e.actor };
    case 'noEffect':
      return { type: 'noEffect', player: e.player, cause: e.cause, actor: e.actor };
    case 'finalRound':
      return { type: 'finalRound' };
    case 'gameOver':
      return { type: 'gameOver', result: { winners: [...e.result.winners], reason: e.result.reason, scores: [...e.result.scores] } };
    default:
      return null;
  }
}

export function redactLog(log: LogEntry[]): LogEntry[] {
  const out: LogEntry[] = [];
  for (const l of log) {
    const ev = redactEvent(l.ev);
    if (ev) out.push({ id: l.id, ev });
  }
  return out;
}

/**
 * @param viewer seat index of the recipient, or null (no seat -> no hand, no actions)
 * @param canAct whether the recipient is currently allowed to act (their seat is human-controlled)
 */
export function buildGameView(
  game: GameState,
  seats: SeatView[],
  viewer: number | null,
  log: LogEntry[],
  canAct: boolean,
): GameView {
  const me = viewer !== null ? game.players[viewer] : undefined;
  return {
    endMode: game.config.endMode,
    numPlayers: game.players.length,
    seats: seats.map((s) => ({ ...s })),
    you: viewer,
    current: game.current,
    phase: game.phase,
    turnCount: game.turnCount,
    finalTurnsLeft: game.finalTurnsLeft,
    result: game.result ? { winners: [...game.result.winners], reason: game.result.reason, scores: [...game.result.scores] } : null,
    deckCount: game.deck.length,
    discard: game.discard.map(copyCard),
    players: game.players.map((p) => ({
      handCount: p.hand.length,
      wafers: [p.wafers[0], p.wafers[1]] as [number, number],
      protections: p.protections.map(copyCard),
    })),
    hand: me ? me.hand.map(copyCard) : [],
    legal: viewer !== null && canAct && !game.result ? legalActions(game, viewer) : [],
    log: redactLog(log),
  };
}

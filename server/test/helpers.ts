import { chooseAction } from '../../src/ai';
import { legalActions, seededRandom, type Action } from '../../src/engine';
import type { ClientAction, RoomSettings } from '../../src/online/protocol';
import { Room, type RoomDeps } from '../src/room';

export const T0 = 1_700_000_000_000;

export function mkDeps(seed = 7): RoomDeps {
  const rand = seededRandom(seed);
  return {
    rand,
    randomHex: (bytes) => Array.from({ length: bytes }, () => Math.floor(rand() * 256).toString(16).padStart(2, '0')).join(''),
  };
}

export const HOST_TOKEN = 'a'.repeat(32);

export interface Ctx {
  room: Room;
  host: string;
  now: number;
}

/** A room whose host has joined. */
export function newRoom(settings?: Partial<RoomSettings>, now = T0): Ctx {
  const room = Room.create('BCDF', now, HOST_TOKEN, mkDeps());
  const j = room.handleJoin({ name: 'Host', token: HOST_TOKEN }, now);
  if (!j.ok) throw new Error('host join failed');
  if (settings) {
    const r = room.setSettings(j.memberId, { ...room.data.settings, ...settings }, now);
    if (!r.ok) throw new Error('settings failed: ' + r.msg);
  }
  return { room, host: j.memberId, now };
}

export function join(room: Room, name: string, now: number): { id: string; token: string } {
  const j = room.handleJoin({ name }, now);
  if (!j.ok) throw new Error('join failed: ' + j.msg);
  return { id: j.memberId, token: j.token };
}

export function toClient(a: Action): ClientAction {
  return a.type === 'discard' ? { type: 'discard', cardId: a.cardId } : { type: 'play', cardId: a.cardId, ...(a.target ? { target: a.target } : {}) };
}

/** First legal action for the member's seat (deterministic). */
export function firstLegal(room: Room, memberId: string): ClientAction {
  const seat = room.member(memberId)!.seat!;
  return toClient(legalActions(room.data.game!, seat)[0]);
}

/** Play a started game to the end: members in `humans` play first-legal; everything else is timer-driven. */
export function driveToEnd(room: Room, humans: string[], now: number, maxSteps = 20000): number {
  const rand = seededRandom(99);
  for (let i = 0; i < maxSteps && room.data.phase === 'playing'; i++) {
    const game = room.data.game!;
    const human = humans.find((h) => room.member(h)?.seat === game.current);
    if (human) {
      const act = chooseAction(game, game.current, 'easy', rand);
      const r = room.handleAction(human, toClient(act), now);
      if (!r.ok) throw new Error('action rejected: ' + r.msg);
    } else {
      const w = room.nextWake();
      if (w === null) throw new Error('stuck: nothing scheduled');
      now = Math.max(now, w);
      room.tick(now);
    }
  }
  return now;
}

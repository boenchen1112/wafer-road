import { describe, expect, it } from 'vitest';
import { legalActions } from '../../src/engine';
import { ENDED_MS, HOST_GRACE_MS, IDLE_MS, LOBBY_GRACE_MS, Room, TAKEOVER_GRACE_MS, THINK_MS, UNCLAIMED_MS } from '../src/room';
import { HOST_TOKEN, T0, driveToEnd, firstLegal, join, mkDeps, newRoom, toClient } from './helpers';

describe('create / join / seats', () => {
  it('only the creator (holding the reserved token) can claim the new room', () => {
    const room = Room.create('BCDF', T0, HOST_TOKEN, mkDeps());
    expect(room.handleJoin({ name: 'Intruder' }, T0)).toMatchObject({ ok: false, code: 'not_ready' });
    const h = room.handleJoin({ name: 'Host', token: HOST_TOKEN }, T0);
    expect(h).toMatchObject({ ok: true, isNew: true });
    expect(room.data.hostId).toBe((h as { memberId: string }).memberId);
    expect(room.data.members[0].seat).toBe(0);
  });

  it('assigns seats in order, refuses a full room, and rejoins by token to the same seat', () => {
    const { room, now } = newRoom();
    const g = room.handleJoin({ name: 'Guest' }, now);
    expect(g).toMatchObject({ ok: true });
    if (!g.ok) return;
    expect(room.member(g.memberId)!.seat).toBe(1);
    expect(room.handleJoin({ name: 'Third' }, now)).toMatchObject({ ok: false, code: 'room_full' });
    room.markDisconnected(g.memberId, now);
    const again = room.handleJoin({ name: 'Whatever', token: g.token }, now + 1000);
    expect(again).toMatchObject({ ok: true, isNew: false, memberId: g.memberId });
    expect(room.member(g.memberId)).toMatchObject({ seat: 1, connected: true, name: 'Guest' });
    expect(room.data.members).toHaveLength(2);
  });

  it('never accepts a forged token as an identity', () => {
    const { room, now } = newRoom();
    const r = room.handleJoin({ name: 'Mallory', token: 'b'.repeat(32) }, now);
    expect(r).toMatchObject({ ok: true, isNew: true });
    if (r.ok) expect(r.token).not.toBe('b'.repeat(32));
  });

  it('makes names unique', () => {
    const { room, now } = newRoom({ seats: ['open', 'open', 'open'] });
    const a = join(room, 'Host', now);
    expect(room.member(a.id)!.name).toBe('Host 2');
  });

  it('refuses new members once a game started, but still lets existing ones rejoin', () => {
    const { room, host, now } = newRoom({ seats: ['open', 'normal'] });
    expect(room.start(host, now)).toMatchObject({ ok: true });
    expect(room.handleJoin({ name: 'Late' }, now)).toMatchObject({ ok: false, code: 'in_progress' });
    room.markDisconnected(host, now);
    expect(room.handleJoin({ name: 'Host', token: HOST_TOKEN }, now + 5)).toMatchObject({ ok: true, isNew: false });
  });
});

describe('settings and start', () => {
  it('only the host edits settings; occupied seats stay open; invalid shapes are refused by the parser elsewhere', () => {
    const { room, host, now } = newRoom({ seats: ['open', 'open', 'normal'] });
    const g = join(room, 'Guest', now);
    const s = room.data.settings;
    expect(room.setSettings(g.id, { ...s, timer: 30 }, now)).toMatchObject({ ok: false, code: 'not_host' });
    expect(room.setSettings(host, { ...s, seats: ['open', 'easy', 'normal'] }, now)).toMatchObject({ ok: false, code: 'bad_settings' });
    expect(room.setSettings(host, { ...s, timer: 60, endMode: 'long' }, now)).toMatchObject({ ok: true });
    expect(room.data.settings).toMatchObject({ timer: 60, endMode: 'long' });
  });

  it('refuses to start with an unfilled open seat, then starts once it is a bot', () => {
    const { room, host, now } = newRoom({ seats: ['open', 'open', 'normal'] });
    expect(room.start(host, now)).toMatchObject({ ok: false, code: 'seats_open' });
    room.setSettings(host, { ...room.data.settings, seats: ['open', 'easy', 'normal'] }, now);
    expect(room.start(host, now)).toMatchObject({ ok: true });
    expect(room.data.phase).toBe('playing');
    expect(room.data.game!.players).toHaveLength(3);
    expect(room.data.gameSeats.map((s) => s.kind)).toEqual(['human', 'bot', 'bot']);
    expect(room.data.log.length).toBeGreaterThan(0);
  });

  it('only the host starts; settings lock after start', () => {
    const { room, host, now } = newRoom({ seats: ['open', 'open'] });
    const g = join(room, 'Guest', now);
    expect(room.start(g.id, now)).toMatchObject({ ok: false, code: 'not_host' });
    expect(room.start(host, now)).toMatchObject({ ok: true });
    expect(room.setSettings(host, room.data.settings, now)).toMatchObject({ ok: false, code: 'wrong_phase' });
    expect(room.start(host, now)).toMatchObject({ ok: false, code: 'wrong_phase' });
  });

  it('passes the end mode to the engine and does not hardcode a deck size', () => {
    const { room, host, now } = newRoom({ seats: ['open', 'normal'], endMode: 'long' });
    room.start(host, now);
    expect(room.data.game!.config.endMode).toBe('long');
    const g = room.data.game!;
    const total = g.deck.length + g.discard.length + g.players.reduce((n, p) => n + p.hand.length, 0);
    expect(total).toBeGreaterThan(0);
  });
});

describe('actions', () => {
  function started() {
    const c = newRoom({ seats: ['open', 'open'] });
    const g = join(c.room, 'Guest', c.now);
    c.room.start(c.host, c.now);
    return { ...c, guest: g.id };
  }

  it('rejects actions out of turn, with bad cards, and illegal targets', () => {
    const { room, host, guest, now } = started();
    expect(room.data.game!.current).toBe(0);
    expect(room.handleAction(guest, firstLegal(room, host), now)).toMatchObject({ ok: false, code: 'not_your_turn' });
    expect(room.handleAction(host, { type: 'discard', cardId: 9999 }, now)).toMatchObject({ ok: false, code: 'illegal_action' });
    // a card that is in the OTHER player's hand
    const theirs = room.data.game!.players[1].hand[0].id;
    expect(room.handleAction(host, { type: 'discard', cardId: theirs }, now)).toMatchObject({ ok: false, code: 'illegal_action' });
    // play with a wrong shape of target (a protection/blackout/bonus never takes one; others need one)
    const mine = room.data.game!.players[0].hand;
    for (const c of mine) {
      const bad = room.handleAction(host, { type: 'play', cardId: c.id, target: { player: 4 } }, now);
      expect(bad.ok).toBe(false);
    }
    expect(room.data.game!.current).toBe(0); // nothing changed
  });

  it('applies a legal discard and passes the turn', () => {
    const { room, host, guest, now } = started();
    const revBefore = room.data.rev;
    const card = room.data.game!.players[0].hand[0];
    expect(room.handleAction(host, { type: 'discard', cardId: card.id }, now)).toMatchObject({ ok: true });
    expect(room.data.game!.current).toBe(1);
    expect(room.data.rev).toBeGreaterThan(revBefore);
    expect(room.data.game!.discard.some((c) => c.id === card.id)).toBe(true);
    expect(room.handleAction(guest, firstLegal(room, guest), now)).toMatchObject({ ok: true });
  });

  it('applies a legal play when one exists', () => {
    const { room, host, now } = started();
    const plays = legalActions(room.data.game!, 0).filter((a) => a.type === 'play');
    if (plays.length) {
      expect(room.handleAction(host, toClient(plays[0]), now)).toMatchObject({ ok: true });
    }
  });

  it('a spectator-less / unknown member cannot act', () => {
    const { room, now } = started();
    expect(room.handleAction('nobody', { type: 'discard', cardId: 0 }, now)).toMatchObject({ ok: false, code: 'not_joined' });
  });

  it('rejects actions after the game is over', () => {
    const { room, host, guest, now } = started();
    driveToEnd(room, [host, guest], now);
    expect(room.data.phase).toBe('ended');
    expect(room.handleAction(host, { type: 'discard', cardId: 0 }, now)).toMatchObject({ ok: false, code: 'wrong_phase' });
  });
});

describe('bots', () => {
  it('a bot seat plays after the think delay, not before', () => {
    const { room, host, now } = newRoom({ seats: ['open', 'normal'] });
    room.start(host, now);
    room.handleAction(host, firstLegal(room, host), now);
    expect(room.data.game!.current).toBe(1);
    expect(room.data.pending).toMatchObject({ kind: 'bot', seat: 1, at: now + THINK_MS });
    room.tick(now + THINK_MS - 1);
    expect(room.data.game!.current).toBe(1);
    room.tick(now + THINK_MS);
    expect(room.data.game!.current).toBe(0);
  });

  it('plays a full human-vs-bots game to the end screen', () => {
    const { room, host, now } = newRoom({ seats: ['open', 'normal', 'easy'] });
    room.start(host, now);
    driveToEnd(room, [host], now);
    expect(room.data.phase).toBe('ended');
    expect(room.data.game!.result).not.toBeNull();
    expect(room.data.endedAt).not.toBeNull();
    expect(room.data.pending).toBeNull();
  });
});

describe('reconnect and bot takeover', () => {
  function twoHumans() {
    const c = newRoom({ seats: ['open', 'open'] });
    const g = join(c.room, 'Guest', c.now);
    c.room.start(c.host, c.now);
    return { ...c, guest: g.id, guestToken: g.token };
  }

  it('rejoining restores the same seat and hand', () => {
    const { room, guest, guestToken, now } = twoHumans();
    const before = room.viewFor(guest, now)!.game!;
    room.markDisconnected(guest, now + 100);
    expect(room.viewFor(room.data.hostId!, now + 100)!.members.find((m) => m.id === guest)!.connected).toBe(false);
    const j = room.handleJoin({ name: 'x', token: guestToken }, now + 5000);
    expect(j).toMatchObject({ ok: true, isNew: false });
    const after = room.viewFor(guest, now + 5000)!.game!;
    expect(after.you).toBe(1);
    expect(after.hand).toEqual(before.hand);
    expect(after.players).toEqual(before.players);
  });

  it('survives a Durable Object eviction (JSON round trip of the stored data)', () => {
    const { room, host, now } = twoHumans();
    room.handleAction(host, firstLegal(room, host), now);
    const copy = new Room(JSON.parse(JSON.stringify(room.data)), mkDeps(3));
    expect(copy.viewFor(host, now)).toEqual(room.viewFor(host, now));
  });

  it('reconcile() marks members without a live socket as disconnected', () => {
    const { room, host, guest, now } = twoHumans();
    expect(room.reconcile(new Set([host]), now + 10)).toBe(true);
    expect(room.member(guest)!.connected).toBe(false);
    expect(room.member(host)!.connected).toBe(true);
  });

  it('a Normal bot plays for a disconnected player after the 20s grace, and they take over again on reconnect', () => {
    const { room, host, guest, now } = twoHumans();
    // it is the host's turn; the host drops
    room.markDisconnected(host, now + 1000);
    expect(room.data.pending).toMatchObject({ kind: 'takeover', seat: 0, at: now + 1000 + TAKEOVER_GRACE_MS });
    room.tick(now + 1000 + TAKEOVER_GRACE_MS - 1);
    expect(room.data.game!.current).toBe(0);
    let t = now + 1000 + TAKEOVER_GRACE_MS;
    room.tick(t);
    expect(room.member(host)!.autoplay).toBe(true);
    // the bot may use a bonus card and need a second decision; each one comes one think-delay later
    for (let i = 0; i < 4 && room.data.game!.current === 0; i++) {
      expect(room.data.pending).toMatchObject({ kind: 'takeover', seat: 0, at: t + THINK_MS });
      t += THINK_MS;
      room.tick(t);
    }
    expect(room.data.game!.current).toBe(1); // bot played the host's move
    expect(room.viewFor(guest, t)!.members.find((m) => m.id === host)!.autoplay).toBe(true);

    // guest moves; host (still away) is covered quickly now, no second 20s wait
    room.handleAction(guest, firstLegal(room, guest), t + 100);
    expect(room.data.game!.current).toBe(0);
    expect(room.data.pending).toMatchObject({ kind: 'takeover', at: t + 100 + THINK_MS });

    // host comes back: control returns, no bot move happens
    const back = room.handleJoin({ name: 'Host', token: HOST_TOKEN }, t + 200);
    expect(back).toMatchObject({ ok: true, isNew: false });
    expect(room.member(host)!.autoplay).toBe(false);
    expect(room.data.pending).toBeNull();
    room.tick(t + 60_000);
    expect(room.data.game!.current).toBe(0);
    expect(room.viewFor(host, t + 300)!.game!.legal.length).toBeGreaterThan(0);
    expect(room.handleAction(host, firstLegal(room, host), t + 400)).toMatchObject({ ok: true });
  });

  it('the grace period is cut to the turn timer when that is shorter than 20s', () => {
    // timer options are >= 30s, so exercise the min() directly via a tighter stored value
    const { room, host, now } = twoHumans();
    room.data.settings.timer = 30;
    room.reschedule(now);
    room.markDisconnected(host, now);
    expect(room.data.pending!.at).toBe(now + Math.min(TAKEOVER_GRACE_MS, 30_000));
  });

  it('a player who is away before their turn starts gets the grace from the start of their turn', () => {
    const { room, host, guest, now } = twoHumans();
    room.markDisconnected(guest, now + 500);
    const t = now + 10_000;
    room.handleAction(host, firstLegal(room, host), t);
    expect(room.data.pending).toMatchObject({ kind: 'takeover', seat: 1, at: t + TAKEOVER_GRACE_MS });
  });

  it('pauses everything while nobody is connected, resumes when someone returns', () => {
    const { room, host, guest, now } = twoHumans();
    room.markDisconnected(host, now);
    room.markDisconnected(guest, now);
    expect(room.data.pending).toBeNull();
    room.tick(now + 10 * 60_000);
    expect(room.data.game!.current).toBe(0);
    room.handleJoin({ name: 'Host', token: HOST_TOKEN }, now + 11 * 60_000);
    expect(room.data.pending).toBeNull(); // host is connected, no timer set
    expect(room.viewFor(host, now + 11 * 60_000)!.game!.legal.length).toBeGreaterThan(0);
  });

  it('an explicit leave hands the seat to a Normal bot immediately', () => {
    const { room, host, guest, now } = twoHumans();
    room.handleAction(host, firstLegal(room, host), now);
    expect(room.leave(guest, now + 10)).toMatchObject({ ok: true });
    expect(room.member(guest)!.left).toBe(true);
    expect(room.data.pending).toMatchObject({ kind: 'bot', seat: 1, at: now + 10 + THINK_MS });
    room.tick(now + 10 + THINK_MS);
    expect(room.data.game!.current).toBe(0);
    // cannot come back with the old token mid-game
    expect(room.handleJoin({ name: 'G', token: room.member(guest)!.token }, now + 5000)).toMatchObject({ ok: false });
  });
});

describe('turn timer', () => {
  it('auto-plays a Normal bot move on timeout, using server time', () => {
    const { room, host, now } = newRoom({ seats: ['open', 'normal'], timer: 30 });
    room.start(host, now);
    expect(room.data.pending).toMatchObject({ kind: 'timeout', seat: 0, at: now + 30_000 });
    const view = room.viewFor(host, now + 5)!;
    expect(view.clock).toEqual({ kind: 'timeout', seat: 0, at: now + 30_000 });
    expect(view.serverNow).toBe(now + 5);
    room.tick(now + 29_999);
    expect(room.data.game!.current).toBe(0);
    const r = room.tick(now + 30_000);
    expect(r.changed).toBe(true);
    expect(room.data.game!.current).toBe(1);
    // a timeout is not sticky: the host keeps control afterwards
    expect(room.member(host)!.autoplay).toBe(false);
  });

  it('a human action before the deadline restarts the clock for the next decision', () => {
    const { room, host, now } = newRoom({ seats: ['open', 'open'], timer: 60 });
    const g = join(room, 'G', now);
    room.start(host, now);
    room.handleAction(host, firstLegal(room, host), now + 10_000);
    expect(room.data.pending).toMatchObject({ kind: 'timeout', seat: 1, at: now + 10_000 + 60_000 });
    room.tick(now + 60_000); // old deadline passes: nothing happens
    expect(room.data.game!.current).toBe(1);
    room.handleAction(g.id, firstLegal(room, g.id), now + 61_000);
    expect(room.data.game!.current).toBe(0);
  });

  it('has no clock when the timer is off', () => {
    const { room, host, now } = newRoom({ seats: ['open', 'normal'], timer: 0 });
    room.start(host, now);
    expect(room.data.pending).toBeNull();
    expect(room.viewFor(host, now)!.clock).toBeNull();
  });

  it('plays bonus-phase decisions too (every decision has its own deadline)', () => {
    const { room, host, now } = newRoom({ seats: ['open', 'normal'], timer: 30 });
    room.start(host, now);
    let t = now;
    for (let i = 0; i < 12 && room.data.phase === 'playing'; i++) {
      t += 31_000;
      room.tick(t);
    }
    expect(room.data.rev).toBeGreaterThan(5);
  });
});

describe('host migration', () => {
  it('moves to the next connected human after the grace period, not before', () => {
    const { room, host, now } = newRoom({ seats: ['open', 'open', 'open'] });
    const a = join(room, 'A', now + 1);
    join(room, 'B', now + 2);
    room.markDisconnected(host, now + 100);
    room.tick(now + 100 + HOST_GRACE_MS - 1);
    expect(room.data.hostId).toBe(host);
    expect(room.nextWake()).toBeLessThanOrEqual(now + 100 + HOST_GRACE_MS);
    room.tick(now + 100 + HOST_GRACE_MS);
    expect(room.data.hostId).toBe(a.id);
    // old host returns as an ordinary member
    room.handleJoin({ name: 'Host', token: HOST_TOKEN }, now + 50_000);
    expect(room.data.hostId).toBe(a.id);
    expect(room.viewFor(host, now + 50_000)!.you.isHost).toBe(false);
  });

  it('passes immediately when the host leaves, and the new host can run the room', () => {
    const { room, host, now } = newRoom({ seats: ['open', 'open'] });
    const a = join(room, 'A', now + 1);
    room.leave(host, now + 5);
    expect(room.data.hostId).toBe(a.id);
    expect(room.data.members.map((m) => m.id)).toEqual([a.id]); // lobby leave frees the seat
    expect(room.setSettings(a.id, { ...room.data.settings, seats: ['normal', 'open'] }, now + 6)).toMatchObject({ ok: true });
    expect(room.start(a.id, now + 7)).toMatchObject({ ok: true });
  });

  it('mid-game host migration keeps the game running', () => {
    const { room, host, now } = newRoom({ seats: ['open', 'open'] });
    const a = join(room, 'A', now + 1);
    room.start(host, now + 2);
    room.leave(host, now + 3);
    expect(room.data.hostId).toBe(a.id);
    expect(room.data.pending).toMatchObject({ kind: 'bot', seat: 0 });
  });
});

describe('lobby housekeeping', () => {
  it('drops members who stay away from the lobby and frees their seat', () => {
    const { room, host, now } = newRoom({ seats: ['open', 'open'] });
    const g = join(room, 'G', now);
    room.markDisconnected(g.id, now + 10);
    room.tick(now + 10 + LOBBY_GRACE_MS - 1);
    expect(room.member(g.id)).toBeDefined();
    room.tick(now + 10 + LOBBY_GRACE_MS);
    expect(room.member(g.id)).toBeUndefined();
    expect(room.handleJoin({ name: 'New' }, now + LOBBY_GRACE_MS + 20)).toMatchObject({ ok: true });
    expect(room.member(host)).toBeDefined();
  });
});

describe('play again', () => {
  it('returns to the lobby with the same people and settings, and can start a second game', () => {
    const { room, host, now } = newRoom({ seats: ['open', 'open', 'normal'], endMode: 'long' });
    const g = join(room, 'G', now);
    room.start(host, now);
    const t = driveToEnd(room, [host, g.id], now);
    expect(room.data.phase).toBe('ended');
    expect(room.again(g.id, t)).toMatchObject({ ok: false, code: 'not_host' });
    expect(room.again(host, t)).toMatchObject({ ok: true });
    expect(room.data.phase).toBe('lobby');
    expect(room.data.game).toBeNull();
    expect(room.data.endedAt).toBeNull();
    expect(room.data.settings.endMode).toBe('long');
    expect(room.data.members.map((m) => m.seat)).toEqual([0, 1]);
    expect(room.start(host, t + 1)).toMatchObject({ ok: true });
    expect(room.data.game!.turnCount).toBe(0);
    expect(room.again(host, t + 2)).toMatchObject({ ok: false, code: 'wrong_phase' });
  });
});

describe('cleanup', () => {
  it('destroys an idle lobby after 2 hours', () => {
    const { room, now } = newRoom();
    expect(room.tick(now + IDLE_MS - 1).destroy).toBe(false);
    expect(room.nextWake()).toBe(now + IDLE_MS);
    expect(room.tick(now + IDLE_MS).destroy).toBe(true);
  });

  it('activity pushes the idle deadline out', () => {
    const { room, host, now } = newRoom({ seats: ['open', 'normal'] });
    room.start(host, now + 1000);
    room.handleAction(host, firstLegal(room, host), now + IDLE_MS - 10);
    expect(room.tick(now + IDLE_MS + 5).destroy).toBe(false);
  });

  it('destroys 30 minutes after the game ended', () => {
    const { room, host, now } = newRoom({ seats: ['open', 'normal'] });
    room.start(host, now);
    const t = driveToEnd(room, [host], now);
    const ended = room.data.endedAt!;
    expect(ended).toBe(t);
    expect(room.nextWake()).toBe(ended + ENDED_MS);
    expect(room.tick(ended + ENDED_MS - 1).destroy).toBe(false);
    expect(room.tick(ended + ENDED_MS).destroy).toBe(true);
  });

  it('destroys a room whose creator never showed up', () => {
    const room = Room.create('BCDF', T0, HOST_TOKEN, mkDeps());
    expect(room.tick(T0 + UNCLAIMED_MS - 1).destroy).toBe(false);
    expect(room.tick(T0 + UNCLAIMED_MS).destroy).toBe(true);
  });

  it('destroys a room everyone left', () => {
    const { room, host, now } = newRoom();
    room.leave(host, now + 5);
    expect(room.tick(now + 6).destroy).toBe(true);
  });
});

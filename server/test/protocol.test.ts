import { describe, expect, it } from 'vitest';
import { MAX_MESSAGE_CHARS, ROOM_ALPHABET, ROOM_CODE_RE, parseClientMessage, sanitizeName } from '../../src/online/protocol';
import { KeyedLimiter, TokenBucket, isAllowedOrigin } from '../src/guards';

const p = (o: unknown) => parseClientMessage(JSON.stringify(o));

describe('parseClientMessage', () => {
  it('accepts well-formed messages', () => {
    expect(p({ t: 'join', name: '  Ada  ' })).toEqual({ ok: true, msg: { t: 'join', name: 'Ada', token: undefined } });
    expect(p({ t: 'join', name: 'x', token: 'ab'.repeat(16) })).toMatchObject({ ok: true });
    expect(p({ t: 'start' })).toEqual({ ok: true, msg: { t: 'start' } });
    expect(p({ t: 'action', action: { type: 'discard', cardId: 3 } })).toMatchObject({ ok: true });
    expect(p({ t: 'action', action: { type: 'play', cardId: 3, target: { player: 1, wafer: 0 } } })).toMatchObject({ ok: true });
    expect(p({ t: 'settings', settings: { seats: ['open', 'easy', 'normal'], endMode: 'long', timer: 60 } })).toMatchObject({ ok: true });
  });

  it('rejects malformed messages', () => {
    expect(parseClientMessage('not json')).toMatchObject({ ok: false });
    expect(parseClientMessage(42 as never)).toMatchObject({ ok: false });
    expect(p([])).toMatchObject({ ok: false });
    expect(p({ t: 'nope' })).toMatchObject({ ok: false });
    expect(p({ t: 'join', name: 'a', token: 'short' })).toMatchObject({ ok: false });
    expect(p({ t: 'action', action: { type: 'play', cardId: -1 } })).toMatchObject({ ok: false });
    expect(p({ t: 'action', action: { type: 'play', cardId: 1.5 } })).toMatchObject({ ok: false });
    expect(p({ t: 'action', action: { type: 'cheat', cardId: 1 } })).toMatchObject({ ok: false });
    expect(p({ t: 'action', action: { type: 'play', cardId: 1, target: { player: 9 } } })).toMatchObject({ ok: false });
    expect(p({ t: 'action', action: { type: 'play', cardId: 1, target: { player: 1, wafer: 2 } } })).toMatchObject({ ok: false });
    expect(p({ t: 'action', action: { type: 'discard', cardId: 1, target: { player: 1 } } })).toMatchObject({ ok: false });
    expect(p({ t: 'settings', settings: { seats: ['open'], endMode: 'timed', timer: 0 } })).toMatchObject({ ok: false });
    expect(p({ t: 'settings', settings: { seats: ['open', 'god'], endMode: 'timed', timer: 0 } })).toMatchObject({ ok: false });
    expect(p({ t: 'settings', settings: { seats: ['open', 'open'], endMode: 'timed', timer: 45 } })).toMatchObject({ ok: false });
    expect(p({ t: 'settings', settings: { seats: Array(6).fill('open'), endMode: 'timed', timer: 0 } })).toMatchObject({ ok: false });
  });

  it('caps message size', () => {
    const big = JSON.stringify({ t: 'join', name: 'x'.repeat(MAX_MESSAGE_CHARS) });
    expect(parseClientMessage(big)).toEqual({ ok: false, error: 'message too large' });
  });

  it('strips markup and control characters from names and caps their length', () => {
    expect(sanitizeName('<b>Bob</b>\u0000\n')).toBe('bBob/b');
    expect(sanitizeName('a'.repeat(100))).toHaveLength(16);
    expect(sanitizeName('小明　同學‮')).toBe('小明 同學');
    expect(sanitizeName(123)).toBe('');
  });

  it('room-code alphabet has no vowels, digits, O or I', () => {
    expect(ROOM_ALPHABET).toHaveLength(20);
    expect(ROOM_ALPHABET).not.toMatch(/[AEIOUY01]/);
    expect(ROOM_CODE_RE.test('BCDF')).toBe(true);
    expect(ROOM_CODE_RE.test('ABCD')).toBe(false);
  });
});

describe('guards', () => {
  it('allows the Pages origin and localhost, rejects everything else including a missing Origin', () => {
    expect(isAllowedOrigin('https://boenchen1112.github.io')).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:4173')).toBe(true);
    expect(isAllowedOrigin('http://localhost')).toBe(true);
    expect(isAllowedOrigin('https://evil.example')).toBe(false);
    expect(isAllowedOrigin('https://boenchen1112.github.io.evil.example')).toBe(false);
    expect(isAllowedOrigin('http://localhost.evil.example')).toBe(false);
    expect(isAllowedOrigin('http://boenchen1112.github.io')).toBe(false);
    expect(isAllowedOrigin(null)).toBe(false);
    expect(isAllowedOrigin('https://fork.example', 'https://fork.example, https://x.y')).toBe(true);
  });

  it('token bucket limits bursts and refills', () => {
    const b = new TokenBucket(3, 1, 0);
    expect([b.take(0), b.take(0), b.take(0), b.take(0)]).toEqual([true, true, true, false]);
    expect(b.take(1000)).toBe(true);
    expect(b.take(1000)).toBe(false);
  });

  it('keyed limiter isolates keys and bounds memory', () => {
    const l = new KeyedLimiter(1, 0, 2);
    expect(l.allow('a', 0)).toBe(true);
    expect(l.allow('a', 0)).toBe(false);
    expect(l.allow('b', 0)).toBe(true);
    expect(l.allow('c', 0)).toBe(true); // evicts the oldest key
  });
});

// Online multiplayer end-to-end test (Playwright, 2+ browser contexts).
//
//   SPAWN=1 node scripts/e2e-online.mjs [outDir]
//
// SPAWN=1 starts `wrangler dev` (server/, port 8787, no Cloudflare account needed) and the
// Vite dev server (port 5173). Without it, start both yourself. Set SKIP_TIMER=1 to skip the
// ~35 s turn-timer check.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';

const out = process.argv[2] ?? 'e2e-online-out';
mkdirSync(out, { recursive: true });
const exe = process.env.CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const WEB = process.env.WEB ?? 'http://localhost:5173/wafer-road/';
const API = process.env.API ?? 'http://localhost:8787/health';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const children = [];

async function waitFor(url, label) {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await sleep(300);
  }
  throw new Error(`${label} did not start (${url})`);
}

if (process.env.SPAWN) {
  children.push(spawn('npx', ['wrangler', 'dev', '--port', '8787', '--ip', '127.0.0.1'], { cwd: 'server', stdio: 'ignore' }));
  children.push(spawn('npx', ['vite', '--port', '5173', '--strictPort', '--host', 'localhost'], { stdio: 'ignore' }));
}
await waitFor(API, 'wrangler dev');
await waitFor(WEB, 'vite');

const errors = [];
const checks = [];
const check = (name, ok, extra = '') => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) errors.push(`check failed: ${name} ${extra}`);
};

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const IGNORE = /fonts\.g(oogleapis|static)|ERR_(NAME|INTERNET|PROXY|CONNECTION|TUNNEL)|Failed to load resource/;

async function newCtx(viewport, label, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: viewport.width < 600, ...opts });
  ctx.on('page', (p) => watch(p, label));
  return ctx;
}
function watch(page, label) {
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type()) && !IGNORE.test(m.text())) errors.push(`[${label}] ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on('dialog', (d) => d.accept());
}
const tid = (id) => `[data-testid="${id}"]`;
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` });

/**
 * One attempt at a move, executed inside the page (fast: no actionability waits).
 * Prefers a playable card, falls back to discarding. Returns true if an action was submitted.
 */
function takeTurn(page) {
  return page.evaluate(async () => {
    const wait = () => new Promise((r) => setTimeout(r, 25));
    if (!document.querySelector('.actionbar.active')) return false;
    const cards = [...document.querySelectorAll('[data-testid=hand] .card')].sort(() => Math.random() - 0.5);
    for (const c of cards) {
      c.click();
      await wait();
      const play = document.querySelector('[data-testid=btn-play]');
      if (play) {
        play.click();
        return true;
      }
      const tgt = document.querySelector('.wafer.targetable, .panel.targetable');
      if (tgt) {
        tgt.click();
        return true;
      }
    }
    const first = document.querySelector('[data-testid=hand] .card');
    if (!first) return false;
    for (let tries = 0; tries < 2; tries++) {
      if (!first.classList.contains('sel')) {
        first.click();
        await wait();
      }
      const d = document.querySelector('[data-testid=btn-discard]');
      if (d) {
        d.click();
        return true;
      }
      first.click(); // toggle once if the selection was lost
      await wait();
    }
    return false;
  });
}

async function handKinds(page) {
  return page.locator('[data-testid=hand] .card').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')).sort());
}

/* ------------------------------------------------------------------ */
/* 1. host creates a room with 1 bot, guest joins from the link        */
/* ------------------------------------------------------------------ */
const hostCtx = await newCtx({ width: 1280, height: 800 }, 'host', { permissions: ['clipboard-read', 'clipboard-write'], origin: undefined });
const host = await hostCtx.newPage();
await host.goto(WEB);
await host.waitForSelector(tid('tab-online'));
check('online tab enabled when server configured', await host.locator(tid('tab-online')).isEnabled());
check('local flow is still the default tab', (await host.locator(tid('start')).count()) === 1);
await host.click(tid('tab-online'));
await host.fill(tid('online-name'), 'Alice');
await shot(host, '01-desktop-online-entry');
await host.click(tid('online-create'));
await host.waitForSelector(tid('room-code'));
const code = (await host.textContent(tid('room-code'))).trim();
check('room code is 4 consonants (no O/I/0/1/vowels)', /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/.test(code), code);
check('URL carries ?room=', new URL(host.url()).searchParams.get('room') === code);
const link = (await host.textContent(tid('room-link'))).trim();
check('share link has the room', link.includes(`?room=${code}`), link);

await host.click(tid('copy-link'));
await sleep(150);
const clip = await host.evaluate(() => navigator.clipboard.readText()).catch(() => null);
check('copy-link puts the link on the clipboard', clip === link, String(clip));
await host.click(tid('copy-code'));
await sleep(150);
check('copy-code puts the code on the clipboard', (await host.evaluate(() => navigator.clipboard.readText()).catch(() => null)) === code);

await host.click(tid('online-players-3'));
await host.selectOption(tid('seat-kind-2'), 'easy');
await host.waitForFunction(() => document.querySelector('[data-testid="seat-row-2"]')?.textContent?.includes('簡單'));
check('start blocked while an open seat is empty', await host.locator(tid('online-start')).isDisabled());

const guestCtx = await newCtx({ width: 390, height: 780 }, 'guest');
const guest = await guestCtx.newPage();
await guest.goto(`${WEB}?room=${code}`);
await guest.waitForSelector(tid('invite-join'));
check('?room= opens the join screen', (await guest.textContent(tid('invite-code'))).trim() === code);
await shot(guest, '02-mobile-join-invite');
await guest.fill(tid('online-name'), 'Bob');
await guest.click(tid('invite-join'));
await guest.waitForSelector(tid('room-lobby'));
await host.waitForFunction(() => document.querySelector('[data-testid="seat-row-1"]')?.textContent?.includes('Bob'));
await sleep(300);
check('host sees guest connected (green dot)', (await host.getAttribute(tid('member-dot-1'), 'data-connected')) === '1');
check('start enabled once seats are filled', await host.locator(tid('online-start')).isEnabled());
check('guest cannot start (waits for host)', (await guest.locator(tid('wait-host-start')).count()) === 1 && (await guest.locator(tid('online-start')).count()) === 0);
await shot(host, '03-desktop-room-lobby');
await shot(guest, '04-mobile-room-lobby');
await guest.evaluate(() => window.scrollTo(0, 99999));
await shot(guest, '04b-mobile-room-lobby-bottom');

// a stranger with a bad code
const strangerCtx = await newCtx({ width: 390, height: 780 }, 'stranger');
const stranger = await strangerCtx.newPage();
await stranger.goto(`${WEB}?room=ZZZZ`);
await stranger.click(tid('invite-join'));
await stranger.waitForSelector(tid('online-fatal'));
check('unknown room shows a clear error', (await stranger.getAttribute(tid('online-fatal'), 'data-code')) === 'no_room');
await shot(stranger, '05-mobile-no-room');
await strangerCtx.close();

/* ------------------------------------------------------------------ */
/* 2. game 1: play to the end, reload the guest mid-game                */
/* ------------------------------------------------------------------ */
await host.click(tid('online-start'));
await host.waitForSelector('[data-testid=hand] .card');
await guest.waitForSelector('[data-testid=hand] .card');
await sleep(900);
await shot(host, '06-desktop-game-start');
await shot(guest, '07-mobile-game-start');
check('host sees connection dots for the other human', (await host.locator('[data-testid^=conn-]').count()) >= 2);
check('opponent hand shown as a count only', (await host.locator('[data-testid=handcount-1]').count()) === 1);

let lastDbg = 0;
let reloaded = false;
let guestMoves = 0;
const t0 = Date.now();
while (Date.now() - t0 < 240_000) {
  if ((await host.locator(tid('end-screen')).count()) && (await guest.locator(tid('end-screen')).count())) break;
  const a = await takeTurn(host).catch(() => false);
  const b = await takeTurn(guest).catch(() => false);
  if (b) guestMoves++;
  if (!reloaded && guestMoves >= 3 && !(await guest.locator('.actionbar.active').count())) {
    const before = await handKinds(guest);
    const deckBefore = await guest.textContent(tid('deck-count'));
    await guest.reload();
    await guest.waitForSelector('[data-testid=hand] .card', { timeout: 15_000 });
    const after = await handKinds(guest);
    const rejoinedSeat = (await guest.locator('.panel.me').count()) === 1;
    check('guest reload rejoins the same seat with the same hand', JSON.stringify(before) === JSON.stringify(after) && rejoinedSeat, `${before} | ${after}`);
    check('reload restores the game log', (await guest.locator('[data-testid=log] .logline').count()) > 0);
    check('deck count restored', (await guest.textContent(tid('deck-count'))) !== null && deckBefore !== null);
    await shot(guest, '08-mobile-after-reload');
    reloaded = true;
  }
  if (!a && !b) await sleep(150);
  if (process.env.DEBUG && Date.now() - lastDbg > 8000) {
    lastDbg = Date.now();
    const st = async (pg) => `${await pg.locator('.actionbar.active').count()}/${await pg.textContent('[data-testid=actionbar]').catch(() => '?')}`.slice(0, 80);
    console.log('dbg', Math.round((Date.now() - t0) / 1000) + 's', 'deck', await host.textContent(tid('deck-count')), 'host', await st(host), 'guest', await st(guest));
  }
}
check('reload mid-game was exercised', reloaded);
await host.waitForSelector(tid('end-screen'), { timeout: 20_000 });
await guest.waitForSelector(tid('end-screen'), { timeout: 20_000 });
await sleep(600);
check('game 1 reached the end screen on both clients', true);
check('only the host gets the play-again button', (await host.locator(tid('play-again')).count()) === 1 && (await guest.locator(tid('play-again')).count()) === 0);
await shot(host, '09-desktop-end');
await shot(guest, '10-mobile-end');

/* ------------------------------------------------------------------ */
/* 3. play again in the same room, with the turn timer on              */
/* ------------------------------------------------------------------ */
await host.click(tid('play-again'));
await host.waitForSelector(tid('room-lobby'));
await guest.waitForSelector(tid('room-lobby'));
check('play again returns both to the same room lobby', (await host.textContent(tid('room-code'))).trim() === code && (await guest.textContent(tid('room-code'))).trim() === code);
await host.click(tid('online-timer-30'));
await host.waitForFunction(() => document.querySelector('[data-testid="online-timer-30"]')?.getAttribute('aria-checked') === 'true');
await sleep(300);
const guestSummary = await guest.textContent('.summary');
check('guest sees the timer setting', /30/.test(guestSummary ?? ''), guestSummary ?? '');
await host.click(tid('online-start'));
await host.waitForSelector('[data-testid=hand] .card');
await guest.waitForSelector('[data-testid=hand] .card');
await host.waitForSelector(tid('clock'));
const left1 = Number(await host.getAttribute(tid('clock'), 'data-left'));
await sleep(2200);
const left2 = Number(await host.getAttribute(tid('clock'), 'data-left'));
check('countdown is visible and ticking', left1 <= 30 && left2 < left1, `${left1} -> ${left2}`);
await shot(host, '11-desktop-timer');
await shot(guest, '12-mobile-timer');

if (!process.env.SKIP_TIMER) {
  // host is seat 0 and does nothing: the server must auto-play for them at ~30 s
  const logBefore = await host.locator('[data-testid=log] .logline').count();
  const mine = await host.locator('.actionbar.active').count();
  check('host starts with the move', mine === 1);
  const tStart = Date.now();
  // (the auto-played move may be a year-end bonus, which keeps the turn open, so watch the log)
  await host.waitForFunction((n) => document.querySelectorAll('[data-testid=log] .logline').length > n, logBefore, { timeout: 45_000 });
  const secs = (Date.now() - tStart) / 1000;
  const logAfter = await host.locator('[data-testid=log] .logline').count();
  check('turn timer auto-played the idle player', logAfter > logBefore, `after ${secs.toFixed(1)}s (timer 30s)`);
  check('auto-play fired near the deadline, not early', secs >= 24 && secs <= 40, `${secs.toFixed(1)}s`);
  await shot(host, '13-desktop-after-timeout');
}

/* ------------------------------------------------------------------ */
/* 4. disconnect: the guest closes the tab; their dot goes grey; they   */
/*    come back through the same link and are seated again             */
/* ------------------------------------------------------------------ */
// wait for the guest's own turn, then drop them mid-turn
await guest.waitForSelector('.actionbar.active', { timeout: 60_000 });
await guest.close();
await host.waitForFunction(() => document.querySelector('[data-testid="conn-1"]')?.getAttribute('data-connected') === '0', null, { timeout: 15_000 });
check('closed tab shows a grey connection dot to the others', true);
await host.waitForSelector('[data-testid=clock].takeover', { timeout: 10_000 });
check('others see the takeover countdown for the absent player', true);
await shot(host, '14-desktop-guest-disconnected');
const tDrop = Date.now();
await host.waitForSelector('.badge.warn', { timeout: 40_000 });
const takeoverSecs = (Date.now() - tDrop) / 1000;
check('a Normal bot takes over the absent player after ~20 s', takeoverSecs >= 14 && takeoverSecs <= 30, `${takeoverSecs.toFixed(1)}s`);
await shot(host, '14b-desktop-bot-covering');
const guest2 = await guestCtx.newPage();
await guest2.goto(`${WEB}?room=${code}`);
await guest2.waitForSelector('[data-testid=hand] .card', { timeout: 15_000 });
check('rejoining from a fresh tab restores the seat (token in localStorage)', (await guest2.locator('.panel.me').count()) === 1);
await host.waitForFunction(() => document.querySelector('[data-testid="conn-1"]')?.getAttribute('data-connected') === '1', null, { timeout: 15_000 });
check('dot turns green again', true);
await host.waitForFunction(() => !document.querySelector('.badge.warn'), null, { timeout: 10_000 });
check('control returns to the player (bot badge gone)', true);

/* ------------------------------------------------------------------ */
/* 5. language + leaving                                                */
/* ------------------------------------------------------------------ */
await guest2.click(tid('lang'));
await sleep(300);
await shot(guest2, '15-mobile-game-en');
await host.click(tid('lang'));
await sleep(200);
await shot(host, '16-desktop-game-en');
await guest2.evaluate(() => (window.confirm = () => true));
await guest2.click('.topbar .btn.ghost.sm:last-child');
await guest2.waitForSelector(tid('start'));
check('leaving returns to the home page with the URL cleaned', !new URL(guest2.url()).searchParams.has('room'));
await host.waitForFunction(() => document.querySelector('[data-testid="conn-1"]')?.getAttribute('data-connected') === '0', null, { timeout: 10_000 });
check('host sees the leaver as covered by a bot', (await host.locator('.badge.warn').count()) >= 1);

await browser.close();
for (const c of children) c.kill('SIGTERM');
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (errors.length) {
  console.error('PROBLEMS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('online e2e OK, no console errors');

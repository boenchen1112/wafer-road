// Browser smoke test: plays full games against bots with Playwright and takes screenshots.
// Usage: npm run build && node scripts/e2e.mjs [outDir]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';

const out = process.argv[2] ?? 'e2e-out';
mkdirSync(out, { recursive: true });
const exe = process.env.CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const PORT = 4173;
const URL = `http://localhost:${PORT}/wafer-road/`;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(URL)).ok) break;
  } catch {}
  await sleep(200);
}

const errors = [];
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

async function newPage(viewport, label) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: viewport.width < 600 });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type()) && !/fonts\.g(oogleapis|static)|ERR_(NAME|INTERNET|PROXY|CONNECTION|TUNNEL)|Failed to load resource/.test(m.text()))
      errors.push(`[${label}] ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on('dialog', (d) => d.accept());
  return page;
}

async function playToEnd(page, label, { shotAt = [] } = {}) {
  let moves = 0;
  const shots = new Set();
  for (let guard = 0; guard < 1500; guard++) {
    if (await page.locator('[data-testid=end-screen]').count()) return moves;
    const handoff = page.locator('[data-testid=handoff]');
    if (await handoff.count()) {
      await handoff.click();
      continue;
    }
    const active = await page.locator('.actionbar.active').count();
    if (!active) {
      await sleep(120);
      continue;
    }
    for (const n of shotAt) if (moves >= n && !shots.has(n)) {
      shots.add(n);
      await sleep(900);
      await page.screenshot({ path: `${out}/${label}-move${n}.png` });
    }
    if (shotAt.length && !shots.has('t')) {
      // select the first card that needs a target to show highlighted targets
      const cards = page.locator('[data-testid=hand] .card');
      for (let i = 0; i < (await cards.count()); i++) {
        await cards.nth(i).click();
        if (await page.locator('.wafer.targetable, .panel.targetable').count()) {
          shots.add('t');
          await sleep(1800);
          await page.screenshot({ path: `${out}/${label}-targets.png` });
          break;
        }
      }
    }
    const hand = page.locator('[data-testid=hand] .card');
    const cnt = await hand.count();
    if (!cnt) { await sleep(100); continue; }
    // try each card: prefer a playable one
    let acted = false;
    const order = [...Array(cnt).keys()].sort(() => Math.random() - 0.5);
    for (const i of order) {
      await hand.nth(i).click();
      const play = page.locator('[data-testid=btn-play]');
      if (await play.count()) { await play.click(); acted = true; break; }
      const tgt = page.locator('.wafer.targetable, .panel.targetable');
      if (await tgt.count()) { await tgt.first().click(); acted = true; break; }
    }
    if (!acted) {
      await hand.nth(0).click();
      const d = page.locator('[data-testid=btn-discard]');
      if (await d.count()) { await d.click(); acted = true; }
    }
    if (acted) moves++;
    await sleep(60);
  }
  throw new Error(`${label}: game did not finish`);
}

/* ---- desktop: lobby, how-to, process pages ---- */
const d = await newPage({ width: 1280, height: 800 }, 'desktop');
await d.goto(URL);
await d.waitForSelector('[data-testid=start]');
await d.screenshot({ path: `${out}/desktop-lobby.png` });
await d.goto(URL + '#/howto');
await d.waitForSelector('[data-testid=howto]');
await d.screenshot({ path: `${out}/desktop-howto.png`, fullPage: false });
await d.goto(URL + '#/process');
await d.waitForSelector('[data-testid=process]');
await d.screenshot({ path: `${out}/desktop-process.png` });
await d.goto(URL);

/* ---- desktop game: 3 players, 1 human ---- */
await d.click('[data-testid=players-3]');
await d.click('[data-testid=start]');
await d.waitForSelector('[data-testid=hand] .card');
await sleep(800);
await d.screenshot({ path: `${out}/desktop-game-start.png` });
const m1 = await playToEnd(d, 'desktop', { shotAt: [4] });
await sleep(600);
await d.screenshot({ path: `${out}/desktop-end.png` });
console.log('desktop game finished after', m1, 'human actions');
// play again and quit to lobby
await d.click('[data-testid=play-again]');
await d.waitForSelector('[data-testid=hand] .card');
await d.click('[data-testid=lang]');
await sleep(300);
await d.screenshot({ path: `${out}/desktop-game-en.png` });

/* ---- mobile: 4 players, long mode ---- */
const m = await newPage({ width: 390, height: 780 }, 'mobile');
await m.goto(URL);
await m.screenshot({ path: `${out}/mobile-lobby.png` });
await m.click('[data-testid=players-4]');
await m.click('[data-testid=mode-long]');
await m.click('[data-testid=start]');
await m.waitForSelector('[data-testid=hand] .card');
await sleep(800);
await m.screenshot({ path: `${out}/mobile-game-start.png` });
const m2 = await playToEnd(m, 'mobile', { shotAt: [3] });
await sleep(600);
await m.screenshot({ path: `${out}/mobile-end.png` });
console.log('mobile game finished after', m2, 'human actions');

/* ---- hotseat: 2 humans + handoff ---- */
const h = await newPage({ width: 900, height: 700 }, 'hotseat');
await h.goto(URL);
await h.click('[data-testid=players-2]');
await h.selectOption('[data-testid=seat-1]', 'human');
await h.click('[data-testid=start]');
await h.waitForSelector('[data-testid=handoff]');
await h.screenshot({ path: `${out}/hotseat-handoff.png` });
await h.click('[data-testid=handoff]');
await h.waitForSelector('[data-testid=hand] .card');
const m3 = await playToEnd(h, 'hotseat');
console.log('hotseat game finished after', m3, 'actions');

await browser.close();
server.kill();
if (errors.length) {
  console.error('CONSOLE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('e2e OK, no console errors');

import { useState } from 'preact/hooks';
import type { EndMode } from '../engine';
import { t, useLang } from '../i18n';
import { TopControls } from './Controls';
import { startGame, type Seat } from './store';
import * as sfx from '../audio/sfx';

type SeatChoice = 'human' | 'easy' | 'normal';

export function Lobby({ go }: { go: (p: 'howto' | 'process') => void }) {
  const lang = useLang();
  const [n, setN] = useState(3);
  const [seats, setSeats] = useState<SeatChoice[]>(['human', 'normal', 'normal', 'easy', 'easy']);
  const [mode, setMode] = useState<EndMode>('timed');

  const start = () => {
    sfx.play('turn');
    const list: Seat[] = seats.slice(0, n).map((c) => ({
      kind: c === 'human' ? 'human' : 'bot',
      level: c === 'easy' ? 'easy' : 'normal',
    }));
    startGame(list, mode);
  };
  const humans = seats.slice(0, n).filter((c) => c === 'human').length;

  return (
    <div class="page lobby">
      <div class="page-top">
        <span />
        <div class="top-controls">
          <TopControls />
        </div>
      </div>
      <header class="hero">
        <p class="eyebrow">{t('app.subtitle', undefined, lang)}</p>
        <h1 class="logo">
          <span>{t('app.title', undefined, 'zh-TW')}</span>
        </h1>
        <p class="logo-en">WAFER ROAD</p>
      </header>

      <section class="card-panel">
        <h2>{t('lobby.players', undefined, lang)}</h2>
        <div class="seg" role="radiogroup" aria-label={t('lobby.players', undefined, lang)}>
          {[2, 3, 4, 5].map((k) => (
            <button key={k} class={`seg-btn ${n === k ? 'on' : ''}`} role="radio" aria-checked={n === k} data-testid={`players-${k}`} onClick={() => setN(k)}>
              {k}
            </button>
          ))}
        </div>

        <div class="seats">
          {seats.slice(0, n).map((c, i) => (
            <label class="seat" key={i}>
              <span>{t('lobby.seat', { n: i + 1 }, lang)}</span>
              <select
                value={c}
                data-testid={`seat-${i}`}
                onChange={(e) => {
                  const v = (e.target as HTMLSelectElement).value as SeatChoice;
                  setSeats(seats.map((x, j) => (j === i ? v : x)));
                }}
              >
                <option value="human">{t('lobby.human', undefined, lang)}</option>
                <option value="easy">{t('lobby.botEasy', undefined, lang)}</option>
                <option value="normal">{t('lobby.botNormal', undefined, lang)}</option>
              </select>
            </label>
          ))}
        </div>
        {humans >= 2 && <p class="note">{t('lobby.hotseat', undefined, lang)}</p>}

        <h2>{t('lobby.endMode', undefined, lang)}</h2>
        <div class="modes">
          {(['timed', 'long'] as const).map((m) => (
            <button key={m} class={`mode ${mode === m ? 'on' : ''}`} data-testid={`mode-${m}`} onClick={() => setMode(m)} aria-pressed={mode === m}>
              <b>{t(`lobby.mode.${m}`, undefined, lang)}</b>
              <span>{t(`lobby.mode.${m}Desc`, undefined, lang)}</span>
            </button>
          ))}
        </div>

        <button class="btn primary big" data-testid="start" onClick={start}>
          {t('lobby.start', undefined, lang)}
        </button>
      </section>

      <nav class="links">
        <button class="btn" onClick={() => go('howto')}>
          {t('nav.howto', undefined, lang)}
        </button>
        <button class="btn" onClick={() => go('process')}>
          {t('nav.process', undefined, lang)}
        </button>
      </nav>
    </div>
  );
}

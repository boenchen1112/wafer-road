import { useState } from 'preact/hooks';
import type { EndMode } from '../engine';
import { t, useLang } from '../i18n';
import { TopControls } from './Controls';
import { onlineConfigured } from '../online/client';
import { OnlineEntry } from './Online';
import { startGame, type Seat } from './store';
import * as sfx from '../audio/sfx';

type SeatChoice = 'human' | 'easy' | 'normal';

export function Lobby({ go, initialTab = 'local' }: { go: (p: 'howto' | 'process') => void; initialTab?: 'local' | 'online' }) {
  const lang = useLang();
  const configured = onlineConfigured();
  const [tab, setTab] = useState<'local' | 'online'>(initialTab === 'online' && configured ? 'online' : 'local');
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

      <div class="tabs" role="tablist">
        <button role="tab" class={`tab ${tab === 'local' ? 'on' : ''}`} aria-selected={tab === 'local'} data-testid="tab-local" onClick={() => setTab('local')}>
          {t('online.tab.local', undefined, lang)}
        </button>
        <button
          role="tab"
          class={`tab ${tab === 'online' ? 'on' : ''}`}
          aria-selected={tab === 'online'}
          disabled={!configured}
          data-testid="tab-online"
          onClick={() => setTab('online')}
        >
          {t('online.tab.online', undefined, lang)}
        </button>
      </div>
      {!configured && (
        <p class="note muted center" data-testid="online-unconfigured">
          {t('online.notConfigured', undefined, lang)}
        </p>
      )}

      {tab === 'online' ? (
        <OnlineEntry />
      ) : (
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
      )}

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

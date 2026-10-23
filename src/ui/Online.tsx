import { useState } from 'preact/hooks';
import {
  ROOM_CODE_RE,
  TIMER_OPTIONS,
  type RoomSettings,
  type RoomView,
  type SeatSetting,
  type TimerSetting,
} from '../online/protocol';
import {
  createRoom,
  dismissRoom,
  inviteLink,
  leaveRoom,
  normalizeCode,
  onlineConfigured,
  onlineModel,
  openRoom,
  savedName,
  sendSettings,
  startOnlineGame,
  type OnlineState,
} from '../online/client';
import { t, useLang, type Lang } from '../i18n';
import * as sfx from '../audio/sfx';
import { TopControls } from './Controls';
import { GameView } from './GameView';

const NAME_MAX = 16;

function errText(code: string, lang: Lang): string {
  const k = `online.err.${code}`;
  const s = t(k, undefined, lang);
  return s === k ? t('online.err.generic', undefined, lang) : s;
}

function Toast({ o, lang }: { o: OnlineState; lang: Lang }) {
  if (!o.notice) return null;
  return (
    <div class="toast" role="alert" data-testid="toast">
      {errText(o.notice.code, lang)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* entry (inside the home page, "Online" tab)                          */
/* ------------------------------------------------------------------ */

export function OnlineEntry() {
  const lang = useLang();
  const [name, setName] = useState(savedName());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const cleanName = () => name.trim() || t('online.defaultName', undefined, lang);

  const create = async () => {
    sfx.play('turn');
    setBusy(true);
    setErr('');
    try {
      await createRoom(cleanName());
    } catch (e) {
      const m = (e as Error).message;
      setErr(t(m === 'rate' ? 'online.errRate' : m === 'server' ? 'online.errServer' : 'online.errNetwork', undefined, lang));
    }
    setBusy(false);
  };
  const join = () => {
    if (!ROOM_CODE_RE.test(code)) {
      setErr(t('online.errCode', undefined, lang));
      return;
    }
    sfx.play('turn');
    openRoom(code, cleanName());
  };

  return (
    <section class="card-panel" data-testid="online-entry">
      <h2>{t('online.name', undefined, lang)}</h2>
      <input
        class="text-input"
        data-testid="online-name"
        value={name}
        maxLength={NAME_MAX}
        placeholder={t('online.namePlaceholder', undefined, lang)}
        autocomplete="nickname"
        onInput={(e) => setName((e.target as HTMLInputElement).value)}
      />
      <button class="btn primary big" data-testid="online-create" disabled={busy} onClick={create}>
        {busy ? t('online.creating', undefined, lang) : t('online.create', undefined, lang)}
      </button>

      <h2>{t('online.orJoin', undefined, lang)}</h2>
      <div class="join-row">
        <input
          class="text-input code-input"
          data-testid="online-code-input"
          aria-label={t('online.codeLabel', undefined, lang)}
          value={code}
          maxLength={4}
          inputMode="text"
          autocapitalize="characters"
          autocomplete="off"
          spellcheck={false}
          placeholder={t('online.codePlaceholder', undefined, lang)}
          onInput={(e) => setCode(normalizeCode((e.target as HTMLInputElement).value))}
          onKeyDown={(e) => e.key === 'Enter' && join()}
        />
        <button class="btn primary" data-testid="online-join" disabled={code.length !== 4} onClick={join}>
          {t('online.join', undefined, lang)}
        </button>
      </div>
      {err && (
        <p class="note warn" role="alert" data-testid="online-error">
          {err}
        </p>
      )}
    </section>
  );
}

/** Landing page for a shared link (?room=ABCD) when we are not in that room yet. */
export function JoinInvite({ code, back }: { code: string; back: () => void }) {
  const lang = useLang();
  const [name, setName] = useState(savedName());
  const configured = onlineConfigured();
  const go = () => {
    sfx.play('turn');
    openRoom(code, name.trim() || t('online.defaultName', undefined, lang));
  };
  return (
    <div class="page lobby">
      <div class="page-top">
        <button class="btn ghost sm" onClick={back}>
          ← {t('online.back', undefined, lang)}
        </button>
        <div class="top-controls">
          <TopControls />
        </div>
      </div>
      <header class="hero">
        <p class="eyebrow">{t('online.joinTitle', { code }, lang)}</p>
        <div class="room-code big" data-testid="invite-code" aria-label={t('online.roomLabel', undefined, lang)}>
          {code}
        </div>
      </header>
      <section class="card-panel">
        <h2>{t('online.name', undefined, lang)}</h2>
        <input
          class="text-input"
          data-testid="online-name"
          value={name}
          maxLength={NAME_MAX}
          placeholder={t('online.namePlaceholder', undefined, lang)}
          autocomplete="nickname"
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === 'Enter' && configured && go()}
        />
        <p class="note muted">{t('online.joinHint', undefined, lang)}</p>
        <button class="btn primary big" data-testid="invite-join" disabled={!configured} onClick={go}>
          {t('online.join', undefined, lang)}
        </button>
        {!configured && <p class="note warn">{t('online.notConfigured', undefined, lang)}</p>}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* in a room                                                           */
/* ------------------------------------------------------------------ */

export function OnlineScreen({ o }: { o: OnlineState }) {
  const lang = useLang();
  if (o.fatal) {
    const key = `online.fatal.${o.fatal.code}`;
    const msg = t(key, undefined, lang);
    return (
      <div class="page lobby">
        <div class="page-top">
          <span />
          <div class="top-controls">
            <TopControls />
          </div>
        </div>
        <section class="card-panel fatal" role="alert" data-testid="online-fatal" data-code={o.fatal.code}>
          <h2>{o.code}</h2>
          <p>{msg === key ? t('online.fatal.generic', undefined, lang) : msg}</p>
          <button class="btn primary big" data-testid="fatal-back" onClick={dismissRoom}>
            {t('online.fatalBack', undefined, lang)}
          </button>
        </section>
      </div>
    );
  }
  const m = onlineModel(o);
  if (m) {
    return (
      <>
        <GameView key={m.gameKey} m={m} />
        <Toast o={o} lang={lang} />
      </>
    );
  }
  if (!o.room) {
    return (
      <div class="page lobby">
        <div class="page-top">
          <button class="btn ghost sm" onClick={leaveRoom}>
            ← {t('online.back', undefined, lang)}
          </button>
          <div class="top-controls">
            <TopControls />
          </div>
        </div>
        <section class="card-panel" role="status" data-testid="online-connecting">
          <h2>{o.code}</h2>
          <p>{t(o.link === 'reconnecting' ? 'online.reconnecting' : 'online.connecting', undefined, lang)}</p>
        </section>
      </div>
    );
  }
  return <RoomLobby o={o} room={o.room} lang={lang} />;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function RoomLobby({ o, room, lang }: { o: OnlineState; room: RoomView; lang: Lang }) {
  const isHost = room.you.isHost;
  const s = room.settings;
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const link = inviteLink(room.code);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const flash = (k: 'code' | 'link') => {
    setCopied(k);
    setTimeout(() => setCopied((c) => (c === k ? null : c)), 1600);
  };
  const share = async () => {
    try {
      await navigator.share({ title: t('app.title', undefined, 'zh-TW'), text: t('online.shareText', { code: room.code }, lang), url: link });
    } catch {
      /* user cancelled */
    }
  };

  const memberAtSeat = (i: number) => room.members.find((m) => m.seat === i);
  const maxOccupied = room.members.reduce((n, m) => (m.seat !== null ? Math.max(n, m.seat + 1) : n), 0);
  const update = (patch: Partial<RoomSettings>) => sendSettings({ ...s, ...patch });
  const setCount = (n: number) => {
    const seats: SeatSetting[] = s.seats.slice(0, n);
    while (seats.length < n) seats.push('normal');
    update({ seats });
  };
  const openEmpty = s.seats.some((k, i) => k === 'open' && !memberAtSeat(i));

  return (
    <div class="page lobby room" data-testid="room-lobby">
      <div class="page-top">
        <button
          class="btn ghost sm"
          data-testid="online-leave"
          onClick={() => {
            if (window.confirm(t('online.leaveConfirm', undefined, lang))) leaveRoom();
          }}
        >
          ← {t('online.leave', undefined, lang)}
        </button>
        <div class="top-controls">
          <TopControls />
        </div>
      </div>

      <header class="hero compact">
        <p class="eyebrow">{t('online.roomLabel', undefined, lang)}</p>
        <div class="room-code" data-testid="room-code">
          {room.code}
        </div>
        <div class="share-row">
          <button class="btn sm" data-testid="copy-code" onClick={async () => (await copyText(room.code)) && flash('code')}>
            {copied === 'code' ? t('online.copied', undefined, lang) : t('online.copyCode', undefined, lang)}
          </button>
          <button class="btn sm" data-testid="copy-link" onClick={async () => (await copyText(link)) && flash('link')}>
            {copied === 'link' ? t('online.copied', undefined, lang) : t('online.copyLink', undefined, lang)}
          </button>
          {canShare && (
            <button class="btn sm" data-testid="share" onClick={share}>
              {t('online.share', undefined, lang)}
            </button>
          )}
        </div>
        <p class="link-line" data-testid="room-link">
          {link}
        </p>
      </header>

      <section class="card-panel">
        <h2>
          {t('online.members', undefined, lang)} ({room.members.length}/{s.seats.length})
        </h2>
        <ul class="members" data-testid="members">
          {s.seats.map((kind, i) => {
            const m = memberAtSeat(i);
            return (
              <li class={`member ${m ? '' : 'empty'}`} key={i} data-testid={`seat-row-${i}`}>
                <span class="seat-no">{t('lobby.seat', { n: i + 1 }, lang)}</span>
                {kind === 'open' ? (
                  m ? (
                    <>
                      <i class={`conn-dot ${m.connected ? 'on' : 'off'}`} data-testid={`member-dot-${i}`} data-connected={m.connected ? '1' : '0'} />
                      <span class="mname">
                        {m.name}
                        {m.id === room.you.id && <small> ({t('online.you', undefined, lang)})</small>}
                      </span>
                      {m.isHost && <span class="badge host">{t('online.hostBadge', undefined, lang)}</span>}
                    </>
                  ) : (
                    <span class="mname wait">{t('online.waitingPlayer', undefined, lang)}</span>
                  )
                ) : (
                  <span class="mname">{t(kind === 'easy' ? 'lobby.botEasy' : 'lobby.botNormal', undefined, lang)}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section class="card-panel">
        <h2>{t('online.settings', undefined, lang)}</h2>
        {isHost ? (
          <>
            <h3 class="sub">{t('lobby.players', undefined, lang)}</h3>
            <div class="seg" role="radiogroup" aria-label={t('lobby.players', undefined, lang)}>
              {[2, 3, 4, 5].map((k) => (
                <button
                  key={k}
                  class={`seg-btn ${s.seats.length === k ? 'on' : ''}`}
                  role="radio"
                  aria-checked={s.seats.length === k}
                  data-testid={`online-players-${k}`}
                  disabled={k < maxOccupied}
                  onClick={() => setCount(k)}
                >
                  {k}
                </button>
              ))}
            </div>
            <div class="seats">
              {s.seats.map((kind, i) => {
                const m = memberAtSeat(i);
                return (
                  <label class="seat" key={i}>
                    <span>{t('lobby.seat', { n: i + 1 }, lang)}</span>
                    <select
                      value={kind}
                      disabled={!!m}
                      data-testid={`seat-kind-${i}`}
                      onChange={(e) => update({ seats: s.seats.map((x, j) => (j === i ? ((e.target as HTMLSelectElement).value as SeatSetting) : x)) })}
                    >
                      <option value="open">{t('online.seatOpen', undefined, lang)}</option>
                      <option value="easy">{t('lobby.botEasy', undefined, lang)}</option>
                      <option value="normal">{t('lobby.botNormal', undefined, lang)}</option>
                    </select>
                  </label>
                );
              })}
            </div>

            <h3 class="sub">{t('lobby.endMode', undefined, lang)}</h3>
            <div class="modes">
              {(['timed', 'long'] as const).map((md) => (
                <button key={md} class={`mode ${s.endMode === md ? 'on' : ''}`} data-testid={`online-mode-${md}`} aria-pressed={s.endMode === md} onClick={() => update({ endMode: md })}>
                  <b>{t(`lobby.mode.${md}`, undefined, lang)}</b>
                  <span>{t(`lobby.mode.${md}Desc`, undefined, lang)}</span>
                </button>
              ))}
            </div>

            <h3 class="sub">{t('online.timer', undefined, lang)}</h3>
            <div class="seg" role="radiogroup" aria-label={t('online.timer', undefined, lang)}>
              {TIMER_OPTIONS.map((tm) => (
                <button
                  key={tm}
                  class={`seg-btn small ${s.timer === tm ? 'on' : ''}`}
                  role="radio"
                  aria-checked={s.timer === tm}
                  data-testid={`online-timer-${tm}`}
                  onClick={() => update({ timer: tm as TimerSetting })}
                >
                  {tm === 0 ? t('online.timerOff', undefined, lang) : t('online.timerSec', { n: tm }, lang)}
                </button>
              ))}
            </div>
            <p class="note muted">{t('online.timerHint', undefined, lang)}</p>

            <button class="btn primary big" data-testid="online-start" disabled={openEmpty} onClick={startOnlineGame}>
              {t('online.start', undefined, lang)}
            </button>
            {openEmpty && <p class="note warn">{t('online.needPlayers', undefined, lang)}</p>}
          </>
        ) : (
          <>
            <dl class="summary">
              <dt>{t('lobby.endMode', undefined, lang)}</dt>
              <dd>{t(`lobby.mode.${s.endMode}`, undefined, lang)}</dd>
              <dt>{t('online.timer', undefined, lang)}</dt>
              <dd>{s.timer === 0 ? t('online.timerOff', undefined, lang) : t('online.timerSec', { n: s.timer }, lang)}</dd>
            </dl>
            <p class="note" data-testid="wait-host-start">
              {t('online.waitHost', undefined, lang)}
            </p>
          </>
        )}
      </section>
      <Toast o={o} lang={lang} />
    </div>
  );
}

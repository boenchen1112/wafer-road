import { useEffect, useRef, useState } from 'preact/hooks';
import { countKind, type CardKind, type GameState, type Target } from '../engine';
import * as sfx from '../audio/sfx';
import { artUrl, cardName, cardText, CARD_META } from '../i18n/cards';
import { t, useLang, type Lang } from '../i18n';
import { formatEvent } from './format';
import { waferPoints, type TableModel } from './model';
import { Card, ProtectionChip, Wafer } from './parts';
import { TopControls } from './Controls';

const NO_TARGET_KINDS: CardKind[] = ['generator', 'emergencyExit', 'blackout', 'yearEndBonus'];

function tkey(t: Target | undefined): string {
  return t ? `${t.player}:${t.wafer ?? ''}` : '';
}

export function GameView({ m }: { m: TableModel }) {
  const lang = useLang();
  const st = m;
  const me = m.viewer;
  const [sel, setSel] = useState<number | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  const myTurnHuman = m.canAct;
  const actions = m.actions;

  // clear selection when the state moves on
  useEffect(() => setSel(null), [m.rev, myTurnHuman]);

  const selCard = sel !== null ? m.hand.find((c) => c.id === sel) : undefined;
  const selPlays = selCard ? actions.filter((a) => a.type === 'play' && a.cardId === selCard.id) : [];
  const selDiscard = selCard ? actions.find((a) => a.type === 'discard' && a.cardId === selCard.id) : undefined;
  const selNeedsTarget = !!selCard && !NO_TARGET_KINDS.includes(selCard.kind);
  const targetKeys = new Set(selNeedsTarget ? selPlays.map((a) => (a.type === 'play' ? tkey(a.target) : '')) : []);

  const pickTarget = (target: Target) => {
    if (!selCard) return;
    const a = selPlays.find((x) => x.type === 'play' && tkey(x.target) === tkey(target));
    if (a) m.onAction(a);
  };

  const order: number[] = [];
  for (let k = 1; k < st.players.length; k++) order.push((me + k) % st.players.length);

  const hand = m.hand;
  const knownIds = useRef<Set<number>>(new Set());
  const entering = new Set(hand.filter((c) => !knownIds.current.has(c.id)).map((c) => c.id));
  useEffect(() => {
    knownIds.current = new Set(hand.map((c) => c.id));
  });

  const prompt = (() => {
    if (st.result) return '';
    if (!myTurnHuman) {
      const cur = m.players[st.current];
      if (m.thinking !== null) return `${cur.name} ${t('game.thinking', undefined, lang)}`;
      return t('game.turnOf', { name: cur.name }, lang);
    }
    if (st.phase === 'bonusDiscard') return t('game.bonusDiscard', undefined, lang);
    if (st.phase === 'bonus') return t('game.bonusPhase', undefined, lang);
    return t('game.yourTurn', undefined, lang) + ' — ' + t('game.chooseCard', undefined, lang);
  })();

  return (
    <div class={`game ${logOpen ? 'log-open' : ''}`}>
      <header class="topbar">
        <div class="brand-sm">{t('app.title', undefined, lang)}</div>
        <div class="counts">
          <span class="chip" title={t('game.deck', undefined, lang)}>
            <i class="ico deck" /> <span class="long">{t('game.deck', undefined, lang)}</span> <b data-testid="deck-count">{m.deckCount}</b>
          </span>
          <span class="chip" title={t('game.discard', undefined, lang)}>
            <i class="ico disc" /> <span class="long">{t('game.discard', undefined, lang)}</span> <b data-testid="discard-count">{m.discardCount}</b>
          </span>
        </div>
        {m.clock && <ClockChip clock={m.clock} m={m} lang={lang} />}
        <div class="spacer" />
        <button class="btn ghost sm" onClick={() => setLogOpen((v) => !v)} aria-expanded={logOpen}>
          {logOpen ? t('game.hideLog', undefined, lang) : t('game.showLog', undefined, lang)}
        </button>
        <TopControls />
        <button
          class="btn ghost sm"
          onClick={() => {
            if (st.result || window.confirm(t(m.mode === 'online' ? 'online.leaveConfirm' : 'game.quitConfirm', undefined, lang))) m.onQuit();
          }}
        >
          <span class="long">{t(m.mode === 'online' ? 'online.leave' : 'game.quit', undefined, lang)}</span>
          <span class="short" aria-hidden="true">✕</span>
        </button>
      </header>

      {st.finalTurnsLeft !== null && !st.result && (
        <div class="final-banner" role="status">
          {t('game.finalRound', undefined, lang)} · {t('game.finalLeft', { n: st.finalTurnsLeft + 1 }, lang)}
        </div>
      )}

      {m.link && m.link !== 'open' && (
        <div class="conn-banner" role="status" data-testid="conn-banner">
          {t(m.link === 'connecting' ? 'online.connecting' : 'online.reconnecting', undefined, lang)}
        </div>
      )}

      <div class="table-wrap">
        <main class="table" data-testid="table">
          <section class="opps" data-count={order.length}>
            {order.map((i) => (
              <PlayerPanel
                key={i}
                m={m}
                i={i}
                lang={lang}
                targetKeys={targetKeys}
                onPick={pickTarget}
              />
            ))}
          </section>

          <section class="mine">
            <PlayerPanel m={m} i={me} lang={lang} targetKeys={targetKeys} onPick={pickTarget} mine />
          </section>

          <div class="dock">
          <section class={`actionbar ${myTurnHuman ? 'active' : ''}`} aria-live="polite" data-testid="actionbar">
            {selCard ? (
              <SelectedInfo
                kind={selCard.kind}
                lang={lang}
                needsTarget={selNeedsTarget}
                canPlay={selPlays.length > 0}
                canDiscard={!!selDiscard}
                phase={st.phase}
                noTargets={selNeedsTarget && selPlays.length === 0}
                onPlay={() => {
                  const a = selPlays[0];
                  if (a) m.onAction(a);
                }}
                onDiscard={() => selDiscard && m.onAction(selDiscard)}
                onCancel={() => setSel(null)}
              />
            ) : (
              <div class="prompt">
                <span class={`dot ${m.thinking !== null ? 'think' : ''}`} />
                {prompt}
              </div>
            )}
          </section>

          <section class="hand-area" aria-label={t('game.hand', undefined, lang)}>
            {!m.handVisible ? (
              <div class="hand hidden-hand" style={{ '--n': hand.length }}>
                {hand.map((c) => (
                  <Card key={c.id} back lang={lang} class="hand-card" />
                ))}
                <div class="hand-hidden-msg">{t('game.hidden', undefined, lang)}</div>
              </div>
            ) : (
              <div class="hand" data-testid="hand" style={{ '--n': hand.length }}>
                {hand.map((c) => {
                  const canPlay = actions.some((a) => a.type === 'play' && a.cardId === c.id);
                  const playable = myTurnHuman && (canPlay || st.phase === 'bonusDiscard');
                  return (
                    <Card
                      key={c.id}
                      kind={c.kind}
                      lang={lang}
                      class="hand-card"
                      selected={sel === c.id}
                      dim={myTurnHuman && !playable}
                      enter={entering.has(c.id)}
                      onClick={
                        myTurnHuman
                          ? () => {
                              sfx.play('click');
                              setSel(sel === c.id ? null : c.id);
                            }
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            )}
          </section>
          </div>
        </main>

        <aside class="logpanel" aria-label={t('game.log', undefined, lang)}>
          <h3>{t('game.log', undefined, lang)}</h3>
          <LogList m={m} lang={lang} />
        </aside>
      </div>

      {m.banner && <PlayBanner m={m} lang={lang} />}
      {m.handoff !== null && <Handoff m={m} lang={lang} />}
      {st.result && <EndScreen m={m} lang={lang} />}
    </div>
  );
}

/* ---------------------------------------------------------------- */

function SelectedInfo(props: {
  kind: CardKind;
  lang: Lang;
  needsTarget: boolean;
  canPlay: boolean;
  canDiscard: boolean;
  noTargets: boolean;
  phase: GameState['phase'];
  onPlay: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  const { kind, lang } = props;
  return (
    <div class="sel-info">
      <div class="sel-text">
        <b class={`grp ${CARD_META[kind].group}`}>{cardName(kind, lang)}</b>
        <p>{cardText(kind, lang)}</p>
        {props.needsTarget && props.canPlay && <p class="hint">{t('game.chooseTarget', undefined, lang)} — {t('game.legalHint', undefined, lang)}</p>}
        {props.noTargets && props.phase !== 'bonusDiscard' && <p class="hint warn">{t('game.noTargets', undefined, lang)}</p>}
      </div>
      <div class="sel-buttons">
        {!props.needsTarget && props.canPlay && (
          <button class="btn primary" data-testid="btn-play" onClick={props.onPlay}>
            {t('game.play', undefined, lang)}
          </button>
        )}
        {props.canDiscard && (
          <button class="btn" data-testid="btn-discard" onClick={props.onDiscard}>
            {t('game.discardAction', undefined, lang)}
          </button>
        )}
        <button class="btn ghost" onClick={props.onCancel}>
          {t('game.cancel', undefined, lang)}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */

function PlayerPanel(props: {
  m: TableModel;
  i: number;
  lang: Lang;
  mine?: boolean;
  targetKeys: Set<string>;
  onPick: (t: Target) => void;
}) {
  const { m, i, lang, mine, targetKeys, onPick } = props;
  const st = m;
  const p = m.players[i];
  const active = st.current === i && !st.result;
  const playerTargetable = targetKeys.has(`${i}:`);
  const name = p.name;
  const isBot = p.bot;
  const gens = countKind(p.protections, 'generator');
  const exits = countKind(p.protections, 'emergencyExit');
  return (
    <div
      class={`panel ${mine ? 'me' : 'opp'} ${active ? 'active' : ''} ${playerTargetable ? 'targetable' : ''}`}
      data-player={i}
      data-testid={mine ? 'panel-me' : `panel-${i}`}
      onClick={playerTargetable ? () => onPick({ player: i }) : undefined}
      role={playerTargetable ? 'button' : undefined}
      tabIndex={playerTargetable ? 0 : undefined}
      aria-label={name}
      onKeyDown={playerTargetable ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick({ player: i })) : undefined}
    >
      <div class="panel-head">
        <span class="pname">
          {name}
          {mine && !p.bot && <small> ({t('game.you', undefined, lang)})</small>}
        </span>
        {p.connected !== null && (
          <i
            class={`conn-dot ${p.connected ? 'on' : 'off'}`}
            data-testid={`conn-${i}`}
            data-connected={p.connected ? '1' : '0'}
            title={t(p.connected ? 'online.connected' : 'online.disconnected', undefined, lang)}
            role="img"
            aria-label={t(p.connected ? 'online.connected' : 'online.disconnected', undefined, lang)}
          />
        )}
        {isBot && <span class="badge">{t('game.bot', undefined, lang)}</span>}
        {p.covered && <span class="badge warn">{t('online.botCovering', undefined, lang)}</span>}
        {active && (
          <span class="turn-pill">
            {m.thinking === i ? (
              <>
                {t('game.thinking', undefined, lang)}
                <span class="dots">
                  <i />
                  <i />
                  <i />
                </span>
              </>
            ) : (
              t(m.mode === 'online' && !mine ? 'online.theirTurn' : 'game.yourTurn', undefined, lang)
            )}
          </span>
        )}
        <span class="spacer" />
        {!mine && (
          <span class="handcount" title={t('game.handCount', { n: p.handCount }, lang)}>
            <span class="minibacks">
              {Array.from({ length: Math.min(p.handCount, 5) }, (_, k) => (
                <img key={k} src={backUrl()} alt="" style={{ left: `${k * 7}px` }} />
              ))}
            </span>
            <b data-testid={`handcount-${i}`}>{p.handCount}</b>
          </span>
        )}
      </div>
      <div class="panel-body">
        <div class="wafers">
          {([0, 1] as const).map((w) => (
            <Wafer
              key={w}
              index={w}
              step={p.wafers[w]}
              lang={lang}
              small={!mine}
              targetable={targetKeys.has(`${i}:${w}`)}
              onPick={() => onPick({ player: i, wafer: w })}
            />
          ))}
        </div>
        <div class="prots" aria-label={t('game.protections', undefined, lang)}>
          {gens > 0 && <ProtectionChip kind="generator" count={gens} lang={lang} big={mine} />}
          {exits > 0 && <ProtectionChip kind="emergencyExit" count={exits} lang={lang} big={mine} />}
        </div>
      </div>
    </div>
  );
}

function backUrl(): string {
  return artUrl('back');
}

/* ---------------------------------------------------------------- */

function LogList({ m, lang }: { m: TableModel; lang: Lang }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [m.log.length]);
  return (
    <div class="loglist" ref={ref} data-testid="log">
      {m.log.map((l) => {
        const f = formatEvent(l.ev, (i) => m.players[i]?.name ?? '?', lang);
        return f ? (
          <div key={l.id} class={`logline ${f.tone}`}>
            {f.text}
          </div>
        ) : null;
      })}
    </div>
  );
}

function PlayBanner({ m, lang }: { m: TableModel; lang: Lang }) {
  const b = m.banner!;
  const nm = (i: number) => m.players[i]?.name ?? '?';
  const mineActor = b.actor === m.viewer;
  const target =
    b.target && b.target.player !== b.actor
      ? ` → ${nm(b.target.player)}${b.target.wafer !== undefined ? ' · ' + t('log.waferN', { n: b.target.wafer + 1 }, lang) : ''}`
      : '';
  return (
    <div class={`banner ${mineActor ? 'from-bottom' : 'from-top'}`} key={b.id} aria-hidden="true">
      <Card kind={b.card} lang={lang} class="banner-card" />
      <div class="banner-text">
        {nm(b.actor)}
        {target}
      </div>
    </div>
  );
}

function Handoff({ m, lang }: { m: TableModel; lang: Lang }) {
  const name = m.players[m.handoff!].name;
  return (
    <div class="overlay handoff" role="dialog" aria-modal="true">
      <button class="handoff-card" data-testid="handoff" onClick={m.onReveal}>
        <h2>{t('handoff.title', { name }, 'zh-TW')}</h2>
        <h3>{t('handoff.title', { name }, 'en')}</h3>
        <p class="tap">{t('handoff.tap', undefined, lang)}</p>
        <small>{t('handoff.hint', undefined, lang)}</small>
      </button>
    </div>
  );
}

function EndScreen({ m, lang }: { m: TableModel; lang: Lang }) {
  const r = m.result!;
  const names = r.winners.map((w) => m.players[w].name);
  useEffect(() => {
    sfx.play('win');
  }, []);
  return (
    <div class="overlay end" role="dialog" aria-modal="true" data-testid="end-screen">
      <div class="end-card">
        <p class="eyebrow">{t('end.title', undefined, lang)}</p>
        <h2>
          {r.winners.length > 1 ? t('end.winners', undefined, lang) : t('end.winner', undefined, lang)}
          <span class="winner-names">{names.join(' & ')}</span>
        </h2>
        <p class="reason">{r.reason === 'complete' ? t('end.completeReason', undefined, lang) : t('end.scoreReason', undefined, lang)}</p>
        <table class="scores">
          <thead>
            <tr>
              <th />
              <th>{t('end.waferPts', undefined, lang)}</th>
              {r.reason === 'score' && <th>{t('end.bonusPts', undefined, lang)}</th>}
              {r.reason === 'score' && <th>{t('end.score', undefined, lang)}</th>}
            </tr>
          </thead>
          <tbody>
            {m.players.map((p, i) => {
              const win = r.winners.includes(i);
              // hands stay hidden online; the bonus is whatever the final score adds on top of the wafers
              const bonus = Math.max(0, r.scores[i] - waferPoints(p.wafers));
              return (
                <tr key={i} class={win ? 'win' : ''}>
                  <td>
                    {win && '🏆 '}
                    {p.name}
                  </td>
                  <td>
                    {p.wafers.map((w) => `${w}/4`).join(' · ')}
                    {p.wafers.some((w) => w >= 4) && <small> {t('end.completeNote', undefined, lang)}</small>}
                  </td>
                  {r.reason === 'score' && <td>+{bonus}</td>}
                  {r.reason === 'score' && (
                    <td>
                      <b>{t('end.points', { n: r.scores[i] }, lang)}</b>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div class="end-buttons">
          {m.onPlayAgain ? (
            <button class="btn primary" data-testid="play-again" onClick={m.onPlayAgain}>
              {t(m.mode === 'online' ? 'online.playAgain' : 'end.playAgain', undefined, lang)}
            </button>
          ) : (
            <p class="note" data-testid="wait-host">
              {t('online.waitHostAgain', undefined, lang)}
            </p>
          )}
          <button class="btn" data-testid="end-leave" onClick={m.onQuit}>
            {t(m.mode === 'online' ? 'online.leave' : 'end.lobby', undefined, lang)}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */

function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** Countdown for the turn timer / the disconnected-player grace period. */
function ClockChip({ clock, m, lang }: { clock: NonNullable<TableModel['clock']>; m: TableModel; lang: Lang }) {
  const now = useNow(true);
  if (clock.kind === 'bot') return null;
  const left = Math.max(0, Math.ceil((clock.at - now) / 1000));
  const name = m.players[clock.seat]?.name ?? '';
  const mine = clock.seat === m.viewer;
  const label =
    clock.kind === 'timeout'
      ? mine
        ? t('online.timerYou', { n: left }, lang)
        : t('online.timerOther', { name, n: left }, lang)
      : t('online.takeoverIn', { name, n: left }, lang);
  return (
    <span class={`chip clock ${clock.kind} ${left <= 10 ? 'urgent' : ''}`} data-testid="clock" data-left={left} role="timer" aria-label={`${left} ${label}`}>
      <span aria-hidden="true">⏱</span> <b>{left}</b>
      <span class="long clock-label"> {label}</span>
    </span>
  );
}

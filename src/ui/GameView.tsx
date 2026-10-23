import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { countKind, legalActions, scoreOf, type Action, type CardKind, type GameState, type Target } from '../engine';
import * as sfx from '../audio/sfx';
import { artUrl, cardName, cardText, CARD_META } from '../i18n/cards';
import { t, useLang, type Lang } from '../i18n';
import { formatEvent, seatName } from './format';
import { Card, ProtectionChip, Wafer } from './parts';
import { dispatch, quitGame, replay, revealHand, type Session } from './store';
import { TopControls } from './Controls';

const NO_TARGET_KINDS: CardKind[] = ['generator', 'emergencyExit', 'blackout', 'yearEndBonus'];

function tkey(t: Target | undefined): string {
  return t ? `${t.player}:${t.wafer ?? ''}` : '';
}

export function GameView({ s }: { s: Session }) {
  const lang = useLang();
  const st = s.state;
  const me = s.viewer;
  const [sel, setSel] = useState<number | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  const myTurnHuman =
    !st.result && st.current === me && s.seats[me].kind === 'human' && s.handoff === null && s.handVisible;
  const actions = useMemo<Action[]>(() => (myTurnHuman ? legalActions(st, me) : []), [st, me, myTurnHuman]);

  // clear selection when the state moves on
  useEffect(() => setSel(null), [s.rev, myTurnHuman]);

  const selCard = sel !== null ? st.players[me].hand.find((c) => c.id === sel) : undefined;
  const selPlays = selCard ? actions.filter((a) => a.type === 'play' && a.cardId === selCard.id) : [];
  const selDiscard = selCard ? actions.find((a) => a.type === 'discard' && a.cardId === selCard.id) : undefined;
  const selNeedsTarget = !!selCard && !NO_TARGET_KINDS.includes(selCard.kind);
  const targetKeys = new Set(selNeedsTarget ? selPlays.map((a) => (a.type === 'play' ? tkey(a.target) : '')) : []);

  const pickTarget = (target: Target) => {
    if (!selCard) return;
    const a = selPlays.find((x) => x.type === 'play' && tkey(x.target) === tkey(target));
    if (a) dispatch(a);
  };

  const order: number[] = [];
  for (let k = 1; k < st.players.length; k++) order.push((me + k) % st.players.length);

  const hand = st.players[me].hand;
  const knownIds = useRef<Set<number>>(new Set());
  const entering = new Set(hand.filter((c) => !knownIds.current.has(c.id)).map((c) => c.id));
  useEffect(() => {
    knownIds.current = new Set(hand.map((c) => c.id));
  });

  const prompt = (() => {
    if (st.result) return '';
    if (!myTurnHuman) {
      if (s.seats[st.current].kind === 'bot') return `${seatName(s.seats, st.current, lang)} ${t('game.thinking', undefined, lang)}`;
      return t('game.turnOf', { name: seatName(s.seats, st.current, lang) }, lang);
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
            <i class="ico deck" /> <span class="long">{t('game.deck', undefined, lang)}</span> <b data-testid="deck-count">{st.deck.length}</b>
          </span>
          <span class="chip" title={t('game.discard', undefined, lang)}>
            <i class="ico disc" /> <span class="long">{t('game.discard', undefined, lang)}</span> <b data-testid="discard-count">{st.discard.length}</b>
          </span>
        </div>
        <div class="spacer" />
        <button class="btn ghost sm" onClick={() => setLogOpen((v) => !v)} aria-expanded={logOpen}>
          {logOpen ? t('game.hideLog', undefined, lang) : t('game.showLog', undefined, lang)}
        </button>
        <TopControls />
        <button
          class="btn ghost sm"
          onClick={() => {
            if (st.result || window.confirm(t('game.quitConfirm', undefined, lang))) quitGame();
          }}
        >
          <span class="long">{t('game.quit', undefined, lang)}</span>
          <span class="short" aria-hidden="true">✕</span>
        </button>
      </header>

      {st.finalTurnsLeft !== null && !st.result && (
        <div class="final-banner" role="status">
          {t('game.finalRound', undefined, lang)} · {t('game.finalLeft', { n: st.finalTurnsLeft + 1 }, lang)}
        </div>
      )}

      <div class="table-wrap">
        <main class="table" data-testid="table">
          <section class="opps" data-count={order.length}>
            {order.map((i) => (
              <PlayerPanel
                key={i}
                s={s}
                i={i}
                lang={lang}
                targetKeys={targetKeys}
                onPick={pickTarget}
              />
            ))}
          </section>

          <section class="mine">
            <PlayerPanel s={s} i={me} lang={lang} targetKeys={targetKeys} onPick={pickTarget} mine />
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
                  if (a) dispatch(a);
                }}
                onDiscard={() => selDiscard && dispatch(selDiscard)}
                onCancel={() => setSel(null)}
              />
            ) : (
              <div class="prompt">
                <span class={`dot ${s.thinking !== null ? 'think' : ''}`} />
                {prompt}
              </div>
            )}
          </section>

          <section class="hand-area" aria-label={t('game.hand', undefined, lang)}>
            {!s.handVisible ? (
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
          <LogList s={s} lang={lang} />
        </aside>
      </div>

      {s.banner && <PlayBanner s={s} lang={lang} />}
      {s.handoff !== null && <Handoff s={s} lang={lang} />}
      {st.result && <EndScreen s={s} lang={lang} />}
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
  s: Session;
  i: number;
  lang: Lang;
  mine?: boolean;
  targetKeys: Set<string>;
  onPick: (t: Target) => void;
}) {
  const { s, i, lang, mine, targetKeys, onPick } = props;
  const st = s.state;
  const p = st.players[i];
  const active = st.current === i && !st.result;
  const playerTargetable = targetKeys.has(`${i}:`);
  const name = seatName(s.seats, i, lang);
  const isBot = s.seats[i].kind === 'bot';
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
          {mine && s.seats[i].kind === 'human' && <small> ({t('game.you', undefined, lang)})</small>}
        </span>
        {isBot && <span class="badge">{t('game.bot', undefined, lang)}</span>}
        {active && (
          <span class="turn-pill">
            {s.thinking === i ? (
              <>
                {t('game.thinking', undefined, lang)}
                <span class="dots">
                  <i />
                  <i />
                  <i />
                </span>
              </>
            ) : (
              t('game.yourTurn', undefined, lang)
            )}
          </span>
        )}
        <span class="spacer" />
        {!mine && (
          <span class="handcount" title={t('game.handCount', { n: p.hand.length }, lang)}>
            <span class="minibacks">
              {p.hand.slice(0, 5).map((c, k) => (
                <img key={c.id} src={backUrl()} alt="" style={{ left: `${k * 7}px` }} />
              ))}
            </span>
            <b data-testid={`handcount-${i}`}>{p.hand.length}</b>
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

function LogList({ s, lang }: { s: Session; lang: Lang }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [s.log.length]);
  return (
    <div class="loglist" ref={ref} data-testid="log">
      {s.log.map((l) => {
        const f = formatEvent(l.ev, s.seats, lang);
        return f ? (
          <div key={l.id} class={`logline ${f.tone}`}>
            {f.text}
          </div>
        ) : null;
      })}
    </div>
  );
}

function PlayBanner({ s, lang }: { s: Session; lang: Lang }) {
  const b = s.banner!;
  const mineActor = b.actor === s.viewer;
  const target =
    b.target && b.target.player !== b.actor
      ? ` → ${seatName(s.seats, b.target.player, lang)}${b.target.wafer !== undefined ? ' · ' + t('log.waferN', { n: b.target.wafer + 1 }, lang) : ''}`
      : '';
  return (
    <div class={`banner ${mineActor ? 'from-bottom' : 'from-top'}`} key={b.id} aria-hidden="true">
      <Card kind={b.card} lang={lang} class="banner-card" />
      <div class="banner-text">
        {seatName(s.seats, b.actor, lang)}
        {target}
      </div>
    </div>
  );
}

function Handoff({ s, lang }: { s: Session; lang: Lang }) {
  const name = seatName(s.seats, s.handoff!, lang);
  return (
    <div class="overlay handoff" role="dialog" aria-modal="true">
      <button class="handoff-card" data-testid="handoff" onClick={revealHand}>
        <h2>{t('handoff.title', { name }, 'zh-TW')}</h2>
        <h3>{t('handoff.title', { name }, 'en')}</h3>
        <p class="tap">{t('handoff.tap', undefined, lang)}</p>
        <small>{t('handoff.hint', undefined, lang)}</small>
      </button>
    </div>
  );
}

function EndScreen({ s, lang }: { s: Session; lang: Lang }) {
  const st = s.state;
  const r = st.result!;
  const names = r.winners.map((w) => seatName(s.seats, w, lang));
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
            {st.players.map((p, i) => {
              const win = r.winners.includes(i);
              const bonus = countKind(p.hand, 'yearEndBonus');
              return (
                <tr key={i} class={win ? 'win' : ''}>
                  <td>
                    {win && '🏆 '}
                    {seatName(s.seats, i, lang)}
                  </td>
                  <td>
                    {p.wafers.map((w) => `${w}/4`).join(' · ')}
                    {p.wafers.some((w) => w >= 4) && <small> {t('end.completeNote', undefined, lang)}</small>}
                  </td>
                  {r.reason === 'score' && <td>+{bonus}</td>}
                  {r.reason === 'score' && (
                    <td>
                      <b>{t('end.points', { n: scoreOf(st, i) }, lang)}</b>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div class="end-buttons">
          <button class="btn primary" data-testid="play-again" onClick={replay}>
            {t('end.playAgain', undefined, lang)}
          </button>
          <button class="btn" onClick={quitGame}>
            {t('end.lobby', undefined, lang)}
          </button>
        </div>
      </div>
    </div>
  );
}

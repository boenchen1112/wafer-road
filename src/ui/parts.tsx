import { useEffect, useRef, useState } from 'preact/hooks';
import type { CardKind } from '../engine';
import { artUrl, cardName, cardText } from '../i18n/cards';
import { t, type Lang } from '../i18n';

/* ---------------------------------------------------------------- */
/* Card                                                              */
/* ---------------------------------------------------------------- */

interface CardProps {
  kind?: CardKind;
  back?: boolean;
  lang: Lang;
  selected?: boolean;
  dim?: boolean;
  onClick?: () => void;
  class?: string;
  /** cards drawn into the hand animate in */
  enter?: boolean;
  style?: Record<string, string | number>;
}

export function Card({ kind, back, lang, selected, dim, onClick, class: cls, enter, style }: CardProps) {
  const src = back || !kind ? artUrl('back') : artUrl(kind);
  const alt = back || !kind ? t('app.title', undefined, lang) : cardName(kind, lang);
  const title = kind && !back ? `${cardName(kind, lang)}\n${cardText(kind, lang)}` : undefined;
  const fix = kind === 'blackout' ? 'ov.blackout' : kind === 'toxicGas' ? 'ov.toxicGas' : null;
  return (
    <div
      class={`card ${selected ? 'sel' : ''} ${dim ? 'dim' : ''} ${enter ? 'enter' : ''} ${onClick ? 'clickable' : ''} ${cls ?? ''}`}
      title={title}
      style={style}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      aria-label={alt}
      aria-pressed={onClick ? !!selected : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) : undefined}
      data-kind={kind}
    >
      <img src={src} alt={alt} draggable={false} loading="lazy" />
      {fix && !back && (
        <div class={`card-fix ${lang === 'en' ? 'en' : ''}`}>
          <span>{t(fix, undefined, lang)}</span>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Wafer                                                             */
/* ---------------------------------------------------------------- */

const LAYER = [
  { top: '#eef1f8', side: '#aab2c6', name: 'thin' },
  { top: '#f3d94d', side: '#bf9f26', name: 'litho' },
  { top: '#f6e27a', side: '#c9a92f', name: 'doping' },
  { top: '#e3a431', side: '#9c6a17', name: 'metal' },
];

const CX = 60;
const RX = 50;
const RY = 15;
const H = 7;
const BASE_H = 9;
const BOTTOM = 82;

function Disc({ i, cls }: { i: number; cls?: string }) {
  // geometry: base disc occupies [BOTTOM-BASE_H, BOTTOM]; layer i occupies above it.
  const base = i === 0;
  const h = base ? BASE_H : H;
  const bottomY = base ? BOTTOM : BOTTOM - BASE_H - (i - 1) * H;
  const topY = bottomY - h;
  const col = base ? { top: '#4ea4e6', side: '#2d6fb0' } : LAYER[i - 1];
  const sidePath = `M ${CX - RX} ${topY} v ${h} a ${RX} ${RY} 0 0 0 ${RX * 2} 0 v ${-h} a ${RX} ${RY} 0 0 1 ${-RX * 2} 0 z`;
  return (
    <g class={`disc ${cls ?? ''}`}>
      <path d={sidePath} fill={col.side} />
      <ellipse cx={CX} cy={topY} rx={RX} ry={RY} fill={col.top} />
      {!base && i === 3 && (
        <>
          <path d={`M ${CX} ${topY} L ${CX + RX * 0.95} ${topY - RY * 0.3} A ${RX} ${RY} 0 0 1 ${CX + RX * 0.35} ${topY + RY * 0.95} Z`} fill="#4ea4e6" />
          <circle cx={CX - 18} cy={topY - 2} r="2" fill="#4ea4e6" />
          <circle cx={CX - 6} cy={topY + 5} r="2" fill="#4ea4e6" />
          <circle cx={CX - 28} cy={topY + 3} r="2" fill="#4ea4e6" />
        </>
      )}
      {!base && i === 2 && (
        <g stroke="#a58a1c" stroke-width="1.2" opacity=".55">
          <line x1={CX - 24} y1={topY - 4} x2={CX + 24} y2={topY - 4} />
          <line x1={CX - 26} y1={topY + 2} x2={CX + 26} y2={topY + 2} />
        </g>
      )}
      {!base && i === 4 && (
        <g stroke="#8a5a0f" stroke-width="2" opacity=".5" fill="none">
          <path d={`M ${CX - 28} ${topY + 2} h 20 v -6 h 16 v 6 h 20`} />
        </g>
      )}
    </g>
  );
}

export function stepName(step: number, lang: Lang): string {
  const kinds: (CardKind | null)[] = [null, 'thinFilm', 'photolithography', 'doping', 'metallization'];
  const k = kinds[step];
  return k ? cardName(k, lang) : lang === 'en' ? 'Blank wafer' : '空白晶圓';
}

interface WaferProps {
  step: number;
  index: 0 | 1;
  lang: Lang;
  small?: boolean;
  targetable?: boolean;
  onPick?: () => void;
}

/** Shows layers; animates layer add (drop in), remove (fly out) and shake on regression. */
export function Wafer({ step, index, lang, small, targetable, onPick }: WaferProps) {
  const prev = useRef(step);
  const [anim, setAnim] = useState<{ kind: 'add' | 'remove'; from: number; to: number; key: number } | null>(null);
  useEffect(() => {
    if (prev.current !== step) {
      const a = { kind: step > prev.current ? ('add' as const) : ('remove' as const), from: prev.current, to: step, key: Date.now() };
      prev.current = step;
      setAnim(a);
      const id = setTimeout(() => setAnim(null), 750);
      return () => clearTimeout(id);
    }
  }, [step]);
  const layers = [];
  layers.push(<Disc key="base" i={0} />);
  for (let i = 1; i <= 4; i++) {
    if (i <= step) {
      const isNew = anim?.kind === 'add' && i > anim.from && i <= anim.to;
      layers.push(<Disc key={`l${i}`} i={i} cls={isNew ? 'layer-in' : ''} />);
    }
  }
  if (anim?.kind === 'remove') {
    for (let i = anim.to + 1; i <= anim.from; i++) layers.push(<Disc key={`g${i}-${anim.key}`} i={i} cls="layer-out" />);
  }
  const done = step >= 4;
  return (
    <div
      class={`wafer ${small ? 'sm' : ''} ${anim?.kind === 'remove' ? 'shake' : ''} ${done ? 'done' : ''} ${targetable ? 'targetable' : ''} ${onPick ? 'clickable' : ''}`}
      onClick={targetable ? onPick : undefined}
      role={targetable ? 'button' : undefined}
      tabIndex={targetable ? 0 : undefined}
      onKeyDown={targetable && onPick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick()) : undefined}
      aria-label={`${t('game.wafer', { n: index + 1 }, lang)} ${step}/4`}
      data-step={step}
      data-wafer={index}
    >
      <svg viewBox="0 0 120 96" aria-hidden="true">
        <ellipse cx={CX} cy={BOTTOM + 3} rx={RX + 4} ry={RY - 2} fill="#000" opacity=".28" />
        {layers}
      </svg>
      <div class="wafer-cap">
        <b>{done ? t('game.complete', undefined, lang) : t('game.step', { n: step }, lang)}</b>
        <span>{stepName(step, lang)}</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Protection chips                                                  */
/* ---------------------------------------------------------------- */

export function ProtectionChip({ kind, count, lang, big }: { kind: 'generator' | 'emergencyExit'; count: number; lang: Lang; big?: boolean }) {
  return (
    <span class={`prot ${kind === 'generator' ? 'gen' : 'exit'} ${big ? 'big' : ''}`} title={cardName(kind, lang)} data-prot={kind}>
      {kind === 'generator' ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="6" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.8" />
          <path d="M13 8 8.5 13.5h3.5L11 17l4.5-5.5H12z" fill="currentColor" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="3" width="11" height="18" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8" />
          <path d="M11 12h10m0 0-3-3m3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      )}
      <b>×{count}</b>
      {big && <em>{cardName(kind, lang)}</em>}
    </span>
  );
}

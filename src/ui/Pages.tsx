import { DECK_COUNTS, KIND_ORDER } from '../engine';
import { Card } from './parts';
import { CARD_META, cardName, cardText } from '../i18n/cards';
import { PROCESS, RULES } from '../i18n/content';
import { t, useLang } from '../i18n';
import { TopControls } from './Controls';

function PageTop({ back }: { back: () => void }) {
  const lang = useLang();
  return (
    <div class="page-top">
      <button class="btn ghost sm" onClick={back}>
        ← {t('nav.home', undefined, lang)}
      </button>
      <div class="top-controls">
        <TopControls />
      </div>
    </div>
  );
}

export function HowTo({ back }: { back: () => void }) {
  const lang = useLang();
  const rules = RULES[lang];
  return (
    <div class="page doc" data-testid="howto">
      <PageTop back={back} />
      <h1 class="doc-title">{t('howto.title', undefined, lang)}</h1>
      <div class="doc-body">
        {rules.map((sec) => (
          <section key={sec.h}>
            <h2>{sec.h}</h2>
            {sec.p.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </section>
        ))}
        <h2>{t('howto.cards', undefined, lang)}</h2>
        <div class="card-ref">
          {KIND_ORDER.map((k) => (
            <article key={k} class="ref-item">
              <Card kind={k} lang={lang} class="ref-card" />
              <div>
                <h3>
                  {cardName(k, lang)} <small>{t('card.count', { n: DECK_COUNTS[k] }, lang)}</small>
                </h3>
                <p class={`grp-tag ${CARD_META[k].group}`}>{t(`card.type.${CARD_META[k].group}`, undefined, lang)}</p>
                <p>{cardText(k, lang)}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
      <button class="btn" onClick={back}>
        {t('nav.back', undefined, lang)}
      </button>
    </div>
  );
}

export function ProcessPage({ back }: { back: () => void }) {
  const lang = useLang();
  const c = PROCESS[lang];
  const cardFor = ['thinFilm', 'photolithography', 'doping', 'metallization'] as const;
  return (
    <div class="page doc" data-testid="process">
      <PageTop back={back} />
      <h1 class="doc-title">{c.title}</h1>
      <div class="doc-body">
        {c.intro.map((sec) => (
          <section key={sec.h}>
            <h2>{sec.h}</h2>
            {sec.p.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </section>
        ))}
        {c.steps.map((st, i) => (
          <section key={st.h} class="proc-step">
            <div class="proc-card">
              <Card kind={cardFor[i]} lang={lang} class="ref-card" />
            </div>
            <div>
              <h2>{st.h}</h2>
              <dl>
                {st.items.map((it) => (
                  <div key={it.k}>
                    <dt>{it.k}</dt>
                    <dd>{it.v}</dd>
                  </div>
                ))}
              </dl>
              <p class="game-note">{st.game}</p>
            </div>
          </section>
        ))}
        <section>
          <h2>{c.summaryH}</h2>
          <ul class="summary">
            {c.summary.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p>{c.outro}</p>
        </section>
      </div>
      <button class="btn" onClick={back}>
        {t('nav.back', undefined, lang)}
      </button>
    </div>
  );
}

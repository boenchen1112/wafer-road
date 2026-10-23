import { useEffect, useState } from 'preact/hooks';
import { isMuted, onMuteChange, setMuted } from '../audio/sfx';
import { getLang, setLang, t, useLang } from '../i18n';

export function TopControls() {
  const lang = useLang();
  const [muted, setM] = useState(isMuted());
  useEffect(() => onMuteChange(() => setM(isMuted())), []);
  return (
    <>
      <button
        class="btn ghost sm"
        aria-pressed={muted}
        data-testid="mute"
        onClick={() => setMuted(!muted)}
        title={muted ? t('sound.off', undefined, lang) : t('sound.on', undefined, lang)}
      >
        {muted ? '🔇' : '🔊'}
      </button>
      <button class="btn ghost sm" data-testid="lang" onClick={() => setLang(getLang() === 'en' ? 'zh-TW' : 'en')}>
        {t('lang.toggle', undefined, lang)}
      </button>
    </>
  );
}

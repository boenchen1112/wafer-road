import { useEffect, useState } from 'preact/hooks';
import { GameView } from './GameView';
import { Lobby } from './Lobby';
import { HowTo, ProcessPage } from './Pages';
import { useSession } from './store';
import { setLang, getLang, useLang } from '../i18n';

type Page = 'lobby' | 'howto' | 'process';

function fromHash(): Page {
  const h = location.hash.replace(/^#\/?/, '');
  return h === 'howto' || h === 'process' ? h : 'lobby';
}

export function App() {
  const [page, setPage] = useState<Page>(fromHash());
  const session = useSession();
  useLang();
  useEffect(() => {
    setLang(getLang()); // sync <html lang>
    const f = () => setPage(fromHash());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  const go = (p: Page) => {
    location.hash = p === 'lobby' ? '' : `#/${p}`;
    setPage(p);
    window.scrollTo(0, 0);
  };
  if (session) return <GameView key={session.gameId} s={session} />;
  if (page === 'howto') return <HowTo back={() => go('lobby')} />;
  if (page === 'process') return <ProcessPage back={() => go('lobby')} />;
  return <Lobby go={(p) => go(p)} />;
}

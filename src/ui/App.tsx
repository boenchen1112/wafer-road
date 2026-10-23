import { useEffect, useState } from 'preact/hooks';
import { GameView } from './GameView';
import { Lobby } from './Lobby';
import { HowTo, ProcessPage } from './Pages';
import { useSession, localModel } from './store';
import { JoinInvite, OnlineScreen } from './Online';
import { inviteCode, resumeFromUrl, useOnline } from '../online/client';
import { setLang, getLang, useLang } from '../i18n';

type Page = 'lobby' | 'howto' | 'process';

function fromHash(): Page {
  const h = location.hash.replace(/^#\/?/, '');
  return h === 'howto' || h === 'process' ? h : 'lobby';
}

export function App() {
  const [page, setPage] = useState<Page>(fromHash());
  const session = useSession();
  const online = useOnline();
  const [invite, setInvite] = useState<string | null>(() => (resumeFromUrl() ? null : inviteCode()));
  useLang();
  useEffect(() => {
    if (online) setInvite(null);
  }, [online]);
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
  if (online) return <OnlineScreen o={online} />;
  if (session) {
    const m = localModel(session);
    return <GameView key={m.gameKey} m={m} />;
  }
  if (invite) {
    return (
      <JoinInvite
        code={invite}
        back={() => {
          setInvite(null);
          const u = new URL(location.href);
          u.searchParams.delete('room');
          history.replaceState(null, '', u.toString());
        }}
      />
    );
  }
  if (page === 'howto') return <HowTo back={() => go('lobby')} />;
  if (page === 'process') return <ProcessPage back={() => go('lobby')} />;
  return <Lobby go={(p) => go(p)} />;
}

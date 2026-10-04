import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import HomePage from './pages/HomePage';
import RulesOverlay from './components/game/RulesOverlay';
import IconSprite from './components/icons/IconSprite';
import { createRoom, ensurePlayerId } from './lib/rooms';
import './App.css';

const GameBoard = lazy(() => import('./pages/GameBoard'));
const LobbyPage = lazy(() => import('./pages/LobbyPage'));

type Route =
  | { page: 'home' }
  | { page: 'lobby'; roomCode: string }
  | { page: 'game'; roomCode: string };

function routeFromPath(path: string): Route {
  const match = path.match(/^\/(lobby|game)\/([A-Z0-9]{4,6})\/?$/i);
  if (!match) return { page: 'home' };
  const roomCode = match[2].toUpperCase();
  return match[1].toLowerCase() === 'lobby'
    ? { page: 'lobby', roomCode }
    : { page: 'game', roomCode };
}

function App() {
  const [route, setRoute] = useState<Route>(() => routeFromPath(window.location.pathname));
  const [showRules, setShowRules] = useState(false);
  const [identityError, setIdentityError] = useState('');

  useEffect(() => {
    let mounted = true;
    void ensurePlayerId()
      .then(() => { if (mounted) setIdentityError(''); })
      .catch((error: unknown) => {
        if (mounted) setIdentityError(error instanceof Error ? error.message : 'Unable to connect to Firebase.');
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const handlePopState = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((path: string) => {
    if (window.location.pathname === path) return;
    window.history.pushState({}, '', path);
    setRoute(routeFromPath(path));
  }, []);
  const handleLeaveRoom = useCallback(() => navigate('/'), [navigate]);
  const handleStartGame = useCallback(
    () => navigate(`/game/${route.page === 'lobby' ? route.roomCode : ''}`),
    [navigate, route]
  );
  const handleRenameRoom = useCallback((code: string) => navigate(`/lobby/${code}`), [navigate]);
  const handleOpenLobby = useCallback((roomCode: string) => navigate(`/lobby/${roomCode}`), [navigate]);
  const handleReturnToLobby = useCallback((roomCode: string) => {
    window.location.assign(`/lobby/${roomCode}`);
  }, []);

  if (route.page === 'lobby') {
    return (
      <>
        <IconSprite />
        {identityError && <p className="bg-rose-950 p-3 text-center text-sm text-rose-100" role="alert">{identityError}</p>}
        <Suspense fallback={<main className="min-h-screen bg-black p-8 text-center text-white" role="status">Loading room…</main>}>
          <LobbyPage
            roomCode={route.roomCode}
            onLeave={handleLeaveRoom}
            onRenameRoom={handleRenameRoom}
            onStartGame={handleStartGame}
            onCreateRoom={(code) => createRoom(sessionStorage.getItem('3eal-player-name') ?? 'Player 1', code)}
          />
        </Suspense>
      </>
    );
  }

  if (route.page === 'game') {
    return (
      <>
        <IconSprite />
        {identityError && <p className="bg-rose-950 p-3 text-center text-sm text-rose-100" role="alert">{identityError}</p>}
        <Suspense fallback={<main className="min-h-screen bg-black p-8 text-center text-white" role="status">Loading game…</main>}>
          <GameBoard
            key={route.roomCode}
            roomCode={route.roomCode}
            onLeave={handleLeaveRoom}
            onReturnToLobby={() => handleReturnToLobby(route.roomCode)}
          />
        </Suspense>
      </>
    );
  }

  return (
    <>
      <IconSprite />
      {identityError && <p className="bg-rose-950 p-3 text-center text-sm text-rose-100" role="alert">{identityError}</p>}
      <HomePage
        onJoinRoom={handleOpenLobby}
        onCreateRoom={async () => {
          return createRoom(sessionStorage.getItem('3eal-player-name') ?? 'Player 1');
        }}
        onRules={() => setShowRules(true)}
      />
      {showRules && <RulesOverlay onClose={() => setShowRules(false)} />}
    </>
  );
}

export default App;

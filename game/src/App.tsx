import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import HomePage from './pages/HomePage';
import RulesOverlay from './components/game/RulesOverlay';
import './App.css';

const WorkerGameBoard = lazy(() => import('./pages/WorkerGameBoard'));
const WorkerLobbyPage = lazy(() => import('./pages/WorkerLobbyPage'));

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

  useEffect(() => {
    const handlePopState = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/config')
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{ webAnalyticsToken?: string }>;
      })
      .then((config) => {
        if (cancelled || !config?.webAnalyticsToken) return;
        if (document.querySelector('script[data-3eal-analytics]')) return;
        const beacon = document.createElement('script');
        beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
        beacon.defer = true;
        beacon.dataset['3ealAnalytics'] = 'true';
        beacon.dataset.cfBeacon = JSON.stringify({ token: config.webAnalyticsToken });
        document.head.append(beacon);
      })
      .catch((error: unknown) => {
        console.error('Cloudflare Web Analytics configuration could not be loaded.', error);
      });
    return () => { cancelled = true; };
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
  const handleOpenLobby = useCallback((roomCode: string) => navigate(`/lobby/${roomCode}`), [navigate]);
  const handleReturnToLobby = useCallback((roomCode: string) => {
    window.location.assign(`/lobby/${roomCode}`);
  }, []);

  if (route.page === 'lobby') {
    return (
      <Suspense fallback={<main className="min-h-screen bg-black p-8 text-center text-white" role="status">Loading room…</main>}>
        <WorkerLobbyPage
          roomCode={route.roomCode}
          onLeave={handleLeaveRoom}
          onStartGame={handleStartGame}
        />
      </Suspense>
    );
  }

  if (route.page === 'game') {
    return (
      <Suspense fallback={<main className="min-h-screen bg-black p-8 text-center text-white" role="status">Loading game…</main>}>
        <WorkerGameBoard
          key={route.roomCode}
          roomCode={route.roomCode}
          onLeave={handleLeaveRoom}
          onReturnToLobby={() => handleReturnToLobby(route.roomCode)}
        />
      </Suspense>
    );
  }

  return (
    <>
      <HomePage
        onJoinRoom={handleOpenLobby}
        useTurnstile
        onCreateRoom={async (name, turnstileToken) => {
          const response = await fetch('/api/rooms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, turnstileToken })
          });
          const payload: unknown = await response.json();
          if (!response.ok) {
            const message = typeof payload === 'object' && payload !== null && 'error' in payload
              ? String(payload.error)
              : 'Unable to create a room.';
            throw new Error(message);
          }
          if (typeof payload !== 'object' || payload === null
            || !('roomCode' in payload) || typeof payload.roomCode !== 'string'
            || !('sessionId' in payload) || typeof payload.sessionId !== 'string') {
            throw new Error('The room service returned an invalid response.');
          }
          return { roomCode: payload.roomCode, sessionId: payload.sessionId };
        }}
        onRules={() => setShowRules(true)}
      />
      {showRules && <RulesOverlay onClose={() => setShowRules(false)} />}
    </>
  );
}

export default App;

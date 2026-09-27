import { useCallback, useEffect, useState } from 'react';
import GameBoard from './pages/GameBoard';
import HomePage from './pages/HomePage';
import LobbyPage from './pages/LobbyPage';
import RulesOverlay from './components/game/RulesOverlay';
import { createRoom } from './lib/rooms';
import './App.css';

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

  if (route.page === 'lobby') {
    return (
      <LobbyPage
        roomCode={route.roomCode}
        onLeave={handleLeaveRoom}
        onRenameRoom={handleRenameRoom}
        onStartGame={handleStartGame}
      />
    );
  }

  if (route.page === 'game') {
    return (
      <GameBoard
        key={route.roomCode}
        roomCode={route.roomCode}
      />
    );
  }

  return (
    <>
      <HomePage
        onJoinRoom={handleOpenLobby}
        onCreateRoom={() => createRoom(sessionStorage.getItem('3eal-player-name') ?? 'Player 1')}
        onRules={() => setShowRules(true)}
      />
      {showRules && <RulesOverlay onClose={() => setShowRules(false)} />}
    </>
  );
}

export default App;

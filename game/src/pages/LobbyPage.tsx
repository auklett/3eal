import { useEffect, useMemo, useState } from 'react';
import {
  ensurePlayerId,
  joinRoom,
  kickPlayer,
  leaveRoom,
  renamePlayer,
  renameRoom,
  setLobbyRole,
  setLobbyTurnDuration,
  startRoom,
  subscribeToRoom,
  type LobbyRoom
} from '../lib/rooms';
import { GAME_CONFIG } from '../logic/config';

interface LobbyPageProps {
  roomCode: string;
  onStartGame: () => void;
  onLeave: () => void;
  onRenameRoom: (newCode: string) => void;
  onCreateRoom: (roomCode: string) => Promise<string>;
}

const buttonStyle: React.CSSProperties = {
  minHeight: 44,
  borderRadius: 12,
  border: '2px solid #FFFFFF',
  padding: '10px 18px',
  backgroundColor: '#000000',
  color: '#FFFFFF',
  fontWeight: 600,
  cursor: 'pointer'
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export default function LobbyPage({ roomCode, onStartGame, onLeave, onRenameRoom, onCreateRoom }: LobbyPageProps) {
  const [room, setRoom] = useState<LobbyRoom | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState(() => sessionStorage.getItem('3eal-player-name') ?? 'Player 1');
  const [newRoomCode, setNewRoomCode] = useState(roomCode);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | undefined;

    const connect = async () => {
      try {
        const id = await ensurePlayerId();
        if (!isMounted) return;
        setPlayerId(id);
        sessionStorage.setItem('3eal-player-id', id);
        await joinRoom(roomCode, sessionStorage.getItem('3eal-player-name') ?? 'Player 1');
        if (!isMounted) return;

        unsubscribe = subscribeToRoom(
          roomCode,
          (nextRoom) => {
            if (!isMounted) return;
            setRoom(nextRoom);
            setLoading(false);
            if (!nextRoom) {
              setError('This room no longer exists.');
              return;
            }
            if (!nextRoom.players[id]) {
              sessionStorage.removeItem('3eal-room-code');
              sessionStorage.removeItem('3eal-room-players');
              sessionStorage.removeItem('3eal-room-host');
              setError('You are no longer a member of this room.');
              onLeave();
              return;
            }
            sessionStorage.setItem('3eal-room-code', nextRoom.roomCode);
            sessionStorage.setItem('3eal-room-players', JSON.stringify(Object.values(nextRoom.players)));
            sessionStorage.setItem('3eal-room-host', nextRoom.hostId);
            const me = nextRoom.players[id];
            if (me) setPlayerName(me.name);
            if (nextRoom.status === 'IN_GAME') onStartGame();
          },
          (subscriptionError) => {
            if (!isMounted) return;
            setLoading(false);
            setError(subscriptionError.message);
          }
        );
      } catch (connectionError) {
        if (!isMounted) return;
        setLoading(false);
        setError(errorText(connectionError));
      }
    };

    setLoading(true);
    setError('');
    void connect();
    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [roomCode, onLeave, onStartGame]);

  const isHost = room?.hostId === playerId;
  const isLobbyOpen = room?.status === 'LOBBY';
  const players = useMemo(
    () => Object.values(room?.players ?? {}).sort((a, b) => a.joinedAt - b.joinedAt),
    [room?.players]
  );
  const playerCount = players.filter((player) => (player.role ?? 'PLAYER') === 'PLAYER').length;
  const spectatorCount = players.length - playerCount;
  const myRole = room?.players[playerId ?? '']?.role ?? 'PLAYER';

  const runAction = async (action: string, callback: () => Promise<void>) => {
    setBusyAction(action);
    setError('');
    setNotice('');
    try {
      await callback();
    } catch (actionError) {
      setError(errorText(actionError));
    } finally {
      setBusyAction(null);
    }
  };

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setNotice('Room code copied.');
      setError('');
    } catch {
      setError(`Copy unavailable. Share this room code: ${roomCode}`);
    }
  };

  const savePlayerName = () => runAction('rename-player', async () => {
    await renamePlayer(roomCode, playerName);
    const normalizedName = playerName.trim().slice(0, 24);
    sessionStorage.setItem('3eal-player-name', normalizedName);
    setPlayerName(normalizedName);
    setNotice('Name updated.');
  });

  const updateRoomCode = () => runAction('rename-room', async () => {
    const normalizedCode = newRoomCode.trim().toUpperCase();
    await renameRoom(roomCode, normalizedCode);
    onRenameRoom(normalizedCode);
  });

  const removePlayer = (id: string, name: string) => runAction(`kick:${id}`, async () => {
    await kickPlayer(roomCode, id);
    setNotice(`${name} was removed from the room.`);
  });

  const handleLeave = () => runAction('leave', async () => {
    if (room) await leaveRoom(roomCode);
    sessionStorage.removeItem('3eal-room-code');
    sessionStorage.removeItem('3eal-room-players');
    onLeave();
  });

  const handleCreateRoom = () => runAction('create-room', async () => {
    const newCode = await onCreateRoom(roomCode);
    onRenameRoom(newCode);
  });

  const handleStartGame = () => runAction('start', async () => {
    await startRoom(roomCode);
    onStartGame();
  });

  const switchRole = () => runAction('role', async () => {
    const nextRole = myRole === 'PLAYER' ? 'SPECTATOR' : 'PLAYER';
    await setLobbyRole(roomCode, nextRole);
    setNotice(`You joined as a ${nextRole === 'PLAYER' ? 'player' : 'spectator'}.`);
  });

  const updateTurnDuration = (value: string) => runAction('turn-duration', async () => {
    const duration = Number(value);
    await setLobbyTurnDuration(roomCode, duration);
    setNotice(`Turn limit set to ${duration / 1_000} seconds.`);
  });

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white sm:py-12">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="m-0 text-4xl font-black tracking-widest text-white">3EAL</h1>
          <button type="button" style={buttonStyle} onClick={handleLeave} disabled={busyAction !== null}>
            Leave Room
          </button>
        </header>

        <section className="rounded-2xl border border-white/30 bg-white/[0.05] p-6 sm:p-8">
          <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="mb-2 text-2xl font-bold text-white">Lobby</h2>
              <p className="text-sm text-white/70">
                {room?.status === 'IN_GAME' ? 'Game in progress' : room?.status === 'FINISHED' ? 'Game finished' : 'Waiting for players'}
              </p>
            </div>
            <div className="text-right">
              <p className="mb-2 text-sm text-white/70">Room Code</p>
              <button
                type="button"
                onClick={copyRoomCode}
                aria-label={`Copy room code ${roomCode}`}
                className="rounded-lg border border-white/40 bg-black px-5 py-3 font-mono text-2xl font-bold tracking-[0.2em] text-white hover:border-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400"
              >
                {roomCode}
              </button>
              <button type="button" className="ml-2 underline underline-offset-4" onClick={copyRoomCode}>Copy</button>
            </div>
          </div>

          {!room && !loading && error ? (
            <div className="rounded-xl border border-rose-300/30 bg-rose-950/20 p-5 text-center">
              <h3 className="mb-2 text-lg font-semibold">Unable to join this room</h3>
              <p className="mb-5 text-sm text-white/70">{error}</p>
              <div className="flex flex-wrap justify-center gap-3">
                <button type="button" style={buttonStyle} onClick={handleLeave} disabled={busyAction !== null}>
                  Back to Main Screen
                </button>
                <button type="button" style={buttonStyle} onClick={handleCreateRoom} disabled={busyAction !== null}>
                  {busyAction === 'create-room' ? 'Creating Lobby…' : 'Create Lobby with This Code'}
                </button>
              </div>
            </div>
          ) : <>
          <div className="mb-7 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Players ({playerCount}) · Spectators ({spectatorCount})</h3>
            <span className="text-sm text-white/60" aria-live="polite">Live lobby</span>
          </div>

          {loading ? (
            <p className="mb-7 text-white/70" role="status">Connecting to room…</p>
          ) : players.length === 0 ? (
            <p className="mb-7 text-white/70">No players are in this room.</p>
          ) : (
            <ul className="mb-7 space-y-3">
              {players.map((player) => (
                <li key={player.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/20 p-4">
                  <span className="font-semibold">{player.name}{player.id === playerId ? ' (You)' : ''}</span>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-white/25 px-3 py-1 text-sm text-white/70">
                      {player.role === 'SPECTATOR' ? 'Spectator' : 'Player'}
                    </span>
                    {room?.hostId === player.id && (
                      <span className="rounded-full border border-teal-300 px-3 py-1 text-sm text-teal-100">Host</span>
                    )}
                    {isHost && isLobbyOpen && player.id !== playerId && (
                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() => removePlayer(player.id, player.name)}
                        aria-label={`Kick ${player.name}`}
                        className="min-h-11 rounded-lg border border-rose-300/70 px-3 py-2 text-sm text-rose-100 hover:bg-rose-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400"
                      >
                        {busyAction === `kick:${player.id}` ? 'Removing…' : 'Kick'}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-4 border-t border-white/20 pt-5">
            {isLobbyOpen && playerId !== room?.hostId && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-white/75">
                  You are joining as a {myRole === 'SPECTATOR' ? 'spectator' : 'player'}.
                </p>
                <button type="button" style={buttonStyle} disabled={busyAction !== null} onClick={switchRole}>
                  Switch to {myRole === 'PLAYER' ? 'Spectator' : 'Player'}
                </button>
              </div>
            )}
            <label className="block">
              <span className="mb-2 block text-sm text-white/80">Rename yourself</span>
              <div className="flex flex-wrap gap-2">
                <input
                  value={playerName}
                  maxLength={24}
                  onChange={(event) => setPlayerName(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && void savePlayerName()}
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-white/30 bg-black px-3 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400"
                />
                <button type="button" style={buttonStyle} disabled={busyAction !== null || !isLobbyOpen} onClick={() => void savePlayerName()}>
                  Save Name
                </button>
              </div>
            </label>

            {isHost && isLobbyOpen && (
              <label className="block">
                <span className="mb-2 block text-sm text-white/80">Rename room</span>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={newRoomCode}
                    maxLength={6}
                    onChange={(event) => setNewRoomCode(event.target.value.replace(/[^a-z\d]/gi, '').toUpperCase())}
                    className="min-h-11 min-w-0 flex-1 rounded-lg border border-white/30 bg-black px-3 font-mono uppercase text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400"
                  />
                  <button type="button" style={buttonStyle} disabled={busyAction !== null} onClick={() => void updateRoomCode()}>
                    Rename Room
                  </button>
                </div>
              </label>
            )}

            {isHost && isLobbyOpen && (
              <label className="block">
                <span className="mb-2 block text-sm text-white/80">Turn time limit</span>
                <select
                  value={room?.turnDurationMs ?? GAME_CONFIG.defaultTurnDurationMs}
                  disabled={busyAction !== null}
                  onChange={(event) => void updateTurnDuration(event.target.value)}
                  className="min-h-11 rounded-lg border border-white/30 bg-black px-3 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400"
                >
                  {GAME_CONFIG.turnDurationOptionsMs.map((duration) => (
                    <option key={duration} value={duration}>{duration / 1_000} seconds</option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-white/60">Three consecutive missed turns forfeit a seat.</p>
              </label>
            )}

            {isHost && isLobbyOpen && (
              <>
                <button
                  type="button"
                  disabled={busyAction !== null || loading || room?.status !== 'LOBBY' || playerCount < 2}
                  onClick={() => void handleStartGame()}
                  className="min-h-12 w-full rounded-xl bg-white px-5 py-3 font-bold text-black hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400"
                >
                  {busyAction === 'start' ? 'Starting…' : 'Start Game'}
                </button>
                {playerCount < 2 && <p className="text-center text-sm text-white/60">At least two players must join before the game can start.</p>}
              </>
            )}
            {room?.status === 'FINISHED'
              ? <p className="text-center text-sm text-white/70">This game has finished. You can leave this room when you are ready.</p>
              : !isHost && <p className="text-center text-sm text-white/70">Waiting for the host to start the game.</p>}
          </div>
          {error && <p className="mt-4 text-center text-sm text-rose-300" role="alert">{error}</p>}
          {notice && <p className="mt-4 text-center text-sm text-teal-100" role="status">{notice}</p>}
          </>}
        </section>
      </div>
    </main>
  );
}

import { useEffect, useState } from 'react';
import { useRoom } from '../hooks/useRoom';
import type { View } from '../shared/protocol';

interface WorkerLobbyPageProps {
  roomCode: string;
  onStartGame: () => void;
  onLeave: () => void;
}

const buttonClass = 'min-h-11 rounded-xl border border-white/30 px-4 py-2 font-semibold transition hover:border-teal-300 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40';

function viewData(view: View | null) {
  return view?.data;
}

export default function WorkerLobbyPage({ roomCode, onStartGame, onLeave }: WorkerLobbyPageProps) {
  const name = sessionStorage.getItem('3eal-player-name') ?? 'Player 1';
  const { view, status, error, clearError, send, rejoinRequests } = useRoom(roomCode, { name });
  const [validationError, setValidationError] = useState('');
  const [turnSeconds, setTurnSeconds] = useState(60);
  const data = viewData(view);
  const currentId = view?.role === 'player' ? view.data.you.id : sessionStorage.getItem(`3eal-session:${roomCode}`);
  const isHost = Boolean(data && currentId && data.hostId === currentId);
  const isLobby = data?.phase === 'lobby';

  useEffect(() => {
    if (view && view.data.phase !== 'lobby') onStartGame();
  }, [view, onStartGame]);

  // Validate room code format
  useEffect(() => {
    if (status === 'closed' || (view && error)) {
      const errorMessage = error || (status === 'closed' && 'Room not found or invalid code');
      if (errorMessage) {
        setValidationError(errorMessage.includes('Room not found') || errorMessage.includes('invalid code')
          ? 'Invalid room code. Please check the code or create a new room.'
          : errorMessage);
      }
    }
  }, [status, view, error]);

  useEffect(() => {
    if (data) setTurnSeconds(data.turnDurationSeconds);
  }, [data]);

  const copyCode = () => {
    void navigator.clipboard.writeText(roomCode).catch(() => {
      clearError();
    });
  };

  const requestRejoin = () => {
    const requestedName = window.prompt('Enter the player name you want to rejoin:')?.trim();
    if (!requestedName) return;
    sessionStorage.setItem('3eal-player-name', requestedName);
    sessionStorage.removeItem(`3eal-session:${roomCode}`);
    window.location.reload();
  };

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black p-6 text-center text-white">
        <div className="max-w-md space-y-3">
          <p role={error ? 'alert' : 'status'}>{error || (status === 'awaitingApproval' ? 'Waiting for host approval…' : 'Connecting to room…')}</p>
          {status === 'awaitingApproval' && <p className="text-sm text-white/60">You will join as a spectator if the host declines or does not respond within 60 seconds.</p>}
          {error && <button type="button" className={buttonClass} onClick={onLeave}>Return Home</button>}
        </div>
      </main>
    );
  }

  const players = data.players;
  const spectators = data.spectators;
  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white sm:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="m-0 text-4xl font-black tracking-widest">3EAL</h1>
            <p className="text-sm text-white/60">Lobby · {status === 'connected' ? 'Connected' : 'Reconnecting…'}</p>
          </div>
          <button type="button" className={buttonClass} onClick={onLeave}>Leave</button>
        </header>

    {validationError && <p className="mb-5 text-sm text-rose-300" role="alert">{validationError}</p>}

        <section className="rounded-2xl border border-white/25 bg-white/[0.05] p-5 sm:p-8">
          <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">Room {roomCode}</h2>
              <p className="text-white/60">Share the code to invite players or spectators.</p>
            </div>
            <button type="button" className={`${buttonClass} font-mono tracking-[0.2em]`} onClick={copyCode}>Copy code</button>
          </div>

          {error && <p className="mb-5 text-sm text-rose-300" role="alert">{error}</p>}

          <div className="mb-7 grid gap-7 md:grid-cols-2">
            <section>
              <h3 className="mb-3 text-lg font-semibold">Players ({players.length})</h3>
              <ul className="space-y-2">
                {players.map((player) => (
                  <li key={player.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/15 p-3">
                    <span>
                      {player.name}{player.id === currentId ? ' (You)' : ''}
                      {player.id === data.hostId && <span className="ml-2 text-xs text-teal-200">Host</span>}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-white/60">
                      {!player.connected && 'Disconnected'}
                      {isHost && player.id !== currentId && (
                        <button type="button" className="underline" onClick={() => send({ t: 'kick', targetId: player.id })}>Kick</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="mb-3 text-lg font-semibold">Spectators ({data.spectatorCount})</h3>
              <ul className="space-y-2">
                {spectators.map((spectator) => (
                  <li key={spectator.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/15 p-3">
                    <span>{spectator.name}{spectator.id === currentId ? ' (You)' : ''}</span>
                    {isHost && (
                      <button type="button" className="text-xs underline" onClick={() => send({ t: 'kick', targetId: spectator.id })}>Kick</button>
                    )}
                  </li>
                ))}
                {spectators.length === 0 && <li className="text-sm text-white/50">No spectators yet.</li>}
              </ul>
            </section>
          </div>

          {isLobby && view?.role === 'player' && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/15 p-4">
              <div>
                <h3 className="font-semibold">Your role</h3>
                <p className="text-sm text-white/60">You can switch roles until the host starts.</p>
              </div>
              <button type="button" className={buttonClass} onClick={() => send({ t: 'setRole', role: 'spectator' })}>
                Join as spectator
              </button>
            </div>
          )}
          {isLobby && view?.role === 'spectator' && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/15 p-4">
              <div>
                <h3 className="font-semibold">Watching as a spectator</h3>
                <p className="text-sm text-white/60">Spectators receive the same public view as opposing players.</p>
              </div>
              <button type="button" className={buttonClass} onClick={() => send({ t: 'setRole', role: 'player' })}>
                Join as player
              </button>
            </div>
          )}
          {view?.role === 'spectator' && data.phase !== 'lobby' && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/15 p-4">
              <div>
                <h3 className="font-semibold">Need to rejoin a seat?</h3>
                <p className="text-sm text-white/60">Enter the player’s name; the host must approve the request.</p>
              </div>
              <button type="button" className={buttonClass} onClick={requestRejoin}>Request rejoin</button>
            </div>
          )}

          {isHost && isLobby && (
            <section className="flex flex-wrap items-end justify-between gap-4 border-t border-white/15 pt-6">
              <label className="space-y-2">
                <span className="block text-sm font-semibold">Turn timer (15–180 seconds)</span>
                <input
                  type="number"
                  min={15}
                  max={180}
                  value={turnSeconds}
                  onChange={(event) => setTurnSeconds(Number(event.target.value))}
                  onBlur={() => {
                    if (Number.isInteger(turnSeconds) && turnSeconds >= 15 && turnSeconds <= 180) {
                      send({ t: 'setTurnTimer', seconds: turnSeconds });
                    } else {
                      setTurnSeconds(data.turnDurationSeconds);
                    }
                  }}
                  className="h-11 w-36 rounded-lg border border-white/25 bg-black px-3 text-white"
                />
              </label>
              <button
                type="button"
                className={`${buttonClass} bg-white text-black`}
                disabled={players.length < 2 || status !== 'connected'}
                onClick={() => send({ t: 'start' })}
              >
                Start game
              </button>
            </section>
          )}

          {rejoinRequests.length > 0 && isHost && (
            <section className="mt-6 border-t border-white/15 pt-6">
              <h3 className="mb-3 text-lg font-semibold">Rejoin requests</h3>
              <ul className="space-y-2">
                {rejoinRequests.map((request) => (
                  <li key={request.requestId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/15 p-3">
                    <span>{request.name} wants to rejoin.</span>
                    <div className="flex gap-2">
                      <button type="button" className={buttonClass} onClick={() => send({ t: 'rejoinDecision', requestId: request.requestId, accept: true })}>Approve</button>
                      <button type="button" className={buttonClass} onClick={() => send({ t: 'rejoinDecision', requestId: request.requestId, accept: false })}>Decline</button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>

        {data.phase !== 'lobby' && (
          <p className="mt-5 text-center text-white/70" role="status">The game is starting…</p>
        )}
      </div>
    </main>
  );
}

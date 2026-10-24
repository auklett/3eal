import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { MAX_STARTING_PLAYERS } from '@3eal/engine';
import { useRoom } from '../hooks/useRoom';
import { usePresenceList } from '../hooks/usePresenceList';
import TurnstileWidget from '../components/TurnstileWidget';
import Panel from '../components/ui/Panel';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import ConnectionDot from '../components/ui/ConnectionDot';
import SpinnerDots from '../components/ui/SpinnerDots';
import { requestRoomCreation } from '../logic/createRoom';
import type { PublicPlayer, PublicSpectator, View } from '../shared/protocol';

interface WorkerLobbyPageProps {
  roomCode: string;
  onStartGame: () => void;
  onLeave: () => void;
}

const decorativeCards = [
  { color: '#C06060', shape: 'circle' },
  { color: '#008080', shape: 'triangle' },
  { color: '#C0C0FF', shape: 'square' }
] as const;

function viewData(view: View | null) {
  return view?.data;
}

function Avatar({ name }: { name: string }) {
  const letter = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-white/[0.06] text-sm font-semibold text-white/80"
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}

export default function WorkerLobbyPage({ roomCode, onStartGame, onLeave }: WorkerLobbyPageProps) {
  const name = sessionStorage.getItem('3eal-player-name') ?? 'Player 1';
  const { view, status, error, clearError, send, pending, left } = useRoom(roomCode, { name });
  const [validationError, setValidationError] = useState('');
  const [turnSeconds, setTurnSeconds] = useState(60);
  const [timerText, setTimerText] = useState('60');
  const [timerError, setTimerError] = useState('');
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [isChangingName, setIsChangingName] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmKickId, setConfirmKickId] = useState<string | null>(null);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [isCreatingLobby, setIsCreatingLobby] = useState(false);
  const [createLobbyError, setCreateLobbyError] = useState('');
  const pendingName = useRef<string | null>(null);
  const copyTimer = useRef<number | undefined>(undefined);
  const awaitingTimer = useRef(false);
  const lastSentTimer = useRef<number | null>(null);
  const roleRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const data = viewData(view);
  const authoritativeTurnSeconds = data?.turnDurationSeconds;
  const currentId = view?.role === 'player' ? view.data.you.id : sessionStorage.getItem(`3eal-session:${roomCode}`);
  const isHost = Boolean(data && currentId && data.hostId === currentId);
  const isLobby = data?.phase === 'lobby';
  const players = useMemo(() => data?.players ?? [], [data]);
  const spectators = useMemo(() => data?.spectators ?? [], [data]);
  const self = players.find((player) => player.id === currentId) ?? spectators.find((spectator) => spectator.id === currentId);
  const myName = self?.name ?? name;
  const connected = status === 'connected';

  const people = usePresenceList(useMemo(() => [...players, ...spectators], [players, spectators]));
  const playerIds = new Set(players.map((player) => player.id));
  const hostRejoinRequests = view?.role === 'player' ? view.data.you.rejoinRequests : [];

  useEffect(() => {
    if (view && view.data.phase !== 'lobby') onStartGame();
  }, [view, onStartGame]);

  useEffect(() => {
    if (left) onLeave();
  }, [left, onLeave]);

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

  // Only a new authoritative timer value resets the field; ordinary snapshots
  // must not clobber digits while the host is typing.
  useEffect(() => {
    if (authoritativeTurnSeconds === undefined) return;
    setTurnSeconds(authoritativeTurnSeconds);
    setTimerText(String(authoritativeTurnSeconds));
    setTimerError('');
    awaitingTimer.current = false;
    lastSentTimer.current = authoritativeTurnSeconds;
  }, [authoritativeTurnSeconds]);

  // A rejected timer update reverts to the server's previous value.
  useEffect(() => {
    if (!awaitingTimer.current || !error || !data) return;
    setTimerError(error);
    setTurnSeconds(data.turnDurationSeconds);
    setTimerText(String(data.turnDurationSeconds));
    awaitingTimer.current = false;
    lastSentTimer.current = data.turnDurationSeconds;
  }, [error, data]);

  // Update stored name when the server assigns/confirms one, and close the
  // inline editor once our requested name lands.
  useEffect(() => {
    if (view && view.role === 'player' && view.data.you.id) {
      const currentPlayer = view.data.players.find((player) => player.id === view.data.you.id);
      if (currentPlayer) {
        const actualName = currentPlayer.name;
        const storedName = sessionStorage.getItem('3eal-player-name');
        if (storedName !== actualName) sessionStorage.setItem('3eal-player-name', actualName);
        if (pendingName.current && actualName === pendingName.current) {
          pendingName.current = null;
          setIsChangingName(false);
          setIsEditingName(false);
        }
      }
    }
  }, [view]);

  // A rejected rename keeps the editor open and shows the server's message.
  useEffect(() => {
    if (!isChangingName || !error) return;
    setNameError(error);
    setIsChangingName(false);
  }, [isChangingName, error]);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/config')
      .then(async (response) => (response.ok ? response.json() : null) as Promise<{ turnstileSiteKey?: string } | null>)
      .then((config) => { if (!cancelled && config?.turnstileSiteKey) setTurnstileSiteKey(config.turnstileSiteKey); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => {
    if (copyTimer.current !== undefined) window.clearTimeout(copyTimer.current);
  }, []);

  const copyCode = () => {
    void navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true);
      if (copyTimer.current !== undefined) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
    }).catch(() => clearError());
  };

  const startRename = () => {
    clearError();
    setNameError('');
    setNewName(myName);
    setIsEditingName(true);
  };

  const submitRename = () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setNameError('Please enter a name');
      return;
    }
    if (trimmed.length < 1 || trimmed.length > 24) {
      setNameError('Name must be between 1 and 24 characters');
      return;
    }
    if (trimmed === myName) {
      setIsEditingName(false);
      return;
    }
    pendingName.current = trimmed;
    setIsChangingName(true);
    setNameError('');
    send({ t: 'changeName', name: trimmed });
  };

  const setSliderSeconds = (value: number) => {
    setTurnSeconds(value);
    setTimerText(String(value));
  };

  const commitTurnSeconds = () => {
    if (!data) return;
    const parsed = Number(timerText);
    if (!timerText.trim() || !Number.isFinite(parsed)) {
      setSliderSeconds(data.turnDurationSeconds);
      return;
    }
    const clamped = Math.min(180, Math.max(15, Math.round(parsed)));
    setSliderSeconds(clamped);
    if (clamped === data.turnDurationSeconds && !awaitingTimer.current) return;
    // Enter commits and then blurs the field; do not send the same value twice.
    if (awaitingTimer.current && clamped === lastSentTimer.current) return;
    awaitingTimer.current = true;
    lastSentTimer.current = clamped;
    setTimerError('');
    const sent = send({ t: 'setTurnTimer', seconds: clamped });
    if (!sent) {
      awaitingTimer.current = false;
      lastSentTimer.current = data.turnDurationSeconds;
    }
  };

  const chooseRole = (role: 'player' | 'spectator') => {
    if (view?.role === role) return;
    send({ t: 'setRole', role });
  };

  const onRoleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const roles: Array<'player' | 'spectator'> = ['player', 'spectator'];
    const current = Math.max(0, roles.indexOf(view?.role ?? 'player'));
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (current + direction + roles.length) % roles.length;
    chooseRole(roles[nextIndex]);
    roleRefs.current[nextIndex]?.focus();
  };

  const handleLeaveRoom = () => {
    if (pending) return;
    if (!send({ t: 'leaveRoom' }, { pending: 'Leaving the lobby…', confirmation: 'You left the lobby.' })) onLeave();
  };

  const requestRejoin = () => {
    const requestedName = window.prompt('Enter the player name you want to rejoin:')?.trim();
    if (!requestedName) return;
    sessionStorage.setItem('3eal-player-name', requestedName);
    sessionStorage.removeItem(`3eal-session:${roomCode}`);
    window.location.reload();
  };

  const createLobbyWithCode = async () => {
    setIsCreatingLobby(true);
    setCreateLobbyError('');
    try {
      const storedName = sessionStorage.getItem('3eal-player-name') || name || 'Player 1';
      const created = await requestRoomCreation(storedName, turnstileToken, roomCode);
      if (created.sessionId) sessionStorage.setItem(`3eal-session:${created.roomCode}`, created.sessionId);
      window.location.assign(`/lobby/${created.roomCode}`);
    } catch (createError) {
      setCreateLobbyError(createError instanceof Error ? createError.message : 'Unable to create a room.');
      setTurnstileToken('');
      setTurnstileResetKey((key) => key + 1);
    } finally {
      setIsCreatingLobby(false);
    }
  };

  if (status === 'notFound') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black p-6 text-center text-white">
        <Panel padding="roomy" className="w-full max-w-md">
          <h1 className="mb-1 text-2xl font-black tracking-[0.16em]">3EAL</h1>
          <p className="mb-1 text-lg font-semibold" role="alert">Room not found</p>
          <p className="mb-6 text-sm text-muted">
            Room <span className="font-mono tracking-widest">{roomCode}</span> does not exist yet.
          </p>
          <div className="space-y-2">
            <Button variant="primary" fullWidth disabled={isCreatingLobby} onClick={() => void createLobbyWithCode()}>
              {isCreatingLobby ? 'Creating…' : 'Create lobby using the entered code'}
            </Button>
            <Button variant="ghost" fullWidth onClick={onLeave}>Return home</Button>
          </div>
          {turnstileSiteKey && (
            <div className="mt-4">
              <TurnstileWidget siteKey={turnstileSiteKey} resetKey={turnstileResetKey} onToken={setTurnstileToken} />
            </div>
          )}
          {createLobbyError && <p className="mt-3 text-sm text-rose-300" role="alert">{createLobbyError}</p>}
        </Panel>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black p-6 text-center text-white">
        <Panel padding="roomy" className="w-full max-w-md">
          <p className="mb-2 flex items-center justify-center gap-2" role={error ? 'alert' : 'status'}>
            {status !== 'connected' && status !== 'awaitingApproval' && <SpinnerDots className="text-white/60" />}
            {error || (status === 'awaitingApproval' ? 'Waiting for host approval…' : status === 'reconnecting' ? 'Reconnecting…' : 'Connecting to room…')}
          </p>
          {status === 'awaitingApproval' && (
            <p className="mb-4 text-sm text-muted">You will join as a spectator if the host declines or does not respond within 60 seconds.</p>
          )}
          {error && <Button variant="ghost" fullWidth onClick={onLeave}>Return Home</Button>}
        </Panel>
      </main>
    );
  }

  const renderMemberContent = (
    member: PublicPlayer | PublicSpectator,
    isPlayerMember: boolean
  ) => {
    const isYou = member.id === currentId;
    const isHostMember = member.id === data.hostId;
    const away = isPlayerMember && !(member as PublicPlayer).connected;
    return (
      <>
        <Avatar name={member.name} />
        <span className="min-w-0 flex-1 truncate font-medium">{member.name}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {isHostMember && <Badge tone="accent">Host</Badge>}
          {isYou && <Badge>You</Badge>}
          {away && <Badge tone="warn">Away</Badge>}
        </span>
        {isHost && !isYou && (
          confirmKickId === member.id ? (
            <span className="flex shrink-0 items-center gap-1">
              <Button size="sm" variant="danger" onClick={() => { setConfirmKickId(null); send({ t: 'kick', targetId: member.id }); }}>Kick</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmKickId(null)}>Cancel</Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmKickId(member.id)}>Kick</Button>
          )
        )}
      </>
    );
  };

  const startDisabledReason = players.length > MAX_STARTING_PLAYERS
    ? `Up to ${MAX_STARTING_PLAYERS} players can start a game. Move extras to Spectator.`
    : players.length < 2
      ? 'Add at least one more player to start.'
      : status !== 'connected'
        ? 'Waiting for the connection to come back.'
        : '';

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white sm:py-12">
      <div className="mx-auto max-w-[520px]">
        <div className="mb-6 flex items-center justify-center gap-2.5" aria-hidden="true">
          {decorativeCards.map((card, index) => (
            <div
              key={card.shape}
              className="flex h-10 w-8 items-center justify-center rounded-md border border-white/15 opacity-90 motion-safe:animate-float"
              style={{ backgroundColor: card.color, animationDelay: `${index * 0.5}s` }}
            >
              {card.shape === 'circle' && <span className="h-4 w-4 rounded-full bg-black" />}
              {card.shape === 'triangle' && <span className="h-0 w-0 border-x-[9px] border-b-[15px] border-x-transparent border-b-black" />}
              {card.shape === 'square' && <span className="h-4 w-4 bg-black" />}
            </div>
          ))}
        </div>

        <header className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xl font-black tracking-[0.16em]">3EAL</span>
            <ConnectionDot connected={connected} />
            {!connected && <span className="text-xs text-amber-200">Reconnecting…</span>}
          </div>
          <span className="text-xs text-muted">Lobby</span>
        </header>

        {validationError && <p className="mb-4 text-sm text-rose-300" role="alert">{validationError}</p>}

        <Panel padding="roomy">
          {/* Room code hero */}
          <div className="mb-6 text-center">
            <p className="mb-2 text-xs tracking-[0.14em] text-white/50">Room code</p>
            <button
              type="button"
              onClick={copyCode}
              aria-label={`Copy room code ${roomCode}`}
              className="group inline-flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-1 transition hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <span className="font-mono text-4xl font-semibold tabular-nums tracking-[0.28em] sm:text-5xl">{roomCode}</span>
            </button>
            <p className="mt-1 h-5 text-xs" role="status" aria-live="polite">
              {copied ? <span className="text-emerald-300">Copied</span> : <span className="text-white/40">Tap to copy · share to invite</span>}
            </p>
          </div>

          {/* Players */}
          <h2 className="mb-2 text-sm font-semibold text-white/70">Players ({players.length})</h2>
          <ul className="space-y-2">
            {people.filter((entry) => playerIds.has(entry.item.id)).map((entry) => {
              const isYou = entry.item.id === currentId;
              return (
                <li
                  key={entry.item.id}
                  className={`flex items-center gap-3 rounded-[var(--radius-control)] border border-line px-3 py-2 ${isYou ? 'bg-white/[0.06]' : ''} ${entry.leaving ? 'motion-safe:animate-fade-out' : 'motion-safe:animate-fade-in'}`}
                >
                  {renderMemberContent(entry.item as PublicPlayer, true)}
                </li>
              );
            })}
          </ul>

          {/* Spectators (collapsed) */}
          {spectators.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold text-white/70">
                Spectators ({spectators.length})
              </summary>
              <ul className="mt-2 space-y-2">
                {people.filter((entry) => !playerIds.has(entry.item.id)).map((entry) => {
                  const isYou = entry.item.id === currentId;
                  return (
                    <li
                      key={entry.item.id}
                      className={`flex items-center gap-3 rounded-[var(--radius-control)] border border-line px-3 py-2 ${isYou ? 'bg-white/[0.06]' : ''} ${entry.leaving ? 'motion-safe:animate-fade-out' : 'motion-safe:animate-fade-in'}`}
                    >
                      {renderMemberContent(entry.item as PublicSpectator, false)}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}

          {/* Inline name edit */}
          <div className="mt-5 border-t border-line pt-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-white/50">Your name</p>
                <p className="truncate font-medium">{myName}</p>
              </div>
              {!isEditingName && (
                <Button size="sm" variant="ghost" aria-label="Edit your name" onClick={startRename}>Edit</Button>
              )}
            </div>
            {isEditingName && (
              <div className="mt-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    aria-label="New name"
                    placeholder="Enter new name"
                    value={newName}
                    maxLength={24}
                    autoFocus
                    onChange={(event) => { setNewName(event.target.value); setNameError(''); }}
                    onKeyDown={(event) => { if (event.key === 'Enter') submitRename(); if (event.key === 'Escape') setIsEditingName(false); }}
                    className="h-11 min-w-0 flex-1 rounded-[var(--radius-control)] border border-line bg-white/[0.03] px-3 text-white placeholder:text-white/40 focus:border-white/60 focus:outline-none focus:ring-4 focus:ring-white/10"
                  />
                  <Button variant="primary" disabled={isChangingName} onClick={submitRename}>
                    {isChangingName ? 'Saving…' : 'Save'}
                  </Button>
                  <Button variant="ghost" onClick={() => { setIsEditingName(false); setNameError(''); clearError(); }}>Cancel</Button>
                </div>
                {nameError && <p className="mt-2 text-sm text-rose-300" role="alert">{nameError}</p>}
              </div>
            )}
          </div>

          {/* Role switch */}
          <div className="mt-5 border-t border-line pt-5">
            <p className="mb-2 text-xs text-white/50">Play as</p>
            <div
              className="flex w-full overflow-visible rounded-xl border border-white/10 bg-white/[0.03] p-1"
              role="radiogroup"
              aria-label="Play as"
            >
              {(['player', 'spectator'] as const).map((role, index) => {
                const selected = (view?.role ?? 'player') === role;
                return (
                  <button
                    key={role}
                    ref={(element) => { roleRefs.current[index] = element; }}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => chooseRole(role)}
                    onKeyDown={onRoleKeyDown}
                    className={`min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold transition motion-safe:duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                      selected
                        ? 'bg-white/15 text-white'
                        : 'text-white/60 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {role === 'player' ? 'Player' : 'Spectator'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Non-host waiting indicator */}
          {isLobby && !isHost && (
            <p className="mt-5 flex items-center gap-2 border-t border-line pt-5 text-sm text-white/60" role="status">
              Waiting for host to start
              <SpinnerDots />
            </p>
          )}
        </Panel>

        {/* Host controls */}
        {isHost && isLobby && (
          <Panel padding="roomy" className="mt-4">
            <h2 className="mb-4 text-sm font-semibold text-white/70">Host controls</h2>

            <div className="mb-5">
              <label htmlFor="turn-timer" className="mb-2 block text-sm text-white/70">Turn timer</label>
              <div className="flex items-center gap-2">
                <input
                  id="turn-timer"
                  type="range"
                  min={15}
                  max={180}
                  step={5}
                  value={turnSeconds}
                  onChange={(event) => setSliderSeconds(Number(event.target.value))}
                  onPointerUp={commitTurnSeconds}
                  onKeyUp={(event) => {
                    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
                      commitTurnSeconds();
                    }
                  }}
                  onBlur={commitTurnSeconds}
                  className="h-11 min-w-0 flex-1 cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-white/15 [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-white/15 [&::-webkit-slider-thumb]:mt-[-6px] [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  value={timerText}
                  aria-label="Turn timer in seconds"
                  onChange={(event) => {
                    const digits = event.target.value.replace(/\D/g, '').slice(0, 3);
                    setTimerText(digits);
                    if (digits) {
                      const numeric = Number(digits);
                      setTurnSeconds(Math.min(180, Math.max(15, numeric)));
                    }
                  }}
                  onBlur={commitTurnSeconds}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitTurnSeconds();
                      event.currentTarget.blur();
                    }
                  }}
                  className="h-11 w-[4.5rem] shrink-0 rounded-[var(--radius-control)] border border-line bg-white/[0.03] px-2 text-center font-mono tabular-nums text-white focus:border-white/60 focus:outline-none focus:ring-4 focus:ring-white/10"
                />
                <span className="text-sm text-white/50">seconds</span>
              </div>
              <p className="mt-1 text-xs text-white/40">15–180 seconds · default 60</p>
              {timerError && <p className="mt-1 text-xs text-rose-300" data-testid="timer-error">{timerError}</p>}
            </div>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={players.length < 2 || players.length > MAX_STARTING_PLAYERS || status !== 'connected'}
              onClick={() => send({ t: 'start' })}
            >
              Start game
            </Button>
            {startDisabledReason && <p className="mt-2 text-center text-xs text-white/50">{startDisabledReason}</p>}
          </Panel>
        )}

        {/* Spectator rejoin (active game) */}
        {view?.role === 'spectator' && data.phase !== 'lobby' && (
          <Panel padding="roomy" className="mt-4">
            <p className="mb-1 font-medium">Need to rejoin a seat?</p>
            <p className="mb-3 text-sm text-muted">Enter the player’s name; the host must approve the request.</p>
            <Button variant="secondary" fullWidth onClick={requestRejoin}>Request rejoin</Button>
          </Panel>
        )}

        {/* Rejoin requests (host) */}
        {hostRejoinRequests.length > 0 && isHost && (
          <Panel padding="roomy" className="mt-4">
            <h2 className="mb-3 text-sm font-semibold text-white/70">Rejoin requests</h2>
            <ul className="space-y-2">
              {hostRejoinRequests.map((request) => (
                <li key={request.requestId} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-line p-3">
                  <span>{request.name} wants to rejoin.</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="primary" onClick={() => send({ t: 'rejoinDecision', requestId: request.requestId, accept: true })}>Approve</Button>
                    <Button size="sm" variant="ghost" onClick={() => send({ t: 'rejoinDecision', requestId: request.requestId, accept: false })}>Decline</Button>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {data.phase !== 'lobby' && (
          <p className="mt-5 text-center text-sm text-white/60" role="status">The game is starting…</p>
        )}

        {error && !isEditingName && <p className="mt-4 text-center text-sm text-rose-300" role="alert">{error}</p>}

        <div className="mt-6 flex justify-center">
          <Button variant="ghost" disabled={pending !== null} onClick={handleLeaveRoom}>
            {pending ? 'Leaving…' : 'Leave room'}
          </Button>
        </div>
      </div>
    </main>
  );
}

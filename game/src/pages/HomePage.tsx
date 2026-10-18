import { useEffect, useRef, useState } from 'react';
import TurnstileWidget from '../components/TurnstileWidget';
import Panel from '../components/ui/Panel';
import Button from '../components/ui/Button';
import { normalizeRoomCode, roomExists, ROOM_CODE_PATTERN } from '../logic/createRoom';

interface HomePageProps {
  onJoinRoom: (roomCode: string) => void;
  onCreateRoom: (name: string, turnstileToken: string, roomCode?: string) => Promise<{ roomCode: string; sessionId?: string }>;
  onRules: () => void;
  useTurnstile?: boolean;
}

const tiles = [
  { shape: 'circle', color: '#C06060' },
  { shape: 'triangle', color: '#008080' },
  { shape: 'square', color: '#C0C0FF' }
] as const;

export default function HomePage({ onJoinRoom, onCreateRoom, onRules, useTurnstile = false }: HomePageProps) {
  const [roomCode, setRoomCode] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('');
  const [turnstileError, setTurnstileError] = useState('');
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [missingCode, setMissingCode] = useState<string | null>(null);
  const roomInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!useTurnstile) return;
    // First try the proxied route
    void fetch('/api/config')
      .then(async (response) => {
        if (!response.ok) throw new Error('Room creation settings could not be loaded.');
        return response.json() as Promise<{ turnstileSiteKey?: string }>;
      })
      .then(({ turnstileSiteKey: siteKey }) => {
        if (siteKey) setTurnstileSiteKey(siteKey);
        else setTurnstileError('Room creation verification is not configured.');
      })
      .catch(() => {
        // Fallback to direct fetch using same origin
        void fetch(`${window.location.origin}/api/config`)
          .then(async (response) => {
            if (!response.ok) throw new Error('Direct room creation settings could not be loaded.');
            return response.json() as Promise<{ turnstileSiteKey?: string }>;
          })
          .then(({ turnstileSiteKey: siteKey }) => {
            if (siteKey) setTurnstileSiteKey(siteKey);
            else setTurnstileError('Room creation verification is not configured.');
          })
          .catch(() => setTurnstileError('Room creation verification is unavailable.'));
      });
  }, [useTurnstile]);

  const handleJoin = async () => {
    const normalizedCode = normalizeRoomCode(roomCode);
    if (!ROOM_CODE_PATTERN.test(normalizedCode)) {
      setMissingCode(null);
      setError('Enter a room code containing 4–6 letters or numbers.');
      return;
    }
    setIsChecking(true);
    setError('');
    setMissingCode(null);
    try {
      const exists = await roomExists(normalizedCode);
      if (exists) {
        onJoinRoom(normalizedCode);
        return;
      }
      setRoomCode(normalizedCode);
      setMissingCode(normalizedCode);
    } catch {
      setError('Could not reach the room service. Check your connection and try again.');
    } finally {
      setIsChecking(false);
    }
  };

  const handleChangeCode = () => {
    setMissingCode(null);
    setError('');
    setRoomCode('');
    roomInput.current?.focus();
  };

  const handleCreateWithCode = async () => {
    if (!missingCode) return;
    const storedName = sessionStorage.getItem('3eal-player-name') || 'Player 1';
    setIsCreating(true);
    setError('');
    try {
      if (turnstileSiteKey && !turnstileToken) throw new Error('Complete the verification before creating a room.');
      const created = await onCreateRoom(storedName, turnstileToken, missingCode);
      if (created.sessionId) sessionStorage.setItem(`3eal-session:${created.roomCode}`, created.sessionId);
      onJoinRoom(created.roomCode);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create a room.');
    } finally {
      setIsCreating(false);
      setTurnstileToken('');
      setTurnstileResetKey((key) => key + 1);
    }
  };

  const handleCreateRoom = async () => {
    setIsCreating(true);
    setError('');
    setMissingCode(null);
    try {
      const storedName = sessionStorage.getItem('3eal-player-name') || 'Player 1';
      if (turnstileSiteKey && !turnstileToken) throw new Error('Complete the verification before creating a room.');
      const created = await onCreateRoom(storedName, turnstileToken);
      if (created.sessionId) sessionStorage.setItem(`3eal-session:${created.roomCode}`, created.sessionId);
      onJoinRoom(created.roomCode);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create a room.');
    } finally {
      setIsCreating(false);
      setTurnstileToken('');
      setTurnstileResetKey((key) => key + 1);
    }
  };

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-black px-5 py-8 text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-20"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px)',
          backgroundSize: '52px 52px',
          maskImage: 'radial-gradient(ellipse at center, black 15%, transparent 76%)'
        }}
      />

      <div className="w-full max-w-md">
        <Panel padding="roomy" className="shadow-[0_32px_100px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          <header className="mb-7 text-center">
            <div className="mb-5 flex items-center justify-center gap-2.5" aria-hidden="true">
              {tiles.map((tile, index) => (
                <div
                  key={tile.shape}
                  className="flex h-12 w-10 items-center justify-center rounded-lg border border-white/20 shadow-lg transition-transform duration-300 hover:-translate-y-1 motion-safe:animate-float"
                  style={{ backgroundColor: tile.color, animationDelay: `${index * 0.6}s` }}
                >
                  {tile.shape === 'circle' && <span className="h-5 w-5 rounded-full bg-black" />}
                  {tile.shape === 'triangle' && <span className="h-0 w-0 border-x-[11px] border-b-[19px] border-x-transparent border-b-black" />}
                  {tile.shape === 'square' && <span className="h-5 w-5 bg-black" />}
                </div>
              ))}
            </div>
            <h1
              className="m-0 bg-gradient-to-b from-white via-white to-white/65 bg-clip-text font-black text-transparent"
              style={{ fontSize: 'clamp(4rem, 12vw, 5.5rem)', letterSpacing: '0.16em', lineHeight: 1 }}
            >
              3EAL
            </h1>
            <p className="mt-2 text-sm text-muted">Build three sets. First to nine wins.</p>
          </header>

          <div className="space-y-3" aria-label="Room actions">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold tracking-[0.14em] text-white/55">Room code</span>
              <input
                ref={roomInput}
                value={roomCode}
                onChange={(event) => {
                  setRoomCode(event.target.value.replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase());
                  if (missingCode) setMissingCode(null);
                }}
                onKeyDown={(event) => event.key === 'Enter' && void handleJoin()}
                autoComplete="off"
                aria-label="Room Code"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'home-error' : undefined}
                className="h-14 w-full rounded-[var(--radius-control)] border border-line bg-white/[0.02] px-4 text-center font-mono text-lg uppercase tabular-nums tracking-[0.3em] text-white outline-none transition duration-200 placeholder:tracking-[0.2em] placeholder:text-white/25 hover:border-white/30 focus:border-white/60 focus:bg-white/[0.05] focus:ring-4 focus:ring-white/10"
                placeholder="ENTER CODE"
              />
            </label>

            <Button variant="primary" size="lg" fullWidth disabled={isChecking} onClick={() => void handleJoin()}>
              {isChecking ? 'Checking…' : 'Join Room'}
            </Button>

            {missingCode && (
              <Panel
                padding="compact"
                role="alert"
                className="border-amber-300/40 bg-amber-300/[0.06]"
              >
                <p className="mb-2 text-center text-sm text-amber-100">
                  No room <span className="font-mono font-semibold tracking-widest">{missingCode}</span> exists yet.
                </p>
                <div className="space-y-2">
                  <Button variant="secondary" fullWidth disabled={isCreating} onClick={() => void handleCreateWithCode()}>
                    {isCreating ? 'Creating…' : 'Create room with this code'}
                  </Button>
                  <Button variant="ghost" fullWidth onClick={handleChangeCode}>
                    Change the code
                  </Button>
                </div>
              </Panel>
            )}

            <Button
              variant="secondary"
              size="lg"
              fullWidth
              disabled={isCreating || (useTurnstile && (!turnstileToken || !turnstileSiteKey))}
              onClick={() => void handleCreateRoom()}
            >
              {isCreating ? 'Creating Room…' : 'Create Room'}
            </Button>

            {useTurnstile && (
              <div className="space-y-1">
                {turnstileSiteKey && (
                  <TurnstileWidget siteKey={turnstileSiteKey} resetKey={turnstileResetKey} onToken={setTurnstileToken} />
                )}
                {turnstileError && <p className="text-center text-xs text-amber-200" role="status">{turnstileError}</p>}
              </div>
            )}

            <Button variant="ghost" fullWidth onClick={onRules}>
              Rules
            </Button>

            {error && <p id="home-error" className="pt-1 text-center text-sm text-rose-300" role="alert">{error}</p>}
          </div>
        </Panel>
      </div>
    </main>
  );
}

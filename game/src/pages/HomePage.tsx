import { useState } from 'react';

interface HomePageProps {
  onJoinRoom: (roomCode: string) => void;
  onCreateRoom: () => Promise<string>;
  onRules: () => void;
}

const tiles = [
  { shape: 'circle', color: '#C06060' },
  { shape: 'triangle', color: '#008080' },
  { shape: 'square', color: '#C0C0FF' }
] as const;

export default function HomePage({ onJoinRoom, onCreateRoom, onRules }: HomePageProps) {
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleJoin = () => {
    const normalizedCode = roomCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,6}$/.test(normalizedCode)) {
      setError('Enter a room code containing 4–6 letters or numbers.');
      return;
    }
    setError('');
    onJoinRoom(normalizedCode);
  };

  const handleCreateRoom = async () => {
    setIsCreating(true);
    setError('');
    try {
      onJoinRoom(await onCreateRoom());
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create a room.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#050607] px-5 py-8 text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-25"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.055) 1px, transparent 1px)',
          backgroundSize: '52px 52px',
          maskImage: 'radial-gradient(ellipse at center, black 15%, transparent 76%)'
        }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute -left-36 top-1/4 -z-10 h-80 w-80 rounded-full bg-teal-400/10 blur-[100px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-32 bottom-0 -z-10 h-96 w-96 rounded-full bg-violet-500/10 blur-[120px]" />

      <section className="w-full max-w-md">
        <div className="rounded-[2rem] border border-white/[0.12] bg-[#0c0f10]/90 p-6 shadow-[0_32px_100px_rgba(0,0,0,0.6)] backdrop-blur-xl sm:p-9">
          <header className="mb-6 text-center">
            <div className="mb-4 flex items-center justify-center gap-2.5" aria-hidden="true">
              {tiles.map((tile, index) => (
                <div
                  key={tile.shape}
                  className={`flex h-12 w-10 items-center justify-center rounded-lg border border-white/20 shadow-lg transition-transform duration-300 hover:-translate-y-1 ${index === 1 ? '-translate-y-2' : ''}`}
                  style={{ backgroundColor: tile.color }}
                >
                  {tile.shape === 'circle' && <span className="h-5 w-5 rounded-full bg-black" />}
                  {tile.shape === 'triangle' && <span className="h-0 w-0 border-x-[11px] border-b-[19px] border-x-transparent border-b-black" />}
                  {tile.shape === 'square' && <span className="h-5 w-5 bg-black" />}
                </div>
              ))}
            </div>
            <h1
              className="m-0 bg-gradient-to-b from-white via-white to-white/65 bg-clip-text font-black text-transparent drop-shadow-[0_0_28px_rgba(45,212,191,0.15)]"
              style={{ fontSize: 'clamp(4.5rem, 12vw, 6rem)', letterSpacing: '0.16em', lineHeight: 1 }}
            >
              3EAL
            </h1>
          </header>

          <div className="space-y-3.5" aria-label="Room actions">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/60">Room Code</span>
              <input
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value.replace(/[^a-z\d]/gi, '').slice(0, 6))}
                onKeyDown={(event) => event.key === 'Enter' && handleJoin()}
                autoComplete="off"
                aria-label="Room Code"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'home-error' : undefined}
                className="h-14 w-full rounded-xl border border-white/15 bg-black/40 px-4 text-center font-mono text-lg uppercase tracking-[0.3em] text-white outline-none transition duration-200 placeholder:tracking-[0.2em] placeholder:text-white/25 hover:border-white/30 focus:border-teal-300/70 focus:bg-black/60 focus:ring-4 focus:ring-teal-300/10"
                placeholder="ENTER CODE"
              />
            </label>

            <button
              type="button"
              onClick={handleJoin}
              className="group flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 font-bold text-black shadow-[0_8px_30px_rgba(255,255,255,0.08)] transition duration-200 hover:-translate-y-0.5 hover:bg-teal-100 hover:shadow-[0_12px_32px_rgba(45,212,191,0.18)] active:translate-y-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
            >
              Join Room
              <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1">→</span>
            </button>
            <button
              type="button"
              onClick={() => void handleCreateRoom()}
              disabled={isCreating}
              className="min-h-14 w-full rounded-xl border border-white/20 bg-white/[0.04] px-5 py-3 font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:border-teal-300/50 hover:bg-teal-300/[0.08] active:translate-y-0 disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
            >
              {isCreating ? 'Creating Room…' : 'Create Room'}
            </button>
            <button
              type="button"
              onClick={onRules}
              className="min-h-12 w-full rounded-xl px-5 py-2.5 text-sm font-medium text-white/55 transition duration-200 hover:bg-white/[0.05] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"
            >
              Rules
            </button>
            {error && <p id="home-error" className="pt-1 text-center text-sm text-rose-300" role="alert">{error}</p>}
          </div>
        </div>
      </section>
    </main>
  );
}

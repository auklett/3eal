import { useEffect, useRef, useState } from 'react';
import { CloseIcon } from '../icons/IconSprite';

interface YourTurnPopupProps {
  roomCode: string;
  playerId: string;
  turnNumber: number;
  isMyTurn: boolean;
  paused: boolean;
  interruptOpen: boolean;
}

const SHOW_MS = 5000;

/**
 * A five-second, non-modal confirmation of the viewer's own turn. It has no
 * animation; a pause freezes the remaining time, and an appeal prompt hides it
 * for the rest of that turn. `sessionStorage` keys the last shown turn per room
 * and player so a reconnect or reload never re-shows it.
 */
export default function YourTurnPopup({
  roomCode,
  playerId,
  turnNumber,
  isMyTurn,
  paused,
  interruptOpen
}: YourTurnPopupProps) {
  const [shown, setShown] = useState(false);
  const remainingRef = useRef(SHOW_MS);
  const deadlineRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | undefined>(undefined);
  const storageKey = `3eal-your-turn:${roomCode}:${playerId}`;

  const hide = () => {
    if (timeoutRef.current !== undefined) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = undefined;
    deadlineRef.current = null;
    setShown(false);
  };

  // Decide whether this turn has already shown the popup. An open appeal or a
  // pause consumes the turn: the player is already occupied elsewhere.
  useEffect(() => {
    if (!isMyTurn || !playerId) {
      hide();
      return;
    }
    if (interruptOpen) {
      sessionStorage.setItem(storageKey, String(turnNumber));
      hide();
      return;
    }
    if (sessionStorage.getItem(storageKey) === String(turnNumber)) return;
    if (paused) return;
    sessionStorage.setItem(storageKey, String(turnNumber));
    remainingRef.current = SHOW_MS;
    setShown(true);
  }, [isMyTurn, interruptOpen, paused, turnNumber, playerId, storageKey]);

  // Run (or freeze) the five-second clock.
  useEffect(() => {
    if (!shown) return;
    if (paused) {
      if (deadlineRef.current !== null) {
        remainingRef.current = Math.max(0, deadlineRef.current - Date.now());
        deadlineRef.current = null;
      }
      if (timeoutRef.current !== undefined) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
      return;
    }
    deadlineRef.current = Date.now() + remainingRef.current;
    timeoutRef.current = window.setTimeout(() => {
      deadlineRef.current = null;
      setShown(false);
    }, remainingRef.current);
    return () => {
      if (timeoutRef.current !== undefined) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    };
  }, [shown, paused, turnNumber]);

  useEffect(() => {
    if (!shown) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shown]);

  if (!shown) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(3.75rem+env(safe-area-inset-top))] z-30 px-3">
      <div
        className="pointer-events-auto relative mx-auto w-[300px] max-w-[calc(100%-24px)] rounded-2xl border-2 border-white bg-[#141414] p-4 text-center shadow-2xl shadow-black/60"
        data-testid="your-turn-popup"
      >
        <button
          type="button"
          aria-label="Dismiss"
          onClick={hide}
          className="absolute right-2 top-2 inline-flex h-11 w-11 items-center justify-center rounded-xl border-0 bg-transparent text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
        <div aria-hidden="true" className="mb-2 flex justify-center gap-1.5">
          <span className="h-[34px] w-6 rounded-[4px] bg-[#C06060]" />
          <span className="h-[34px] w-6 rounded-[4px] bg-[#008080]" />
          <span className="h-[34px] w-6 rounded-[4px] bg-[#C0C0FF]" />
        </div>
        <p className="text-[34px] font-medium leading-none text-white">Your turn</p>
      </div>
    </div>
  );
}

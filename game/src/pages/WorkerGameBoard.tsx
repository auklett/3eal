import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { COLOR_HEX, type Card as EngineCard } from '@3eal/engine';
import CardComponent from '../components/cards/CardComponent';
import type { CardSize } from '../components/cards/cardSize';
import { useRoom, type SendFeedback } from '../hooks/useRoom';
import { useDialog } from '../hooks/useDialog';
import { useIsCompact } from '../hooks/useIsCompact';
import { mergeTableLayout, moveOrSwap, placeInLayout, serverSlotForVisual, tableCardIds, type TableLayout } from '../logic/tableLayout';
import type { Card as UiCard } from '../types';
import type { PublicSlot, View } from '../shared/protocol';
import Panel from '../components/ui/Panel';
import Button from '../components/ui/Button';
import Chip from '../components/ui/Chip';
import Badge from '../components/ui/Badge';
import IconButton from '../components/ui/IconButton';
import ConnectionDot from '../components/ui/ConnectionDot';
import SpinnerDots from '../components/ui/SpinnerDots';
import RulesOverlay from '../components/game/RulesOverlay';
import NoticeStack from '../components/game/NoticeStack';
import { CloseIcon } from '../components/icons/IconSprite';

interface WorkerGameBoardProps {
  roomCode: string;
  onLeave: () => void;
  onReturnToLobby: () => void;
}

const DRAG_THRESHOLD = 6;
// The pending text describes work in flight; it must not claim the move happened.
const MOVE_FEEDBACK: SendFeedback = { pending: 'Submitting move…', confirmation: 'Move confirmed.' };

type DragMeta = { cardId: string; from: 'hand' | 'table'; originSlot: number | null };
type DragOver = { kind: 'table'; slot: number } | { kind: 'hand' } | null;

function toUiCard(card: EngineCard, revealed = false): UiCard {
  if (card.kind === 'normal') {
    return {
      id: card.id,
      category: 'NORMAL',
      isRevealed: revealed,
      color: COLOR_HEX[card.color],
      number: card.number,
      shape: card.shape
    };
  }
  if (card.kind === 'teal') {
    return {
      id: card.id,
      category: 'WILD',
      isRevealed: revealed,
      color: COLOR_HEX.teal,
      title: 'TEAL',
      description: 'Wild card'
    };
  }
  const actionDescriptions: Record<string, string> = {
    CONCEAL: 'Hide a revealed card',
    STEAL: 'Take a card from opponent',
    REVEAL: 'Expose a concealed card',
    APPEAL: 'Cancel an action card'
  };

  return {
    id: card.id,
    category: 'ACTION',
    isRevealed: false,
    actionType: card.action,
    title: card.action,
    description: actionDescriptions[card.action] ?? `${card.action} action`
  };
}

function publicCard(slot: PublicSlot, privateCards: Record<string, EngineCard>): UiCard | undefined {
  if (slot.state === 'revealed') return toUiCard(slot.card, true);
  const privateCard = privateCards[slot.cardId];
  return privateCard ? toUiCard(privateCard) : undefined;
}

function revealCardMap(view: View): Map<string, EngineCard> {
  const map = new Map<string, EngineCard>();
  const reveal = view.data.reveal;
  if (!reveal) return map;
  for (const player of Object.values(reveal.players)) {
    player.table.forEach((card) => map.set(card.id, card));
    player.hand.forEach((card) => map.set(card.id, card));
  }
  return map;
}

function activeId(view: View, roomCode: string): string {
  return view.role === 'player'
    ? view.data.you.id
    : sessionStorage.getItem(`3eal-session:${roomCode}`) ?? '';
}

function tableSlotSize(size: CardSize): string {
  if (size === 'xs') return 'min-h-[45px]';
  if (size === 'sm') return 'min-h-[90px]';
  return 'min-h-[112px]';
}

function emptySlotSize(size: CardSize): string {
  if (size === 'xs') return 'h-[45px] w-8';
  if (size === 'sm') return 'h-[90px] w-16';
  return 'h-28 w-20';
}

/** A 30-second countdown ring for the appeal window (mono seconds in the middle). */
function AppealRing({ seconds, paused }: { seconds: number | null; paused: boolean }) {
  const total = 30;
  const value = seconds === null ? total : Math.max(0, Math.min(total, seconds));
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / total);
  return (
    <span className="relative inline-flex h-16 w-16 items-center justify-center" role="img" aria-label={`${value} seconds remaining`}>
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="4" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke="#ffffff"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: paused ? 'none' : 'stroke-dashoffset 250ms linear' }}
        />
      </svg>
      <span className="absolute font-mono text-sm tabular-nums">{value}</span>
    </span>
  );
}

function PlayersGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 19a5.5 5.5 0 0 0-2-4.2" />
    </svg>
  );
}

function RulesGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z" />
      <path d="M4 5.5v15M8 7h8M8 10h6" />
    </svg>
  );
}

function LeaveGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M10 8l-4 4 4 4M6 12h10" />
    </svg>
  );
}

export default function WorkerGameBoard({ roomCode, onLeave, onReturnToLobby }: WorkerGameBoardProps) {
  const playerName = sessionStorage.getItem('3eal-player-name') ?? 'Player 1';
  const { view, status, error, send, pending, confirmation, left } = useRoom(roomCode, { name: playerName });
  const [selectedHandId, setSelectedHandId] = useState<string | null>(null);
  const [tableSelection, setTableSelection] = useState<number | null>(null);
  const [rejoinName, setRejoinName] = useState('');
  const [showPlayers, setShowPlayers] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [selectedOpponentId, setSelectedOpponentId] = useState<string | null>(null);
  const [handOpen, setHandOpen] = useState(true);
  const [hintDismissed, setHintDismissed] = useState(() => localStorage.getItem('3eal-table-hint-dismissed') === 'true');
  const [announcement, setAnnouncement] = useState('');
  const [now, setNow] = useState(Date.now());
  const [resultNotice, setResultNotice] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragMeta & { x: number; y: number } | null>(null);
  const [dragOver, setDragOver] = useState<DragOver>(null);
  const [pendingMoveKind, setPendingMoveKind] = useState<'place' | 'toHand' | null>(null);
  const compact = useIsCompact();

  const layoutRef = useRef<TableLayout>([]);
  const pendingPlacement = useRef<{ cardId: string; slot: number } | null>(null);
  const dragMeta = useRef<DragMeta | null>(null);
  const pointerStart = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const suppressClick = useRef(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  const opponentDialogRef = useRef<HTMLElement | null>(null);
  const gameOverHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const announcedKey = useRef<string | null>(null);
  const finishedHandled = useRef(false);
  const resultSeenKey = useRef<string | null>(null);
  const resultTurn = useRef<number | null>(null);
  const rejoinCount = useRef(0);

  const closePlayers = useMemo(() => () => setShowPlayers(false), []);
  const closeOpponent = useMemo(() => () => setSelectedOpponentId(null), []);
  useDialog(dialogRef, closePlayers, showPlayers);
  useDialog(opponentDialogRef, closeOpponent, Boolean(selectedOpponentId));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  // Only the click replayed by the drag gesture itself is suppressed (see
  // `finish`). Starting any new gesture re-enables clicks, so a real tap right
  // after a drag is never swallowed.
  useEffect(() => {
    const enableClicks = () => { suppressClick.current = false; };
    window.addEventListener('pointerdown', enableClicks, true);
    return () => window.removeEventListener('pointerdown', enableClicks, true);
  }, []);

  useEffect(() => {
    if (view?.data.phase === 'lobby') onReturnToLobby();
  }, [view?.data.phase, onReturnToLobby]);

  useEffect(() => {
    if (left) onLeave();
  }, [left, onLeave]);

  // Keep the roster overlay host-only even if ownership transfers mid-session.
  useEffect(() => {
    if (!view) return;
    if (activeId(view, roomCode) !== view.data.hostId) setShowPlayers(false);
  }, [view, roomCode]);

  const finishedWinnerName = view?.data.winnerId
    ? view.data.players.find((player) => player.id === view.data.winnerId)?.name
    : undefined;
  const lastResult = view?.data.lastInterruptResult;
  const resultKey = lastResult
    ? `${lastResult.kind}|${lastResult.outcome}|${lastResult.resolvedAt}`
    : null;
  const resultText = lastResult
    ? `${lastResult.kind} ${lastResult.outcome === 'appealed' ? 'was appealed' : lastResult.outcome === 'expired' ? 'expired' : 'resolved'}.`
    : null;

  // Game Over moves to the top of the board when the phase flips. Scroll there,
  // focus its heading, and announce the result exactly once per finished phase.
  useEffect(() => {
    if (!view) return;
    if (view.data.phase !== 'finished') {
      finishedHandled.current = false;
      return;
    }
    if (finishedHandled.current) return;
    finishedHandled.current = true;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    setAnnouncement(`Game over, ${finishedWinnerName ?? 'a player'} wins`);
    window.requestAnimationFrame(() => gameOverHeadingRef.current?.focus({ preventScroll: true }));
  }, [view, finishedWinnerName]);

  // The result notice is keyed on the server's resolvedAt so the same snapshot
  // never re-shows it, survives a reconnect, and clears on the turn transition.
  useEffect(() => {
    if (!resultKey || !resultText) {
      setResultNotice(null);
      return;
    }
    if (resultSeenKey.current === resultKey) return;
    const storageKey = `3eal-result-seen:${roomCode}`;
    if (sessionStorage.getItem(storageKey) === resultKey) {
      resultSeenKey.current = resultKey;
      return;
    }
    resultSeenKey.current = resultKey;
    resultTurn.current = view?.data.turnNumber ?? 0;
    sessionStorage.setItem(storageKey, resultKey);
    setResultNotice(resultText);
    const timer = window.setTimeout(() => setResultNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [resultKey, resultText, roomCode, view?.data.turnNumber]);

  useEffect(() => {
    const turn = view?.data.turnNumber;
    if (turn === undefined) return;
    if (resultTurn.current !== null && resultTurn.current !== turn) {
      setResultNotice(null);
      resultTurn.current = null;
    }
  }, [view?.data.turnNumber]);

  const visibleRejoinRequests = view?.role === 'player' ? view.data.you.rejoinRequests : [];
  useEffect(() => {
    const count = visibleRejoinRequests.length;
    if (count > rejoinCount.current) {
      setAnnouncement(count === 1 ? 'A player wants to rejoin.' : `${count} players want to rejoin.`);
    }
    rejoinCount.current = count;
  }, [visibleRejoinRequests.length]);

  // Keep the in-flight move's button mounted but disabled until the server
  // answers, so a second click cannot send a duplicate.
  useEffect(() => {
    if (pending === null) setPendingMoveKind(null);
  }, [pending]);

  // One-shot polite announcements for screen readers. Declared before the
  // early return so hook order never changes.
  useEffect(() => {
    const data = view?.data;
    if (!data) return;
    const selfIdForAnnounce = view ? activeId(view, roomCode) : '';
    const myTurn = data.phase === 'playing' && data.activePlayerId === selfIdForAnnounce;
    const intr = data.interrupt;
    const key = `${data.phase}|${data.activePlayerId ?? ''}|${data.paused}|${intr?.id ?? ''}`;
    if (announcedKey.current === null) {
      announcedKey.current = key;
      return;
    }
    if (announcedKey.current === key) return;
    announcedKey.current = key;
    const active = data.players.find((player) => player.id === data.activePlayerId);
    if (data.phase === 'finished') {
      const finishedWinner = data.winnerId
        ? data.players.find((player) => player.id === data.winnerId)?.name
        : undefined;
      setAnnouncement(`Game over, ${finishedWinner ?? 'a player'} wins`);
    } else if (data.paused) setAnnouncement('Game paused by host');
    else if (intr) setAnnouncement(`Interrupt open: ${intr.kind}`);
    else if (myTurn) setAnnouncement('Your turn');
    else if (active) setAnnouncement(`${active.name}'s turn`);
  }, [view, roomCode]);

  useEffect(() => {
    if (error) setAnnouncement(error);
  }, [error]);

  if (!view) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black p-6 text-center text-white">
        <Panel padding="roomy" className="w-full max-w-md">
          <p className="mb-2 flex items-center justify-center gap-2" role={error ? 'alert' : 'status'}>
            {status === 'reconnecting' && <SpinnerDots className="text-white/60" />}
            {error || (status === 'awaitingApproval' ? 'Waiting for host approval…' : status === 'reconnecting' ? 'Reconnecting…' : 'Connecting to the game…')}
          </p>
          {status === 'awaitingApproval' && <p className="text-sm text-muted">The host has up to 60 seconds to approve this seat.</p>}
          {error && <Button variant="ghost" fullWidth className="mt-4" onClick={onLeave}>Return Home</Button>}
        </Panel>
      </main>
    );
  }

  const data = view.data;
  const selfId = activeId(view, roomCode);
  const self = data.players.find((player) => player.id === selfId);
  const ownView = view.role === 'player' ? view.data : null;
  const hand = ownView?.you.hand ?? [];
  const ownPrivate = ownView?.you.concealedOwn ?? {};
  const selectedHand = hand.find((card) => card.id === selectedHandId);
  const isMyTurn = Boolean(self && data.activePlayerId === self.id && data.phase === 'playing');
  const actionReady = isMyTurn && !data.interrupt && !data.paused && view.role === 'player';
  // A Hand <-> Table move is in flight; block sending a duplicate until the
  // server answers. Local rearrangement is unaffected.
  const movePending = pending !== null;
  const canPlaceSelected = Boolean(self && selectedHand && (selectedHand.kind === 'normal' || selectedHand.kind === 'teal') && self.table.length < 9);
  const canMoveSelectedToHand = Boolean(self && tableSelection !== null && !selectedHand);
  // Stay visible (disabled) while their move is in flight, then re-enable or hide.
  const showPlaceButton = actionReady && (canPlaceSelected || (movePending && pendingMoveKind === 'place'));
  const showToHandButton = actionReady && (canMoveSelectedToHand || (movePending && pendingMoveKind === 'toHand'));
  const isHost = selfId === data.hostId;
  const targetForAction = selectedHand?.kind === 'action' && selectedHand.action !== 'APPEAL'
    ? selectedHand.action
    : null;
  const interrupt = data.interrupt;
  const isEligible = Boolean(interrupt && self && (
    interrupt.kind === 'CONCEAL'
      ? self.id !== interrupt.actorId
      : self.id === interrupt.targetId
  ));
  const appealCard = hand.find((card) => card.kind === 'action' && card.action === 'APPEAL');

  // Local, presentation-only Table order. Merged from every snapshot keyed by
  // card ID so it is never reset by an incoming server update.
  const ownServerIds = self ? tableCardIds(self.table) : [];
  const layout = mergeTableLayout(layoutRef.current, ownServerIds, pendingPlacement.current);
  layoutRef.current = layout;
  if (pendingPlacement.current && layout.includes(pendingPlacement.current.cardId)) {
    pendingPlacement.current = null;
  }

  const frozenTurnSeconds = data.paused && data.pauseRemaining && data.pauseRemaining.turn !== null
    ? Math.max(0, Math.ceil(data.pauseRemaining.turn / 1000))
    : null;
  const frozenInterruptSeconds = data.paused && data.pauseRemaining && data.pauseRemaining.interrupt !== null
    ? Math.max(0, Math.ceil(data.pauseRemaining.interrupt / 1000))
    : null;

  const turnSeconds = data.phase === 'finished'
    ? null
    : data.paused
      ? frozenTurnSeconds
      : data.turnEndsAt !== null
        ? Math.max(0, Math.ceil((data.turnEndsAt - now) / 1000))
        : data.turnRemainingMs === null
          ? null
          : Math.ceil(data.turnRemainingMs / 1000);

  const interruptSeconds = interrupt
    ? data.paused
      ? frozenInterruptSeconds
      : Math.max(0, Math.ceil(((interrupt.endsAt ?? now) - now) / 1000))
    : null;

  const turnPct = turnSeconds === null ? 0 : Math.max(0, Math.min(100, (turnSeconds / data.turnDurationSeconds) * 100));
  const urgentTimer = !data.paused && !interrupt && turnSeconds !== null && turnSeconds <= 10;

  const activePlayer = data.players.find((player) => player.id === data.activePlayerId);
  const duplicateActiveName = Boolean(activePlayer && data.players.filter((player) => player.name === activePlayer.name).length > 1);
  const turnText = data.phase === 'finished'
    ? 'Game over'
    : data.paused
      ? 'Game paused by host'
      : !data.activePlayerId
        ? 'Waiting for a player to reconnect'
        : isMyTurn
          ? 'Your turn'
          : activePlayer
            ? duplicateActiveName
              ? `${activePlayer.name}'s turn · another player with that name`
              : `${activePlayer.name}'s turn`
            : 'Waiting for a player to reconnect';
  const phaseLabel = data.phase === 'finished'
    ? 'Finished'
    : data.paused
      ? 'Paused'
      : interrupt
        ? 'Interrupt'
        : 'Main';

  const cardById = (id: string): EngineCard | undefined => {
    const fromHand = hand.find((card) => card.id === id);
    if (fromHand) return fromHand;
    if (!self) return undefined;
    for (const slot of self.table) {
      if (slot.state === 'revealed') {
        if (slot.card.id === id) return slot.card;
      } else if (slot.cardId === id) {
        return ownPrivate[id];
      }
    }
    return undefined;
  };

  /** Sends a Hand-to-Table placement and mirrors it into the local layout. */
  const placeSelectedHandAt = (cardId: string, visualSlot: number) => {
    if (!self || movePending) return;
    const full = self.table.length >= 9;
    const serverSlot = serverSlotForVisual(layoutRef.current, ownServerIds, visualSlot, full);
    pendingPlacement.current = { cardId, slot: visualSlot };
    layoutRef.current = placeInLayout(layoutRef.current, visualSlot, cardId, full);
    send({ t: 'place', cardId, slot: serverSlot }, MOVE_FEEDBACK);
    setPendingMoveKind('place');
    setSelectedHandId(null);
    setTableSelection(null);
  };

  /** Places the selected Hand card in the first free Table slot. */
  const moveSelectedHandToTable = () => {
    if (!self || movePending || !selectedHand) return;
    if (selectedHand.kind !== 'normal' && selectedHand.kind !== 'teal') return;
    const empty = layoutRef.current.indexOf(null);
    const slot = empty === -1 ? layoutRef.current.length : empty;
    placeSelectedHandAt(selectedHand.id, slot);
  };

  const consumeClickSuppression = () => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  };

  const handleSlotClick = (playerId: string, slotIndex: number, slot: PublicSlot | undefined) => {
    if (consumeClickSuppression()) return;
    if (view.role !== 'player' || !self) return;
    // Server-bound action targeting. Only a valid target is consumed; anything
    // else falls through to local rearrangement below.
    if (targetForAction && actionReady) {
      const eligibleTarget = targetForAction === 'CONCEAL'
        ? playerId === self.id && slot?.state === 'revealed'
        : playerId !== self.id && Boolean(slot);
      const correctRevealTarget = targetForAction !== 'REVEAL' || slot?.state === 'concealed';
      if (eligibleTarget && correctRevealTarget && selectedHand) {
        send({
          t: 'action',
          cardId: selectedHand.id,
          kind: targetForAction,
          targetId: playerId,
          slot: slotIndex
        });
        setSelectedHandId(null);
        setTableSelection(null);
        return;
      }
    }
    if (playerId !== self.id) return;
    // Server-bound Hand -> Table placement.
    if (actionReady && !movePending && selectedHand && (selectedHand.kind === 'normal' || selectedHand.kind === 'teal')) {
      placeSelectedHandAt(selectedHand.id, slotIndex);
      return;
    }
    // Local rearrangement: always available to the owner, in every turn, phase,
    // targeting flow, and while paused. It never contacts the server.
    const cardId = layoutRef.current[slotIndex] ?? null;
    if (tableSelection === null) {
      if (cardId) setTableSelection(slotIndex);
      return;
    }
    if (tableSelection === slotIndex) {
      setTableSelection(null);
      return;
    }
    layoutRef.current = moveOrSwap(layoutRef.current, tableSelection, slotIndex);
    setTableSelection(null);
  };

  const resolveDropTarget = (x: number, y: number): DragOver => {
    const element = document.elementFromPoint(x, y) as HTMLElement | null;
    const slotElement = element?.closest<HTMLElement>('[data-table-slot]');
    if (slotElement) {
      const owner = slotElement.dataset['tableOwner'];
      const slot = Number(slotElement.dataset['tableSlot']);
      if (owner === selfId && Number.isInteger(slot)) return { kind: 'table', slot };
      return null;
    }
    if (element?.closest('[data-hand-drop]')) return { kind: 'hand' };
    return null;
  };

  /**
   * Starts a pointer drag. Listeners live on `window` (rather than relying on
   * pointer capture) so the gesture keeps working when the pointer moves across
   * elements and on touch devices.
   */
  const beginPointer = (event: ReactPointerEvent, cardId: string, from: 'hand' | 'table', originSlot: number | null) => {
    if (event.button !== 0) return;
    if (from === 'hand' && (!actionReady || movePending)) return;
    const start = { x: event.clientX, y: event.clientY, dragging: false };
    dragMeta.current = { cardId, from, originSlot };
    pointerStart.current = start;

    const onMove = (moveEvent: PointerEvent) => {
      const meta = dragMeta.current;
      if (!meta) return;
      if (!start.dragging) {
        if (Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y) < DRAG_THRESHOLD) return;
        start.dragging = true;
      }
      setDrag({ ...meta, x: moveEvent.clientX, y: moveEvent.clientY });
      setDragOver(resolveDropTarget(moveEvent.clientX, moveEvent.clientY));
    };

    const finish = (pointerEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      const meta = dragMeta.current;
      dragMeta.current = null;
      pointerStart.current = null;
      if (meta && start.dragging) {
        // The browser replays a click for this gesture; ignore just that one.
        suppressClick.current = true;
        performDrop(meta, resolveDropTarget(pointerEvent.clientX, pointerEvent.clientY));
      }
      setDrag(null);
      setDragOver(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  const performDrop = (meta: DragMeta, target: DragOver) => {
    if (!target || !self || movePending) return;
    if (meta.from === 'table') {
      if (target.kind === 'table' && meta.originSlot !== null) {
        layoutRef.current = moveOrSwap(layoutRef.current, meta.originSlot, target.slot);
        setTableSelection(null);
      } else if (target.kind === 'hand' && actionReady) {
        const index = ownServerIds.indexOf(meta.cardId);
        if (index !== -1) send({ t: 'toHand', slot: index }, MOVE_FEEDBACK);
      }
      return;
    }
    if (target.kind === 'table' && actionReady) placeSelectedHandAt(meta.cardId, target.slot);
  };

  const moveSelectedTableCardToHand = () => {
    if (tableSelection === null || !actionReady || movePending) return;
    const id = layoutRef.current[tableSelection];
    const index = id ? ownServerIds.indexOf(id) : -1;
    if (index === -1) return;
    send({ t: 'toHand', slot: index }, MOVE_FEEDBACK);
    setPendingMoveKind('toHand');
    setSelectedHandId(null);
    setTableSelection(null);
  };

  const requestRejoin = () => {
    const name = rejoinName.trim();
    if (!name || name.length > 24) return;
    sessionStorage.setItem('3eal-player-name', name);
    sessionStorage.removeItem(`3eal-session:${roomCode}`);
    window.location.reload();
  };

  const dismissHint = () => {
    localStorage.setItem('3eal-table-hint-dismissed', 'true');
    setHintDismissed(true);
  };

  const renderTable = (playerId: string, slots: PublicSlot[], size: CardSize = 'md') => {
    const isOwn = playerId === selfId;
    const isPlayer = view.role === 'player';
    // The owner may always rearrange locally; only spectators are inert.
    const rearrangeReady = isOwn && isPlayer && Boolean(self);
    const table = data.players.find((player) => player.id === playerId);
    const privateCards = isOwn ? ownPrivate : {};
    const ownSlotById = new Map<string, PublicSlot>();
    if (isOwn) {
      for (const slot of slots) ownSlotById.set(slot.state === 'revealed' ? slot.card.id : slot.cardId, slot);
    }
    const size9 = isOwn ? Math.max(layout.length, slots.length, 9) : Math.max(9, slots.length);
    const gap = size === 'xs' ? 'gap-1' : 'gap-2';
    return (
      <div className={`grid w-fit grid-cols-3 ${gap}`}>
        {Array.from({ length: size9 }, (_, index) => {
          const slotId = isOwn ? layout[index] ?? null : null;
          const slot = isOwn
            ? (slotId ? ownSlotById.get(slotId) : undefined)
            : slots[index];
          const face = slot ? publicCard(slot, privateCards) : undefined;
          const cardId = isOwn ? slotId : (slot ? (slot.state === 'revealed' ? slot.card.id : slot.cardId) : null);
          const isOwnSelected = isOwn && tableSelection === index;
          const isDropTarget = isOwn && dragOver?.kind === 'table' && dragOver.slot === index;
          const isDraggingSource = isOwn && drag?.from === 'table' && drag.originSlot === index;
          const canTarget = Boolean(targetForAction && slot && (
            targetForAction === 'CONCEAL'
              ? playerId === selfId && slot.state === 'revealed'
              : playerId !== selfId && (targetForAction !== 'REVEAL' || slot.state === 'concealed')
          ));
          // Only a spectator is ever disabled. Every Table card and empty slot
          // stays interactive for local rearrangement: any turn, any phase,
          // during targeting, and while paused.
          const selectable = canTarget || rearrangeReady;
          const disabled = !isPlayer;
          const baseLabel = face
            ? `${table?.name ?? 'Player'} Table card${slot?.state === 'revealed' ? ', revealed' : ', concealed'}`
            : 'Empty Table slot';
          return slot ? (
            <button
              key={`${playerId}:${index}`}
              type="button"
              data-table-slot={index}
              data-table-owner={playerId}
              data-card-id={cardId ?? ''}
              disabled={disabled}
              aria-label={baseLabel}
              onClick={() => handleSlotClick(playerId, index, slot)}
              onPointerDown={rearrangeReady ? (event) => beginPointer(event, cardId ?? '', 'table', index) : undefined}
              className={`${tableSlotSize(size)} touch-none rounded-[var(--radius-control)] transition ${canTarget ? 'ring-2 ring-amber-300' : ''} ${isDropTarget ? 'ring-2 ring-teal-300' : ''} ${isDraggingSource ? 'opacity-40' : ''}`}
            >
              <CardComponent
                card={face ?? {
                  id: 'concealed',
                  category: 'NORMAL',
                  isRevealed: false,
                  color: COLOR_HEX.teal,
                  number: 1,
                  shape: 'circle'
                }}
                size={size}
                faceDown={!face}
                isSelected={isOwnSelected}
                isSelectable={selectable}
                showRevealBadge={data.phase !== 'finished'}
              />
            </button>
          ) : (
            <button
              key={`${playerId}:empty:${index}`}
              type="button"
              data-table-slot={index}
              data-table-owner={playerId}
              data-card-id=""
              disabled={disabled}
              aria-label="Empty Table slot"
              onClick={() => handleSlotClick(playerId, index, undefined)}
              className={`group ${emptySlotSize(size)} touch-none rounded-[var(--radius-control)] border border-dashed border-white/20 transition disabled:cursor-default hover:border-white/40 ${isDropTarget ? 'border-2 border-teal-300' : ''}`}
            >
              {size !== 'xs' && <span aria-hidden="true" className="text-lg text-white/0 transition group-hover:text-white/30">+</span>}
            </button>
          );
        })}
      </div>
    );
  };

  const winner = data.winnerId ? data.players.find((player) => player.id === data.winnerId) : undefined;
  const winnerSets = data.winningSets && data.reveal ? (() => {
    const byId = revealCardMap(view);
    return data.winningSets.map((group) => group.map((id) => byId.get(id)).filter((card): card is EngineCard => Boolean(card)));
  })() : null;

  const opponents = data.players.filter((player) => player.id !== selfId);
  // REVEAL needs at least one concealed card on an opponent's Table. Starting
  // cards are dealt revealed, so this is false until something is concealed.
  const revealHasTarget = opponents.some((player) => player.table.some((slot) => slot.state === 'concealed'));
  const selectedOpponent = selectedOpponentId ? data.players.find((player) => player.id === selectedOpponentId) : undefined;
  const handNormals = hand.filter((card) => card.kind !== 'action');
  const handActions = hand.filter((card) => card.kind === 'action');
  const showAppealSheet = Boolean(view.role === 'player' && isEligible && appealCard && interrupt);
  const actionBusy = pending !== null;

  const handleReturnToLobby = () => {
    if (actionBusy) return;
    send({ t: 'returnToLobby' }, { pending: 'Returning to the lobby…', confirmation: 'Lobby ready.' });
  };

  const handleLeaveLobby = () => {
    if (actionBusy) return;
    send({ t: 'leaveRoom' }, { pending: 'Leaving the lobby…', confirmation: 'You left the lobby.' });
  };

  return (
    <main className="relative min-h-screen bg-black text-white">
      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>

      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-black/85 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2 sm:px-6">
          <span className="text-lg font-black tracking-[0.16em]">3EAL</span>
          <Chip title="Room code">{roomCode}</Chip>
          <ConnectionDot connected={status === 'connected'} />
          {status !== 'connected' && <span className="hidden text-xs text-amber-200 sm:inline">Reconnecting…</span>}
          <div className="ml-auto flex items-center gap-1.5">
            {isHost && (
              <Button
                size="sm"
                variant="ghost"
                icon={<PlayersGlyph />}
                aria-label="Players"
                onClick={() => setShowPlayers(true)}
              >
                <span className="hidden sm:inline">Players</span>
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              icon={<RulesGlyph />}
              aria-label="Rules"
              onClick={() => setShowRules(true)}
            >
              <span className="hidden sm:inline">Rules</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<LeaveGlyph />}
              aria-label="Leave"
              onClick={onLeave}
            >
              <span className="hidden sm:inline">Leave</span>
            </Button>
          </div>
        </div>
      </header>

      <NoticeStack>
        {showAppealSheet && interrupt && appealCard && (
          <Panel padding="compact" className="bg-black/95 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="shrink-0">
                <CardComponent card={toUiCard(appealCard)} size="xs" showRevealBadge={false} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Play APPEAL?</p>
                <p className="mt-0.5 text-xs text-white/60">
                  {interrupt.kind} · APPEAL cancels it. {data.paused ? 'Paused — frozen.' : '30 seconds max.'}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <AppealRing seconds={interruptSeconds} paused={data.paused} />
                  <span className="text-[11px] text-white/50">{data.paused ? 'frozen' : 'seconds to decide'}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <Button
                  variant="primary"
                  size="sm"
                  className="min-w-24"
                  disabled={data.paused}
                  onClick={() => send({ t: 'appeal', cardId: appealCard.id })}
                >
                  {data.paused ? 'APPEAL (Paused)' : 'APPEAL'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-w-24"
                  disabled={data.paused}
                  onClick={() => send({ t: 'pass' })}
                >
                  {data.paused ? 'Pass (Paused)' : 'Pass'}
                </Button>
              </div>
            </div>
          </Panel>
        )}

        {isHost && visibleRejoinRequests.map((request) => (
          <Panel key={request.requestId} padding="compact" className="bg-black/95 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm">{request.name} wants to rejoin.</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => send({ t: 'rejoinDecision', requestId: request.requestId, accept: true })}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => send({ t: 'rejoinDecision', requestId: request.requestId, accept: false })}
                >
                  Decline
                </Button>
              </div>
            </div>
          </Panel>
        ))}

        {interrupt && !showAppealSheet && (
          <Panel padding="compact" className="bg-black/95 shadow-2xl">
            <p className="flex items-center justify-center gap-2 text-sm text-white/70" role="status">
              {view.role === 'player' && isEligible && !appealCard
                ? 'No APPEAL in Hand · passing automatically'
                : `Waiting on a decision…${data.paused ? ' (paused)' : ''}`}
              <SpinnerDots className="text-white/40" />
            </p>
          </Panel>
        )}
      </NoticeStack>

      <div className="mx-auto max-w-6xl px-3 pb-72 pt-3 sm:px-6 md:pb-8">
        {/* Game Over is the first board element, directly under the top bar. */}
        {data.phase === 'finished' && (
          <Panel padding="roomy" className="relative mb-3 overflow-hidden text-center" aria-labelledby="game-over-title">
            <h2 id="game-over-title" ref={gameOverHeadingRef} tabIndex={-1} className="text-2xl font-semibold outline-none">
              Game over
            </h2>
            <p className="my-2 text-lg">{winner?.name ?? 'A player'} wins</p>

            <div className="mt-4">
              <h3 className="mb-3 text-sm font-semibold text-white/70">Winning sets</h3>
              {winnerSets && (
                <div className="mb-4 grid gap-4 md:grid-cols-3">
                  {winnerSets.map((group, setIndex) => (
                    <div key={`set-${setIndex}`} className="rounded-[var(--radius-control)] border border-line bg-white/[0.03] p-3">
                      <p className="mb-2 text-xs tracking-[0.12em] text-white/50">Set {setIndex + 1}</p>
                      <div className="flex items-center justify-center gap-2">
                        {group.map((card, cardIndex) => (
                          <span key={`${card.id}-${cardIndex}`} className="inline-flex motion-safe:animate-pop-in">
                            <CardComponent
                              card={toUiCard(card, true)}
                              size={group.length > 3 ? 'sm' : 'md'}
                              showRevealBadge={false}
                            />
                          </span>
                        ))}
                        {group.length === 0 && <span className="py-6 text-sm text-white/40">—</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-sm text-white/60">Each group shows a set of 3 matching cards (by color, number, or shape).</p>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {isHost ? (
                <Button variant="primary" disabled={actionBusy} onClick={handleReturnToLobby}>
                  Return to Lobby
                </Button>
              ) : (
                <p className="flex items-center gap-2 text-sm text-white/60" role="status">
                  Waiting for the host to return to the lobby
                  <SpinnerDots className="text-white/40" />
                </p>
              )}
              <Button variant="secondary" disabled={actionBusy} onClick={handleLeaveLobby}>
                Leave Lobby
              </Button>
            </div>
            {pending && <p className="mt-3 text-xs text-amber-100">{pending}</p>}
          </Panel>
        )}

        {/* Turn banner */}
        <Panel
          padding="compact"
          className={`relative mb-3 ${isMyTurn ? 'ring-1 ring-white/25' : ''}`}
          aria-label="Turn status"
        >
          {isMyTurn && !data.paused && (
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[var(--radius-panel)] ring-1 ring-white/25 motion-safe:animate-pulse-soft" />
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Badge tone={data.paused ? 'warn' : isMyTurn ? 'accent' : 'neutral'}>{phaseLabel}</Badge>
            <p key={`turn-${data.activePlayerId ?? 'none'}-${data.paused}-${data.phase}`} className="font-semibold motion-safe:animate-fade-in" aria-live="polite">{turnText}</p>
            {resultNotice && (
              <span className="text-sm text-amber-100 motion-safe:animate-fade-in" role="status">
                {resultNotice}
              </span>
            )}

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {data.phase !== 'finished' && (interrupt ? (
                <>
                  <Chip className="text-amber-100" title="Turn timer paused during an interrupt">Turn paused</Chip>
                  <span className="flex items-center gap-1.5 text-xs text-amber-100">
                    <span className="font-mono text-sm tabular-nums" data-testid="appeal-timer">{interruptSeconds ?? 0}s</span>
                    <span className="text-white/50">appeal</span>
                  </span>
                </>
              ) : (
                <span className="flex items-center gap-2">
                  <span
                    className={`hidden h-1 w-20 overflow-hidden rounded-full bg-white/15 sm:inline-block ${urgentTimer ? 'motion-safe:animate-pulse-soft' : ''}`}
                    aria-hidden="true"
                  >
                    <span className="block h-full bg-white transition-[width] duration-300" style={{ width: `${turnPct}%` }} />
                  </span>
                  <span className="font-mono text-sm tabular-nums" data-testid="turn-timer">
                    {data.paused
                      ? frozenTurnSeconds === null ? 'frozen' : `${frozenTurnSeconds}s frozen`
                      : turnSeconds === null ? '--' : `${turnSeconds}s`}
                  </span>
                </span>
              ))}
              <Chip>Deck {data.deckCount}</Chip>
              {isHost && data.phase === 'playing' && !data.paused && (
                <Button size="sm" variant="secondary" onClick={() => send({ t: 'pause' })}>Pause</Button>
              )}
              {isHost && data.paused && (
                <Button size="sm" variant="primary" onClick={() => send({ t: 'resume' })}>Resume</Button>
              )}
            </div>
          </div>
        </Panel>

        {/* Errors must be the single role=alert on the board. */}
        {error && <p className="mb-3 text-center text-sm text-rose-300" role="alert">{error}</p>}

        {/* Action targeting step indicator (non-blocking: the board stays live). */}
        {targetForAction && (
          <Panel
            padding="compact"
            className={`mb-3 flex flex-wrap items-center justify-between gap-3 ${targetForAction === 'REVEAL' && !revealHasTarget ? 'border-amber-300/40' : 'border-white/25'}`}
          >
            <div>
              <p className="text-xs tracking-[0.12em] text-white/50">1 Choose player → 2 Choose card</p>
              {targetForAction === 'REVEAL' && !revealHasTarget ? (
                <p className="text-sm text-amber-100">No concealed cards to reveal yet. Nothing is face-down on any opponent's Table.</p>
              ) : (
                <p className="text-sm text-amber-100">
                  {targetForAction === 'CONCEAL'
                    ? 'Choose one of your revealed cards.'
                    : `Choose a card on an opponent's Table${targetForAction === 'REVEAL' ? ' that is concealed' : ''}.`}
                </p>
              )}
            </div>
            <Button size="sm" variant="secondary" onClick={() => { setSelectedHandId(null); setTableSelection(null); }}>Cancel</Button>
          </Panel>
        )}

        {/* Opponents rail */}
        {opponents.length > 0 && (
          <section aria-label="Other players" className="mb-4">
            <div className="flex gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-3 md:overflow-visible lg:grid-cols-4">
              {opponents.map((player) => {
                const isActive = player.id === data.activePlayerId;
                return (
                  <Panel
                    key={player.id}
                    padding="compact"
                    className={`relative min-w-[168px] shrink-0 ${isActive ? 'ring-1 ring-white/30' : ''}`}
                  >
                    {isActive && !data.paused && (
                      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[var(--radius-panel)] ring-1 ring-white/25 motion-safe:animate-pulse-soft" />
                    )}
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 text-left"
                      aria-label={`View ${player.name}'s table`}
                      onClick={() => setSelectedOpponentId(player.id)}
                    >
                      <ConnectionDot connected={player.connected} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{player.name}</span>
                      {player.away && <Badge tone="warn">Away</Badge>}
                      {isActive && <Badge tone="accent">Turn</Badge>}
                    </button>
                    <div className="my-2 flex items-center gap-1.5">
                      <Chip>Table {player.table.length}</Chip>
                    </div>
                    <div className="flex justify-center">{renderTable(player.id, player.table, 'xs')}</div>
                  </Panel>
                );
              })}
            </div>
          </section>
        )}

        {/* Main area */}
        <section className="grid gap-4 md:grid-cols-[minmax(0,1fr)_340px]">
          {view.role === 'player' && self ? (
            <Panel className={`relative ${isMyTurn ? 'ring-1 ring-white/25' : ''}`} aria-labelledby="own-table-title">
              {isMyTurn && !data.paused && (
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[var(--radius-panel)] ring-1 ring-white/25 motion-safe:animate-pulse-soft" />
              )}
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="own-table-title" className="flex items-center gap-2 text-lg font-semibold">
                  Your Table{" "}
                  <Chip>{self.table.length}/9</Chip>
                </h2>
                <details className="relative">
                  <summary
                    className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-line text-white/60 transition hover:border-white/40 hover:text-white"
                    aria-label="Table controls help"
                  >
                    <span aria-hidden="true">i</span>
                  </summary>
                  <div className="absolute right-0 z-20 mt-2 w-60 rounded-[var(--radius-control)] border border-line bg-black/95 p-3 text-xs text-white/70 shadow-xl">
                    Tap two slots to swap · drag to rearrange (local only).
                  </div>
                </details>
              </div>

              <div className="flex justify-center">{renderTable(self.id, self.table, compact ? 'sm' : 'md')}</div>

              {!hintDismissed && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-line bg-white/[0.02] px-3 py-2 text-xs text-white/60">
                  <span>Tap two slots to swap · drag to rearrange (local only)</span>
                  <button type="button" className="text-white/50 underline hover:text-white" onClick={dismissHint}>Got it</button>
                </div>
              )}

              {(showPlaceButton || showToHandButton) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {showPlaceButton && (
                    <Button size="sm" disabled={movePending} onClick={moveSelectedHandToTable}>Move Selected to Table</Button>
                  )}
                  {showToHandButton && (
                    <Button size="sm" disabled={movePending} onClick={moveSelectedTableCardToHand}>Move Selected to Hand</Button>
                  )}
                </div>
              )}
            </Panel>
          ) : (
            <Panel className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <p className="text-sm text-white/60">Spectating — you see the same public view as opponents.</p>
              <form
                className="flex flex-wrap items-end justify-center gap-2"
                onSubmit={(event) => { event.preventDefault(); requestRejoin(); }}
              >
                <label className="text-left text-sm">
                  <span className="mb-1 block text-white/60">Request to rejoin as</span>
                  <input
                    value={rejoinName}
                    onChange={(event) => setRejoinName(event.target.value.slice(0, 24))}
                    maxLength={24}
                    aria-label="Request to rejoin as"
                    className="h-11 rounded-[var(--radius-control)] border border-line bg-white/[0.03] px-3"
                    placeholder="Player name"
                  />
                </label>
                <Button type="submit" variant="secondary">Request rejoin</Button>
              </form>
            </Panel>
          )}

          {/* Hand dock (mobile: fixed bottom; desktop: right column). */}
          {view.role === 'player' && (
            <Panel
              padding="compact"
              className="fixed inset-x-0 bottom-0 z-30 rounded-b-none border-x-0 border-b-0 bg-black md:static md:z-auto md:rounded-[var(--radius-panel)] md:border-x md:border-b"
            >
              <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  Your Hand{" "}
                  <Chip>({hand.length})</Chip>
                </h2>
                <div className="ml-auto flex items-center gap-2">
                  {view.role === 'player' && actionReady && (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={Boolean(self && self.table.length > 9) || Boolean(targetForAction)}
                      title={self && self.table.length > 9 ? 'Move extra Table cards to Hand first.' : undefined}
                      onClick={() => send({ t: 'endTurn' })}
                    >
                      End turn
                    </Button>
                  )}
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-full border border-line px-3 py-1 text-xs text-white/60 transition hover:text-white md:hidden"
                    aria-expanded={handOpen}
                    onClick={() => setHandOpen((open) => !open)}
                  >
                    {handOpen ? 'Hide' : 'Show'}
                    <span aria-hidden="true">{handOpen ? '▾' : '▴'}</span>
                  </button>
                </div>
              </div>

              {(pending || confirmation) && (
                <div className="mt-1 text-xs">
                  {pending && <span role="status" className="text-amber-100">{pending}</span>}
                  {!pending && confirmation && <span role="status" className="text-emerald-300">{confirmation}</span>}
                </div>
              )}

              {handOpen && (
                <div
                  data-hand-drop
                  className="mt-1 flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:justify-start md:overflow-visible"
                >
                  {hand.length === 0 && <p className="py-3 text-sm text-white/50">No cards in Hand.</p>}
                  {handNormals.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      disabled={!actionReady}
                      aria-label={`Select ${card.kind === 'teal' ? 'TEAL wild' : 'Normal'} card`}
                      onClick={() => {
                        if (consumeClickSuppression()) return;
                        setTableSelection(null);
                        setSelectedHandId((current) => current === card.id ? null : card.id);
                      }}
                      onPointerDown={(event) => {
                        if (card.kind === 'normal' || card.kind === 'teal') beginPointer(event, card.id, 'hand', null);
                      }}
                      className={`shrink-0 touch-none rounded-[var(--radius-control)] motion-safe:animate-card-in ${drag?.cardId === card.id ? 'opacity-40' : ''}`}
                    >
                      <CardComponent
                        card={toUiCard(card)}
                        size={compact ? 'sm' : 'md'}
                        isSelectable={actionReady}
                        isSelected={selectedHandId === card.id}
                        isDragging={drag?.cardId === card.id}
                        showRevealBadge={data.phase !== 'finished'}
                      />
                    </button>
                  ))}
                  {handActions.length > 0 && (
                    <>
                      <span className="flex shrink-0 flex-col items-center justify-center gap-1 px-1 text-[10px] tracking-[0.14em] text-white/40" aria-hidden="true">
                        <span className="h-8 w-px bg-white/15" />
                        Action
                      </span>
                      {handActions.map((card) => (
                        <button
                          key={card.id}
                          type="button"
                          disabled={!actionReady}
                          aria-label={`Select ${card.action} card`}
                          onClick={() => {
                            if (consumeClickSuppression()) return;
                            setTableSelection(null);
                            setSelectedHandId((current) => current === card.id ? null : card.id);
                          }}
                          className={`shrink-0 touch-none rounded-[var(--radius-control)] motion-safe:animate-card-in ${drag?.cardId === card.id ? 'opacity-40' : ''}`}
                        >
                          <CardComponent
                            card={toUiCard(card)}
                            size={compact ? 'sm' : 'md'}
                            isSelectable={actionReady}
                            isSelected={selectedHandId === card.id}
                            showRevealBadge={data.phase !== 'finished'}
                          />
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}

              {handNormals.length > 0 && handActions.length > 0 && (
                <p className="mt-1 hidden text-[11px] text-white/40 md:block">Normal/TEAL cards return to the deck at turn end.</p>
              )}
              {selectedHand?.kind === 'action' && selectedHand.action === 'APPEAL' && (
                <p className="mt-2 text-xs text-white/60">APPEAL can only be played during an eligible interrupt.</p>
              )}
            </Panel>
          )}
        </section>
      </div>

      {/* Opponent table modal */}
      {selectedOpponent && (
        <div
          className="fixed inset-0 z-[200] overflow-y-auto bg-black/80 p-4 backdrop-blur-sm sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedOpponent.name}'s table`}
        >
          <Panel
            ref={opponentDialogRef}
            padding="roomy"
            className="mx-auto max-w-lg bg-black/90 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                {selectedOpponent.name}
                {selectedOpponent.away && <Badge tone="warn">Away</Badge>}
              </h2>
              <div className="flex items-center gap-2">
                {isHost && selectedOpponent.id !== selfId && (
                  <details className="relative">
                    <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-line text-white/70 hover:text-white" aria-label="Player actions">⋯</summary>
                    <div className="absolute right-0 z-10 mt-2 rounded-[var(--radius-control)] border border-line bg-black/95 p-1">
                      <Button size="sm" variant="danger" onClick={() => { send({ t: 'kick', targetId: selectedOpponent.id }); setSelectedOpponentId(null); }}>Kick player</Button>
                    </div>
                  </details>
                )}
                <IconButton label="Close table" onClick={() => setSelectedOpponentId(null)}>
                  <CloseIcon />
                </IconButton>
              </div>
            </div>
            <div className="flex justify-center">{renderTable(selectedOpponent.id, selectedOpponent.table, 'sm')}</div>
            <p className="mt-4 text-center text-xs text-white/50">Revealed cards show their face; concealed cards stay face-down.</p>
          </Panel>
        </div>
      )}

      {/* Players overlay */}
      {showPlayers && (
        <div
          className="fixed inset-0 z-[200] overflow-y-auto bg-black/80 p-4 backdrop-blur-sm sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="players-title"
        >
          <Panel
            ref={dialogRef}
            padding="roomy"
            className="mx-auto max-w-xl bg-black/90 shadow-2xl"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 id="players-title" className="text-2xl font-semibold">Players</h2>
              <IconButton label="Close players" onClick={() => setShowPlayers(false)}>
                <CloseIcon />
              </IconButton>
            </div>
            <ul className="space-y-2">
              {data.players.map((player) => (
                <li key={player.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-line p-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{player.name}</span>
                    {player.id === selfId && <Badge>You</Badge>}
                    {player.id === data.hostId && <Badge tone="accent">Host</Badge>}
                    {player.away && <Badge tone="warn">Away</Badge>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-sm text-white/60">
                    <Chip>Table {player.table.length}</Chip>
                    {player.id === selfId && <Chip>Hand {hand.length}</Chip>}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      {/* Rules overlay */}
      {showRules && <RulesOverlay onClose={() => setShowRules(false)} />}

      {/* Drag preview */}
      {drag && (() => {
        const card = cardById(drag.cardId);
        return card ? (
          <div
            className="pointer-events-none fixed z-[300] -translate-x-1/2 -translate-y-1/2"
            style={{ left: drag.x, top: drag.y }}
            aria-hidden="true"
          >
            <CardComponent card={toUiCard(card)} isDragging />
          </div>
        ) : null;
      })()}
    </main>
  );
}

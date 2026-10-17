import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { COLOR_HEX, countCompleteSets, type Card as EngineCard } from '@3eal/engine';
import CardComponent from '../components/cards/CardComponent';
import { useRoom, type SendFeedback } from '../hooks/useRoom';
import { mergeTableLayout, moveOrSwap, placeInLayout, serverSlotForVisual, tableCardIds, type TableLayout } from '../logic/tableLayout';
import type { Card as UiCard } from '../types';
import type { PublicSlot, View } from '../shared/protocol';

interface WorkerGameBoardProps {
  roomCode: string;
  onLeave: () => void;
  onReturnToLobby: () => void;
}

const buttonClass = 'min-h-11 rounded-xl border border-white/30 px-4 py-2 font-semibold transition hover:border-teal-300 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40';
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

export default function WorkerGameBoard({ roomCode, onLeave, onReturnToLobby }: WorkerGameBoardProps) {
  const playerName = sessionStorage.getItem('3eal-player-name') ?? 'Player 1';
  const { view, status, error, send, rejoinRequests, pending, confirmation } = useRoom(roomCode, { name: playerName });
  const [selectedHandId, setSelectedHandId] = useState<string | null>(null);
  const [tableSelection, setTableSelection] = useState<number | null>(null);
  const [rejoinName, setRejoinName] = useState('');
  const [showPlayers, setShowPlayers] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [drag, setDrag] = useState<DragMeta & { x: number; y: number } | null>(null);
  const [dragOver, setDragOver] = useState<DragOver>(null);
  const [pendingMoveKind, setPendingMoveKind] = useState<'place' | 'toHand' | null>(null);

  const layoutRef = useRef<TableLayout>([]);
  const pendingPlacement = useRef<{ cardId: string; slot: number } | null>(null);
  const dragMeta = useRef<DragMeta | null>(null);
  const pointerStart = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const suppressClick = useRef(false);

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

  // Keep the in-flight move's button mounted but disabled until the server
  // answers, so a second click cannot send a duplicate.
  useEffect(() => {
    if (pending === null) setPendingMoveKind(null);
  }, [pending]);

  if (!view) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black p-6 text-center text-white">
        <div className="max-w-md space-y-3">
          <p role={error ? 'alert' : 'status'}>{error || (status === 'awaitingApproval' ? 'Waiting for host approval…' : 'Connecting to the game…')}</p>
          {status === 'awaitingApproval' && <p className="text-sm text-white/60">The host has up to 60 seconds to approve this seat.</p>}
          {error && <button type="button" className={buttonClass} onClick={onLeave}>Return Home</button>}
        </div>
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
  const isOwnTableInteractive = view.role === 'player' && Boolean(self);

  // Local, presentation-only Table order. Merged from every snapshot keyed by
  // card ID so it is never reset by an incoming server update.
  const ownServerIds = self ? tableCardIds(self.table) : [];
  const layout = mergeTableLayout(layoutRef.current, ownServerIds, pendingPlacement.current);
  layoutRef.current = layout;
  if (pendingPlacement.current && layout.includes(pendingPlacement.current.cardId)) {
    pendingPlacement.current = null;
  }

  const pausedRemainingMs = data.pauseRemaining
    ? (interrupt ? data.pauseRemaining.interrupt : data.pauseRemaining.turn)
    : null;
  const secondsLeft = data.paused
    ? (pausedRemainingMs === null ? null : Math.max(0, Math.ceil(pausedRemainingMs / 1000)))
    : interrupt
      ? Math.max(0, Math.ceil(((interrupt.endsAt ?? now) - now) / 1000))
      : data.turnEndsAt !== null
        ? Math.max(0, Math.ceil((data.turnEndsAt - now) / 1000))
        : data.turnRemainingMs === null
          ? null
          : Math.ceil(data.turnRemainingMs / 1000);

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

  const renderTable = (playerId: string, slots: PublicSlot[]) => {
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
    const size = isOwn ? Math.max(layout.length, slots.length, 9) : Math.max(9, slots.length);
    return (
      <div className="grid w-fit grid-cols-3 gap-2">
        {Array.from({ length: size }, (_, index) => {
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
          return slot ? (
            <button
              key={`${playerId}:${index}`}
              type="button"
              data-table-slot={index}
              data-table-owner={playerId}
              data-card-id={cardId ?? ''}
              disabled={disabled}
              aria-label={face
                ? `${table?.name ?? 'Player'} Table card${slot.state === 'revealed' ? ', revealed' : ', concealed'}`
                : `${table?.name ?? 'Player'} concealed Table card`}
              onClick={() => handleSlotClick(playerId, index, slot)}
              onPointerDown={rearrangeReady ? (event) => beginPointer(event, cardId ?? '', 'table', index) : undefined}
              className={`min-h-[112px] touch-none rounded-xl transition ${canTarget ? 'ring-2 ring-amber-300' : ''} ${isDropTarget ? 'ring-2 ring-teal-300' : ''} ${isDraggingSource ? 'opacity-40' : ''}`}
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
              className={`h-28 w-20 touch-none rounded-xl border border-dashed border-white/20 transition disabled:cursor-default ${isDropTarget ? 'border-2 border-teal-300' : ''}`}
            />
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

  return (
    <main className="min-h-screen bg-black px-4 pb-10 pt-5 text-white sm:px-6">
      <header className="mx-auto mb-6 flex max-w-6xl items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-3xl font-black tracking-widest">3EAL</h1>
          <p className="text-xs text-white/60">Room {roomCode} · {status}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className={buttonClass} onClick={() => setShowPlayers(true)}>Players</button>
          <button type="button" className={buttonClass} onClick={onLeave}>Leave</button>
        </div>
      </header>

      {data.paused && (
        <div
          className="mx-auto mb-5 flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/50 bg-amber-100/[0.08] px-4 py-3"
          role="status"
          aria-live="polite"
        >
          <p className="font-semibold text-amber-100">Game paused by host</p>
          {isHost && (
            <button type="button" className={buttonClass} onClick={() => send({ t: 'resume' })}>Resume</button>
          )}
        </div>
      )}

      <section className="mx-auto mb-5 flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-xl border border-white/20 bg-white/[0.05] p-4">
        <div>
          <h2 className="text-lg font-semibold">
            {data.winnerId
              ? `${data.players.find((player) => player.id === data.winnerId)?.name ?? 'A player'} wins!`
              : data.paused
                ? 'Paused'
                : self && data.activePlayerId === self.id
                  ? 'Your turn'
                  : data.activePlayerId
                    ? `${data.players.find((player) => player.id === data.activePlayerId)?.name ?? 'A player'}'s turn`
                    : 'Waiting for a player to reconnect'}
          </h2>
          <p className="text-sm text-white/60">
            {data.phase === 'finished'
              ? 'Game finished · all cards are revealed'
              : data.paused
                ? `Paused · ${secondsLeft === null ? 'timer frozen' : `${secondsLeft}s frozen`}`
                : interrupt
                  ? `Interrupt · ${secondsLeft ?? 0}s remaining`
                  : `Turn ${data.turnNumber || 1} · ${secondsLeft === null ? 'Timer paused' : `${secondsLeft}s remaining`}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-white/75">
          <span>Deck: {data.deckCount}</span>
          {self && ownView && <span>Sets: {countCompleteSets(self.table.flatMap((slot) => {
            const card = slot.state === 'revealed' ? slot.card : ownView.you.concealedOwn[slot.cardId];
            return card ? [card] : [];
          }))}/3</span>}
          {isHost && data.phase === 'playing' && !data.paused && (
            <button type="button" className={buttonClass} onClick={() => send({ t: 'pause' })}>Pause</button>
          )}
        </div>
      </section>

      {error && <p className="mx-auto mb-4 max-w-6xl text-center text-sm text-rose-300" role="alert">{error}</p>}
      {data.lastInterruptResult && (
        <p className="mx-auto mb-4 max-w-6xl text-center text-sm text-amber-100" role="status">
          {data.lastInterruptResult.kind} {data.lastInterruptResult.outcome === 'appealed' ? 'was appealed' : 'resolved'}.
        </p>
      )}

      {interrupt && (
        <section className="mx-auto mb-6 flex max-w-6xl flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-200/50 bg-amber-100/5 p-4">
          <p>
            {interrupt.kind} · {data.players.find((player) => player.id === interrupt.actorId)?.name ?? 'A player'}
            {interrupt.targetId && ` → ${data.players.find((player) => player.id === interrupt.targetId)?.name ?? 'a player'}`}
            {' · '}{secondsLeft ?? 0}s{data.paused ? ' (paused)' : ''}
          </p>
          {view.role === 'player' && isEligible && appealCard && (
            <div className="flex gap-2">
              <button type="button" className={buttonClass} disabled={data.paused} onClick={() => send({ t: 'appeal', cardId: appealCard.id })}>
                {data.paused ? 'APPEAL (Paused)' : 'APPEAL'}
              </button>
              <button type="button" className={buttonClass} disabled={data.paused} onClick={() => send({ t: 'pass' })}>
                {data.paused ? 'Pass (Paused)' : 'Pass'}
              </button>
            </div>
          )}
          {view.role === 'player' && isEligible && !appealCard && <span className="text-sm text-white/60">No APPEAL in Hand · passing automatically</span>}
          {view.role === 'player' && !isEligible && (
            <span className="text-sm text-white/60">Waiting on a decision…{data.paused ? ' (paused)' : ''}</span>
          )}
        </section>
      )}

      {/* Responsive layout: Table and Hand side by side on wide screens, stacked on narrow */}
      <section className="mx-auto mb-7 max-w-6xl">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Player’s Table */}
          <section className="rounded-2xl border border-white/20 bg-white/[0.04] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">
                {self ? `Your Table (${self.table.length}/9)` : 'Room tables'}
              </h2>
              {targetForAction && (
                <p className="text-sm text-amber-100">
                  {targetForAction === 'CONCEAL'
                    ? 'Choose one of your revealed cards.'
                    : `Choose a card on an opponent's Table${targetForAction === 'REVEAL' ? ' that is concealed' : ''}.`}
                </p>
              )}
              {!targetForAction && isOwnTableInteractive && (
                <p className="text-xs text-white/45">Tap two slots to move or swap · drag to rearrange (local only)</p>
              )}
            </div>
            {self && renderTable(self.id, self.table)}
            <div className="mt-4 flex flex-wrap gap-2">
              {showPlaceButton && (
                <button type="button" className={buttonClass} disabled={movePending} onClick={moveSelectedHandToTable}>
                  Move Selected to Table
                </button>
              )}
              {showToHandButton && (
                <button type="button" className={buttonClass} disabled={movePending} onClick={moveSelectedTableCardToHand}>
                  Move Selected to Hand
                </button>
              )}
            </div>
          </section>

          {/* Player’s Hand */}
          {view.role === 'player' && (
            <section className="rounded-2xl border border-white/20 bg-white/[0.04] p-4">
              <h2 className="mb-3 text-xl font-semibold">Your Hand ({hand.length})</h2>
              <div className="flex flex-wrap justify-center gap-3" data-hand-drop>
                {hand.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    disabled={!actionReady}
                    aria-label={`Select ${card.kind === 'action' ? card.action : card.kind === 'teal' ? 'TEAL wild' : 'Normal'} card`}
                    onClick={() => {
                      if (consumeClickSuppression()) return;
                      setTableSelection(null);
                      setSelectedHandId((current) => current === card.id ? null : card.id);
                    }}
                    onPointerDown={(event) => {
                      if (card.kind === 'normal' || card.kind === 'teal') beginPointer(event, card.id, 'hand', null);
                    }}
                    className={`touch-none rounded-xl ${drag?.cardId === card.id ? 'opacity-40' : ''}`}
                  >
                    <CardComponent
                      card={toUiCard(card)}
                      isSelectable={actionReady}
                      isSelected={selectedHandId === card.id}
                      isDragging={drag?.cardId === card.id}
                    />
                  </button>
                ))}
                {hand.length === 0 && <p className="py-5 text-white/60">No cards in Hand.</p>}
              </div>
              {selectedHand?.kind === 'action' && selectedHand.action === 'APPEAL' && (
                <p className="mt-3 text-center text-sm text-white/60">APPEAL can only be played during an eligible interrupt.</p>
              )}
              {selectedHand?.kind === 'normal' || selectedHand?.kind === 'teal' ? (
                <p className="mt-3 text-center text-sm text-white/60">Select an empty Table slot to place this card, or a card to swap when your Table is full.</p>
              ) : null}
            </section>
          )}
        </div>
      </section>

      <section className="mx-auto mb-7 flex max-w-6xl flex-wrap justify-center gap-3" aria-label="Turn controls">
        {pending && <p role="status" className="w-full text-center text-sm text-amber-100">{pending}</p>}
        {!pending && confirmation && <p role="status" className="w-full text-center text-sm text-teal-200">{confirmation}</p>}
        {view.role === 'player' && actionReady && (
          <button type="button" className={buttonClass} disabled={Boolean(self && self.table.length > 9) || Boolean(targetForAction)} onClick={() => send({ t: 'endTurn' })}>
            End turn
          </button>
        )}
        {view.role === 'spectator' && (
          <form className="flex flex-wrap items-end justify-center gap-2" onSubmit={(event) => { event.preventDefault(); requestRejoin(); }}>
            <label className="text-sm">
              <span className="mb-1 block">Request to rejoin as</span>
              <input
                value={rejoinName}
                onChange={(event) => setRejoinName(event.target.value.slice(0, 24))}
                maxLength={24}
                className="h-11 rounded-lg border border-white/25 bg-black px-3"
                placeholder="Player name"
              />
            </label>
            <button type="submit" className={buttonClass}>Request rejoin</button>
          </form>
        )}
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2" aria-label="Other players">
        {data.players.filter((player) => player.id !== selfId).map((player) => (
          <article key={player.id} className="rounded-xl border border-white/20 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{player.name}</h2>
              {isHost && <button type="button" className="text-xs underline" onClick={() => send({ t: 'kick', targetId: player.id })}>Kick</button>}
            </div>
            {renderTable(player.id, player.table)}
          </article>
        ))}
      </section>

      {data.phase === 'finished' && (
        <section className="mx-auto mt-7 max-w-6xl rounded-2xl border border-teal-200/40 bg-teal-100/5 p-5 text-center">
          <h2 className="text-2xl font-bold">Game over</h2>
          <p className="my-2">{winner?.name} wins.</p>

          {/* Show the winning sets */}
          <div className="mt-4">
            <h3 className="text-lg font-semibold mb-3">Winning Sets:</h3>
            {winnerSets && (
              <div className="grid gap-4 md:grid-cols-3 mb-4">
                {winnerSets.map((group, setIndex) => (
                  <div key={`set-${setIndex}`} className="flex items-center justify-center gap-2 p-3 rounded-lg bg-white/[0.03] border border-white/10">
                    {group.map((card, cardIndex) => (
                      <CardComponent key={`${card.id}-${cardIndex}`} card={toUiCard(card, true)} showRevealBadge={false} />
                    ))}
                  </div>
                ))}
              </div>
            )}
            <p className="text-sm text-white/60">
              Each group shows a set of 3 matching cards (by color, number, or shape)
            </p>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {isHost && <button type="button" className={buttonClass} onClick={() => send({ t: 'rematch' })}>Rematch</button>}
            <button type="button" className={`${buttonClass} bg-white/[0.04] border-white/20 hover:bg-white/[0.08]`} onClick={onReturnToLobby}>Return to Lobby</button>
            <button type="button" className={`${buttonClass} bg-white/[0.04] border-white/20 hover:bg-white/[0.08]`} onClick={onLeave}>Main Page</button>
          </div>
        </section>
      )}

      {rejoinRequests.length > 0 && isHost && (
        <section className="mx-auto mt-7 max-w-6xl rounded-xl border border-white/20 p-4">
          <h2 className="mb-3 text-lg font-semibold">Rejoin requests</h2>
          {rejoinRequests.map((request) => (
            <div key={request.requestId} className="flex items-center justify-between gap-3 py-2">
              <span>{request.name} wants to rejoin.</span>
              <div className="flex gap-2">
                <button type="button" className={buttonClass} onClick={() => send({ t: 'rejoinDecision', requestId: request.requestId, accept: true })}>Approve</button>
                <button type="button" className={buttonClass} onClick={() => send({ t: 'rejoinDecision', requestId: request.requestId, accept: false })}>Decline</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {isHost && data.spectators.length > 0 && (
        <section className="mx-auto mt-5 max-w-6xl text-sm text-white/60">
          Spectators: {data.spectators.map((spectator) => (
            <span key={spectator.id} className="ml-2">
              {spectator.name}{' '}
              <button type="button" className="underline" onClick={() => send({ t: 'kick', targetId: spectator.id })}>Kick</button>
            </span>
          ))}
        </section>
      )}

      {showPlayers && (
        <div
          className="fixed inset-0 z-[200] overflow-y-auto bg-black/80 p-4 backdrop-blur-sm sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="players-title"
        >
          <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-neutral-950/95 p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 id="players-title" className="text-2xl font-bold">Players</h2>
              <button
                type="button"
                onClick={() => setShowPlayers(false)}
                aria-label="Close players"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white/70 transition hover:border-white hover:bg-white hover:text-black"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <ul className="space-y-2">
              {data.players.map((player) => (
                <li key={player.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/15 p-3">
                  <span>
                    {player.name}
                    {player.id === selfId ? ' (You)' : ''}
                    {player.id === data.hostId && <span className="ml-2 text-xs text-teal-200">Host</span>}
                  </span>
                  <span className="text-sm text-white/60">
                    Table {player.table.length}
                    {player.id === selfId && ` · Hand ${hand.length}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

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

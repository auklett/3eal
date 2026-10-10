import { useEffect, useState } from 'react';
import { COLOR_HEX, countCompleteSets, findWinningPartition, type Card as EngineCard } from '@3eal/engine';
import CardComponent from '../components/cards/CardComponent';
import { useRoom } from '../hooks/useRoom';
import type { Card as UiCard } from '../types';
import type { PublicSlot, View } from '../shared/protocol';

interface WorkerGameBoardProps {
  roomCode: string;
  onLeave: () => void;
  onReturnToLobby: () => void;
}

const buttonClass = 'min-h-11 rounded-xl border border-white/30 px-4 py-2 font-semibold transition hover:border-teal-300 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40';

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

function activeId(view: View, roomCode: string): string {
  return view.role === 'player'
    ? view.data.you.id
    : sessionStorage.getItem(`3eal-session:${roomCode}`) ?? '';
}

export default function WorkerGameBoard({ roomCode, onLeave, onReturnToLobby }: WorkerGameBoardProps) {
  const playerName = sessionStorage.getItem('3eal-player-name') ?? 'Player 1';
  const { view, status, error, send, rejoinRequests } = useRoom(roomCode, { name: playerName });
  const [selectedHandId, setSelectedHandId] = useState<string | null>(null);
  const [selectedTableSlot, setSelectedTableSlot] = useState<number | null>(null);
  const [rejoinName, setRejoinName] = useState('');
  const [now, setNow] = useState(Date.now());
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{ playerId: string; slotIndex: number } | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (view?.data.phase === 'lobby') onReturnToLobby();
  }, [view?.data.phase, onReturnToLobby]);

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
  const selectedHand = hand.find((card) => card.id === selectedHandId);
  const isMyTurn = Boolean(self && data.activePlayerId === self.id && data.phase === 'playing');
  const actionReady = isMyTurn && !data.interrupt && view.role === 'player';
  const isHost = selfId === data.hostId;
  const targetForAction = selectedHand?.kind === 'action' && selectedHand.action !== 'APPEAL'
    ? selectedHand.action
    : null;
  const secondsLeft = data.interrupt
    ? Math.max(0, Math.ceil((data.interrupt.endsAt - now) / 1000))
    : data.turnEndsAt !== null
      ? Math.max(0, Math.ceil((data.turnEndsAt - now) / 1000))
      : data.turnRemainingMs === null
        ? null
        : Math.ceil(data.turnRemainingMs / 1000);
  const interrupt = data.interrupt;
  const isEligible = Boolean(interrupt && self && (
    interrupt.kind === 'CONCEAL'
      ? self.id !== interrupt.actorId
      : self.id === interrupt.targetId
  ));
  const appealCard = hand.find((card) => card.kind === 'action' && card.action === 'APPEAL');

  const handleSlotClick = (playerId: string, slotIndex: number, slot: PublicSlot | undefined) => {
    if (view.role !== 'player' || !self) return;
    if (targetForAction && isMyTurn && !data.interrupt) {
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
        setSelectedTableSlot(null);
      }
      return;
    }
    if (playerId !== self.id || !actionReady) return;
    if (selectedHand && (selectedHand.kind === 'normal' || selectedHand.kind === 'teal')) {
      const targetSlot = self.table.length >= 9 ? slotIndex : Math.min(slotIndex, self.table.length);
      send({ t: 'place', cardId: selectedHand.id, slot: targetSlot });
      setSelectedHandId(null);
      setSelectedTableSlot(null);
      return;
    }
    setSelectedTableSlot(slotIndex);
  };

  const moveSelectedTableCardToHand = () => {
    if (selectedTableSlot === null || !actionReady) return;
    send({ t: 'toHand', slot: selectedTableSlot });
    setSelectedTableSlot(null);
  };

  const requestRejoin = () => {
    const name = rejoinName.trim();
    if (!name || name.length > 24) return;
    sessionStorage.setItem('3eal-player-name', name);
    sessionStorage.removeItem(`3eal-session:${roomCode}`);
    window.location.reload();
  };

  const renderTable = (playerId: string, slots: PublicSlot[]) => {
    const table = data.players.find((player) => player.id === playerId);
    const ownPrivateCards = playerId === selfId ? ownView?.you.concealedOwn ?? {} : {};
    const slotCount = Math.max(9, slots.length);
    return (
      <div className="grid w-fit grid-cols-3 gap-2">
        {Array.from({ length: slotCount }, (_, index) => {
          const slot = slots[index];
          const face = slot ? publicCard(slot, ownPrivateCards) : undefined;
          const isOwnSelected = playerId === selfId && selectedTableSlot === index;
          const canTarget = Boolean(targetForAction && slot && (
            targetForAction === 'CONCEAL'
              ? playerId === selfId && slot.state === 'revealed'
              : playerId !== selfId && (targetForAction !== 'REVEAL' || slot.state === 'concealed')
          ));
          return slot ? (
            <button
              key={`${playerId}:${index}:${slot.state === 'concealed' ? slot.cardId : slot.card.id}`}
              type="button"
              disabled={(!actionReady && !canTarget) || (Boolean(targetForAction) && !canTarget)}
              aria-label={face
                ? `${table?.name ?? 'Player'} Table card${slot.state === 'revealed' ? ', revealed' : ', concealed'}`
                : `${table?.name ?? 'Player'} concealed Table card`}
              onClick={() => handleSlotClick(playerId, index, slot)}
              className={`rounded-xl ${canTarget ? 'ring-2 ring-amber-300' : ''} ${isOwnSelected ? 'ring-2 ring-teal-300' : ''}`}
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
              />
            </button>
          ) : (
            <button
              key={`${playerId}:empty:${index}`}
              type="button"
              data-table-slot={index}
              disabled={!actionReady || playerId !== selfId || Boolean(targetForAction)}
              aria-label="Empty Table slot"
              onClick={() => handleSlotClick(playerId, index, undefined)}
              onDragOver={(e) => {
                e.preventDefault();
                if (actionReady && draggedCardId && !targetForAction && playerId === selfId) {
                  setDragOverSlot({ playerId, slotIndex: index });
                }
              }}
              onDragLeave={() => {
                if (dragOverSlot?.playerId === playerId && dragOverSlot?.slotIndex === index) {
                  setDragOverSlot(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (actionReady && draggedCardId && !targetForAction && dragOverSlot?.playerId === playerId && dragOverSlot?.slotIndex === index) {
                  const cardId = draggedCardId;
                  setDraggedCardId(null);
                  setDragOverSlot(null);
                  // Find the card in hand
                  const handCard = hand.find(c => c.id === cardId);
                  if (handCard && (handCard.kind === 'normal' || handCard.kind === 'teal')) {
                    const targetSlot = self.table.length >= 9 ? index : Math.min(index, self.table.length);
                    send({ t: 'place', cardId: handCard.id, slot: targetSlot });
                  }
                }
              }}
              className={`h-28 w-20 rounded-xl border border-dashed border-white/20 disabled:cursor-default ${dragOverSlot?.playerId === playerId && dragOverSlot?.slotIndex === index ? 'border-2 border-teal-300' : ''}`}
            />
          );
        })}
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-black px-4 pb-10 pt-5 text-white sm:px-6">
      <header className="mx-auto mb-6 flex max-w-6xl items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-3xl font-black tracking-widest">3EAL</h1>
          <p className="text-xs text-white/60">Room {roomCode} · {status}</p>
        </div>
        <button type="button" className={buttonClass} onClick={onLeave}>Leave</button>
      </header>

      <section className="mx-auto mb-5 flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-xl border border-white/20 bg-white/[0.05] p-4">
        <div>
          <h2 className="text-lg font-semibold">
            {data.winnerId
              ? `${data.players.find((player) => player.id === data.winnerId)?.name ?? 'A player'} wins!`
              : self && data.activePlayerId === self.id
                ? 'Your turn'
                : data.activePlayerId
                  ? `${data.players.find((player) => player.id === data.activePlayerId)?.name ?? 'A player'}'s turn`
                  : 'Waiting for a player to reconnect'}
          </h2>
          <p className="text-sm text-white/60">
            {data.phase === 'finished'
              ? 'Game finished · all cards are revealed'
              : interrupt
                ? `Interrupt · ${secondsLeft ?? 0}s remaining`
                : `Turn ${data.turnNumber || 1} · ${secondsLeft === null ? 'Timer paused' : `${secondsLeft}s remaining`}`}
          </p>
        </div>
        <div className="flex gap-4 text-sm text-white/75">
          <span>Deck: {data.deckCount}</span>
          <span>Discard: {data.discardCount}</span>
          {self && ownView && <span>Sets: {countCompleteSets(self.table.flatMap((slot) => {
            const card = slot.state === 'revealed' ? slot.card : ownView.you.concealedOwn[slot.cardId];
            return card ? [card] : [];
          }))}/3</span>}
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
            {' · '}{secondsLeft}s
          </p>
          {view.role === 'player' && isEligible && appealCard && (
            <div className="flex gap-2">
              <button type="button" className={buttonClass} onClick={() => send({ t: 'appeal', cardId: appealCard.id })}>APPEAL</button>
              <button type="button" className={buttonClass} onClick={() => send({ t: 'pass' })}>Pass</button>
            </div>
          )}
          {view.role === 'player' && isEligible && !appealCard && <span className="text-sm text-white/60">No APPEAL in Hand · passing automatically</span>}
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
            </div>
            {self && renderTable(self.id, self.table)}
            {self && selectedTableSlot !== null && actionReady && !selectedHand && (
              <button type="button" className={`${buttonClass} mt-4`} onClick={moveSelectedTableCardToHand}>Move selected Table card to Hand</button>
            )}
          </section>

          {/* Player’s Hand */}
          {view.role === 'player' && (
            <section className="rounded-2xl border border-white/20 bg-white/[0.04] p-4">
              <h2 className="mb-3 text-xl font-semibold">Your Hand ({hand.length})</h2>
              <div className="flex flex-wrap justify-center gap-3">
                {hand.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    disabled={!actionReady}
                    aria-label={`Select ${card.kind === ‘action’ ? card.action : card.kind === ‘teal’ ? ‘TEAL wild’ : ‘Normal’} card`}
                    onClick={() => {
                      setSelectedTableSlot(null);
                      setSelectedHandId((current) => current === card.id ? null : card.id);
                    }}
                    onDragStart={(e) => {
                      if (actionReady && (card.kind === ‘normal’ || card.kind === ‘teal’)) {
                        e.dataTransfer.setData(‘text/plain’, card.id);
                        e.dataTransfer.effectAllowed = ‘move’;
                        setDraggedCardId(card.id);
                      }
                    }}
                    onDragEnd={() => {
                      setDraggedCardId(null);
                    }}
                    className={`rounded-xl ${selectedHandId === card.id ? ‘ring-2 ring-teal-300’ : ‘’} ${draggedCardId === card.id ? ‘opacity-50’ : ‘’}`}
                  >
                    <CardComponent card={toUiCard(card)} isSelectable={actionReady} isSelected={selectedHandId === card.id} isDragging={draggedCardId === card.id} />
                  </button>
                ))}
                {hand.length === 0 && <p className="py-5 text-white/60">No cards in Hand.</p>}
              </div>
              {selectedHand?.kind === ‘action’ && selectedHand.action === ‘APPEAL’ && (
                <p className="mt-3 text-center text-sm text-white/60">APPEAL can only be played during an eligible interrupt.</p>
              )}
              {selectedHand?.kind === ‘normal’ || selectedHand?.kind === ‘teal’ ? (
                <p className="mt-3 text-center text-sm text-white/60">Select an empty Table slot to place this card, or a card to swap when your Table is full.</p>
              ) : null}
            </section>
          )}
        </div>
      </section>

      <section className="mx-auto mb-7 flex max-w-6xl flex-wrap justify-center gap-3" aria-label="Turn controls">
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
              <h2 className="text-lg font-semibold">{player.name} · Hand {player.handCount}</h2>
              {isHost && <button type="button" className="text-xs underline" onClick={() => send({ t: 'kick', targetId: player.id })}>Kick</button>}
            </div>
            {renderTable(player.id, player.table)}
          </article>
        ))}
      </section>

      {data.phase === 'finished' && (
        <section className="mx-auto mt-7 max-w-6xl rounded-2xl border border-teal-200/40 bg-teal-100/5 p-5 text-center">
          <h2 className="text-2xl font-bold">Game over</h2>
          <p className="my-2">{data.players.find((player) => player.id === data.winnerId)?.name} wins.</p>

          {/* Show the winning sets */}
          <div className="mt-4">
            <h3 className="text-lg font-semibold mb-3">Winning Sets:</h3>
            {self && ownView && (
              <div className="grid gap-4 md:grid-cols-3 mb-4">
                {[0, 1, 2].map((setIndex) => (
                  <div key={`set-${setIndex}`} className="flex items-center justify-center gap-2 p-3 rounded-lg bg-white/[0.03] border border-white/10">
                    {self.table.slice(setIndex * 3, setIndex * 3 + 3).map((slot, cardIndex) => {
                      const card = slot.state === 'revealed' ? slot.card : ownView.you.concealedOwn[slot.cardId];
                      return card && (
                        <CardComponent
                          key={`${slot.cardId}-${cardIndex}`}
                          card={toUiCard(card, true)}
                        />
                      );
                    })}
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
    </main>
  );
}

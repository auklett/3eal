import { useEffect, useMemo, useState } from 'react';
import type { ActionType, Card, GameState, Player } from '../types';
import {
  drawCard,
  eligibleAppealPlayers,
  endTurn,
  initializeGame,
  playAppeal,
  playCard,
  resolveAction
} from '../logic/gameEngine';
import { completeSetCount } from '../logic/validation';
import type { RoomPlayer } from '../lib/rooms';
import CardComponent from '../components/cards/CardComponent';
import HamburgerMenu from '../components/game/HamburgerMenu';
import ActionOverlay from '../components/game/ActionOverlay';

type Zone = 'table' | 'hand';

const buttonStyle: React.CSSProperties = {
  minHeight: 44,
  padding: '12px 20px',
  borderRadius: 12,
  color: '#FFFFFF',
  backgroundColor: '#000000',
  border: '2px solid #FFFFFF',
  cursor: 'pointer'
};

const disabledButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  opacity: 0.4,
  cursor: 'not-allowed'
};

function arrangeCards(cards: Card[], from: number, to: number): Card[] {
  const next = [...cards];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

interface GameBoardProps {
  roomCode: string;
  playerName: string;
  playerId?: string;
  roomPlayers: RoomPlayer[];
  hostId: string | null;
}

export default function GameBoard({ roomCode, playerName, playerId, roomPlayers, hostId }: GameBoardProps) {
  const [initialGame] = useState(() => {
    const lobbyPlayers = roomPlayers.length > 0
      ? roomPlayers
      : [
        { id: playerId ?? 'player1', name: playerName, joinedAt: 0 },
        { id: 'player2', name: 'Player 2', joinedAt: 1 }
      ];
    const initialPlayers: Record<string, Player> = Object.fromEntries(
      lobbyPlayers.map((player) => [
        player.id,
        {
          id: player.id,
          name: player.name,
          isHost: player.id === hostId,
          table: [],
          hand: [],
          sets: []
        }
      ])
    );
    const initialState = initializeGame(Object.values(initialPlayers));
    return {
      players: Object.fromEntries(Object.values(initialPlayers).map((player) => [player.id, player])),
      game: initialState
    };
  });
  const [players, setPlayers] = useState<Record<string, Player>>(initialGame.players);
  const [game, setGame] = useState<GameState | null>(initialGame.game);
  const [selection, setSelection] = useState<{ zone: Zone; cardId: string } | null>(null);
  const [pendingActionType, setPendingActionType] = useState<Exclude<ActionType, 'APPEAL'> | null>(null);
  const [message, setMessage] = useState(`${initialGame.players[initialGame.game.activePlayerId].name}'s turn — draw a card`);
  const [appealDismissed, setAppealDismissed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [draggedCard, setDraggedCard] = useState<{ zone: Zone; cardId: string } | null>(null);

  const pendingAction = game?.pendingAction;
  const appealPlayers = useMemo(
    () => pendingAction ? eligibleAppealPlayers(pendingAction, players) : [],
    [pendingAction, players]
  );

  useEffect(() => {
    if (!pendingAction) {
      setSecondsLeft(30);
      setAppealDismissed(false);
      return;
    }

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((pendingAction.appealWindowEndsAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0 && game) {
        const resolved = resolveAction(game, players);
        setGame({ ...resolved.game });
        setPlayers({ ...resolved.players });
        setMessage('Interrupt expired. Action resolved.');
      }
    };

    updateTimer();
    const timer = window.setInterval(updateTimer, 250);
    return () => window.clearInterval(timer);
  }, [pendingAction, game, players]);

  if (!game) return <div className="p-8 text-center text-white">Starting game…</div>;

  const activePlayer = players[game.activePlayerId];
  const opponents = Object.values(players).filter((player) => player.id !== activePlayer.id);
  const handSelection = selection?.zone === 'hand'
    ? activePlayer.hand.find((card) => card.id === selection.cardId)
    : undefined;
  const tableSelection = selection?.zone === 'table'
    ? activePlayer.table.find((card) => card.id === selection.cardId)
    : undefined;
  const eligibleResponder = appealPlayers[0];
  const appealCard = eligibleResponder?.hand.find((card) => card.actionType === 'APPEAL');

  const updatePlayer = (updated: Player) => {
    setPlayers((current) => ({ ...current, [updated.id]: updated }));
  };

  const handleDraw = () => {
    try {
      const result = drawCard(game, activePlayer);
      setGame({ ...result.game });
      updatePlayer({ ...result.player, table: [...result.player.table], hand: [...result.player.hand] });
      setSelection(null);
      setMessage('Drew a card. Main phase.');
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const handlePlay = () => {
    if (!handSelection) {
      setMessage('Select an Action card in your Hand first.');
      return;
    }
    const actionType = handSelection.actionType;
    if (!actionType) {
      setMessage('This Action card has no action type.');
      return;
    }
    if (actionType === 'APPEAL') {
      setMessage('APPEAL can only be played during an interrupt.');
      return;
    }
    setPendingActionType(actionType);
  };

  const handleConfirmTarget = (targetPlayerId: string, targetCardId: string) => {
    if (!pendingActionType || !handSelection) return;

    try {
      const result = playCard(game, activePlayer, handSelection.id, targetPlayerId, targetCardId, players);
      setPlayers((current) => ({
        ...current,
        [activePlayer.id]: { ...result.player, hand: [...result.player.hand] }
      }));
      setPendingActionType(null);
      setSelection(null);

      if (!result.game.pendingAction) {
        setGame({ ...result.game });
        return;
      }

      const eligible = eligibleAppealPlayers(result.game.pendingAction, {
        ...players,
        [activePlayer.id]: result.player
      });
      if (eligible.length === 0) {
        const resolved = resolveAction(result.game, { ...players, [activePlayer.id]: result.player });
        setGame({ ...resolved.game });
        setPlayers({ ...resolved.players });
        setMessage('No eligible APPEAL. Action resolved immediately.');
      } else {
        setGame({ ...result.game });
        setAppealDismissed(false);
        setMessage('Waiting on a decision…');
      }
    } catch (error) {
      setMessage((error as Error).message);
      setPendingActionType(null);
    }
  };

  const handleAppeal = () => {
    if (!game.pendingAction || !eligibleResponder || !appealCard) return;
    try {
      const result = playAppeal(game, eligibleResponder, appealCard.id, players);
      setGame({ ...result.game });
      setPlayers((current) => ({
        ...current,
        [eligibleResponder.id]: { ...result.player, hand: [...result.player.hand] }
      }));
      setMessage('APPEAL succeeded. The action was cancelled.');
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const handleDiscard = () => {
    if (!tableSelection) {
      setMessage('Select a card on your Table to discard.');
      return;
    }
    try {
      const result = playCard(game, activePlayer, tableSelection.id);
      setGame({ ...result.game, discardPile: [...result.game.discardPile] });
      updatePlayer({ ...result.player, table: [...result.player.table] });
      setSelection(null);
      setMessage('Table card discarded.');
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const handleEndTurn = () => {
    try {
      const result = endTurn(game, activePlayer);
      setGame({ ...result.game });
      if (result.winnerId) {
        updatePlayer(result.player);
        setMessage(`${activePlayer.name} wins!`);
        return;
      }

      const playerIds = Object.keys(players);
      const nextPlayerId = playerIds[(playerIds.indexOf(activePlayer.id) + 1) % playerIds.length];
      const updatedPlayers = { ...players, [activePlayer.id]: result.player };
      setPlayers(updatedPlayers);
      setGame({ ...result.game, activePlayerId: nextPlayerId, turnPhase: 'DRAW' });
      setSelection(null);
      setMessage(`${updatedPlayers[nextPlayerId].name}'s turn — draw a card`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const handleMoveCard = (zone: Zone, sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const cards = zone === 'table' ? activePlayer.table : activePlayer.hand;
    const from = cards.findIndex((card) => card.id === sourceId);
    const to = cards.findIndex((card) => card.id === targetId);
    if (from < 0 || to < 0) return;
    const reordered = arrangeCards(cards, from, to);
    updatePlayer(zone === 'table'
      ? { ...activePlayer, table: reordered }
      : { ...activePlayer, hand: reordered });
  };

  const handleEmptyTableSlot = () => {
    if (selection?.zone !== 'table') return;
    const from = activePlayer.table.findIndex((card) => card.id === selection.cardId);
    if (from < 0) return;
    const reordered = [...activePlayer.table];
    const [card] = reordered.splice(from, 1);
    reordered.push(card);
    updatePlayer({ ...activePlayer, table: reordered });
    setSelection(null);
  };

  const handleDropOnEmptyTableSlot = () => {
    if (draggedCard?.zone !== 'table') return;
    const from = activePlayer.table.findIndex((card) => card.id === draggedCard.cardId);
    if (from >= 0) {
      const reordered = [...activePlayer.table];
      const [card] = reordered.splice(from, 1);
      reordered.push(card);
      updatePlayer({ ...activePlayer, table: reordered });
    }
    setDraggedCard(null);
  };

  const handleCardClick = (zone: Zone, card: Card) => {
    if (selection?.zone === zone && selection.cardId === card.id) {
      setSelection(null);
    } else if (selection?.zone === zone) {
      handleMoveCard(zone, selection.cardId, card.id);
      setSelection(null);
    } else {
      setSelection({ zone, cardId: card.id });
    }
  };

  const moveOnDrop = (zone: Zone, cardId: string) => {
    if (draggedCard?.zone === zone) handleMoveCard(zone, draggedCard.cardId, cardId);
    setDraggedCard(null);
  };

  return (
    <main className="min-h-screen bg-black px-4 pb-10 pt-3 text-white sm:px-6">
      <HamburgerMenu players={Object.values(players)} />
      <header className="mb-5 flex items-center justify-center">
        <div className="text-center">
          <h1 className="m-0 text-4xl font-bold tracking-wide text-white">3EAL</h1>
          <p className="text-xs text-white/60">Room {roomCode}</p>
        </div>
      </header>

      <section className="mx-auto mb-5 flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-xl border border-white/25 bg-white/[0.06] p-4">
        <div>
          <p className="text-lg">{message}</p>
          <p className="text-sm text-white/70">Phase: {game.turnPhase} · Active: {activePlayer.name}</p>
        </div>
        <div className="flex gap-4 text-sm text-white/80">
          <span>Deck: {game.deck.length}</span>
          <span>Discard: {game.discardPile.length}</span>
          <span>Sets: {completeSetCount(activePlayer.table)}/3</span>
        </div>
      </section>

      <section className="mx-auto mb-6 flex max-w-6xl flex-wrap justify-center gap-6" aria-label="Deck and discard pile">
        <div className="text-center">
          <p className="mb-2">Draw Deck</p>
          <CardComponent card={{ id: 'deck-back', category: 'NORMAL', isRevealed: false }} faceDown />
          <p className="mt-1 text-xs text-white/60">{game.deck.length} cards</p>
        </div>
        <div className="text-center">
          <p className="mb-2">Discard Pile</p>
          {game.discardPile.length > 0
            ? <CardComponent card={game.discardPile[game.discardPile.length - 1]} />
            : <div className="h-[112px] w-[80px] rounded-xl border border-dashed border-white/40" />}
          <p className="mt-1 text-xs text-white/60">{game.discardPile.length} cards</p>
        </div>
      </section>

      <section className="player-zones mx-auto mb-8 max-w-6xl gap-8 rounded-2xl border border-white/25 bg-white/[0.04] p-4 sm:p-6">
        <div className="min-w-0 flex-1">
          <h2 className="mb-3 text-center text-xl font-semibold">{activePlayer.name}'s Table ({activePlayer.table.length}/9)</h2>
            <div className="mx-auto grid w-fit grid-cols-3 gap-3">
              {Array.from({ length: Math.max(9, activePlayer.table.length) }, (_, index) => {
                const card = activePlayer.table[index];
                return card ? (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={() => setDraggedCard({ zone: 'table', cardId: card.id })}
                    onDragEnd={() => setDraggedCard(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => moveOnDrop('table', card.id)}
                    onClick={() => handleCardClick('table', card)}
                    className="cursor-pointer rounded-xl"
                    role="button"
                    tabIndex={0}
                    aria-label={`Your ${card.category === 'WILD' ? 'TEAL wild' : 'Table'} card${card.isRevealed ? ', revealed to all players' : ', concealed'}`}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleCardClick('table', card);
                      }
                    }}
                  >
                    <CardComponent card={card} isSelectable isSelected={selection?.zone === 'table' && selection.cardId === card.id} isDragging={draggedCard?.cardId === card.id} />
                  </div>
                ) : (
                  <button
                    key={`empty-${index}`}
                    type="button"
                    onClick={handleEmptyTableSlot}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handleDropOnEmptyTableSlot}
                    aria-label={`Empty Table slot ${index + 1}`}
                    className="h-[112px] w-[80px] rounded-xl border-2 border-dashed border-white/30 hover:border-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400"
                  />
                );
              })}
            </div>
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="mb-3 text-center text-xl font-semibold">{activePlayer.name}'s Hand ({activePlayer.hand.length})</h2>
          {activePlayer.hand.length === 0
            ? <p className="py-5 text-center text-white/60">No Action cards in Hand yet.</p>
            : <div className="flex flex-wrap justify-center gap-3 p-2">
              {activePlayer.hand.map((card) => (
                <div
                  key={card.id}
                  draggable
                  onDragStart={() => setDraggedCard({ zone: 'hand', cardId: card.id })}
                  onDragEnd={() => setDraggedCard(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => moveOnDrop('hand', card.id)}
                  onClick={() => handleCardClick('hand', card)}
                  className="cursor-pointer rounded-xl"
                  role="button"
                  tabIndex={0}
                  aria-label={`${card.title ?? card.actionType ?? 'Action'} action card`}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleCardClick('hand', card);
                    }
                  }}
                >
                  <CardComponent card={card} isSelectable isSelected={selection?.zone === 'hand' && selection.cardId === card.id} isDragging={draggedCard?.cardId === card.id} />
                </div>
              ))}
            </div>}
        </div>
      </section>

      <section className="mx-auto mb-6 flex max-w-6xl flex-wrap justify-center gap-3" aria-label="Turn controls">
        {game.turnPhase === 'DRAW' && <button type="button" style={buttonStyle} onClick={handleDraw}>Draw Card</button>}
        {game.turnPhase === 'MAIN' && (
          <>
            <button type="button" style={handSelection?.category === 'ACTION' ? buttonStyle : disabledButtonStyle}
              disabled={!handSelection} onClick={handlePlay}>Play Selected</button>
            <button type="button" style={tableSelection ? buttonStyle : disabledButtonStyle}
              disabled={!tableSelection} onClick={handleDiscard}>Discard Selected</button>
            <button type="button" style={activePlayer.table.length <= 9 ? buttonStyle : disabledButtonStyle}
              disabled={activePlayer.table.length > 9} onClick={handleEndTurn}>End Turn</button>
            {activePlayer.table.length > 9 && <p className="w-full text-center text-yellow-200">Discard down to 9 Table cards before ending your turn.</p>}
          </>
        )}
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2" aria-label="Opponents">
        {opponents.map((opponent) => (
          <article key={opponent.id} className="rounded-xl border border-white/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{opponent.name}'s Table</h2>
              <span className="rounded-full border border-white/40 px-3 py-1 text-sm">Hand: {opponent.hand.length}</span>
            </div>
            <div className="grid w-fit grid-cols-3 gap-2">
              {Array.from({ length: Math.max(9, opponent.table.length) }, (_, index) => {
                const card = opponent.table[index];
                return card
                  ? <div key={card.id} aria-label={card.isRevealed ? 'Revealed to all players' : 'Concealed card'}>
                    <CardComponent card={card} faceDown={!card.isRevealed} />
                  </div>
                  : <div key={`empty-${index}`} className="h-[112px] w-[80px] rounded-xl border border-dashed border-white/15" aria-label="Empty Table slot" />;
              })}
            </div>
          </article>
        ))}
      </section>

      {pendingActionType && (
        <ActionOverlay
          actionType={pendingActionType}
          sourcePlayer={activePlayer}
          players={Object.values(players)}
          onConfirm={handleConfirmTarget}
          onCancel={() => setPendingActionType(null)}
        />
      )}

      {game.pendingAction && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4">
          {eligibleResponder && appealCard && !appealDismissed
            ? <div className="w-full max-w-md rounded-2xl border border-white bg-neutral-950 p-6 text-center shadow-2xl">
              <h2 className="mb-2 text-2xl font-bold">Play APPEAL?</h2>
              <p className="mb-2 text-white/80">{game.pendingAction.actionType} will resolve in {secondsLeft}s.</p>
              <p className="mb-5 text-sm text-white/60">A successful APPEAL cancels the action and discards both cards.</p>
              <div className="flex justify-center gap-3">
                <button type="button" style={buttonStyle} onClick={handleAppeal}>Yes, APPEAL</button>
                <button type="button" style={buttonStyle} onClick={() => setAppealDismissed(true)}>No</button>
              </div>
            </div>
            : <p className="rounded-full border border-white/30 bg-neutral-950 px-5 py-3 text-white" role="status">
              Waiting on a decision… {secondsLeft}s
            </p>}
        </div>
      )}

      {game.winnerId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6 text-center" role="alert">
          <div className="rounded-2xl border border-white bg-neutral-950 p-10">
            <h2 className="mb-3 text-4xl font-bold">Game Over!</h2>
            <p className="text-2xl">{players[game.winnerId].name} wins!</p>
          </div>
        </div>
      )}
    </main>
  );
}

import { useState, useEffect } from 'react';
import type { Player, GameState, Card } from '../types';
import { initializeGame, drawCard, playCard, endTurn, resolveAction } from '../logic/gameEngine';
import CardComponent from '../components/cards/CardComponent';
import HamburgerMenu from '../components/game/HamburgerMenu';

const actionButtonStyle: React.CSSProperties = {
  padding: '16px 32px',
  borderRadius: '16px',
  fontWeight: 600,
  fontSize: '18px',
  color: '#FFFFFF',
  backgroundColor: '#000000',
  border: '2px solid #FFFFFF',
  transition: 'background-color 150ms ease, color 150ms ease, opacity 150ms ease',
  cursor: 'pointer',
};

const disabledButtonStyle: React.CSSProperties = {
  ...actionButtonStyle,
  color: '#FFFFFF',
  backgroundColor: '#000000',
  border: '2px solid rgba(255,255,255,0.3)',
  opacity: 0.4,
  cursor: 'not-allowed',
};

export default function GameBoard() {
  const [players, setPlayers] = useState<Record<string, Player>>({
    player1: {
      id: 'player1',
      name: 'Player 1',
      isHost: true,
      hand: [],
      sets: []
    },
    player2: {
      id: 'player2',
      name: 'Player 2',
      isHost: false,
      hand: [],
      sets: []
    }
  });

  const [game, setGame] = useState<GameState | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    const playerList = Object.values(players);
    const newGame = initializeGame(playerList);
    setGame(newGame);
    setMessage('Game started! Player 1\'s turn - Draw a card');
  }, []);

  if (!game) return <div className="text-white text-center p-8">Loading game...</div>;

  const activePlayer = players[game.activePlayerId];


  const handleDrawCard = () => {
    if (game.turnPhase !== 'DRAW') {
      setMessage('Cannot draw card now');
      return;
    }

    const result = drawCard(game, activePlayer);
    setGame(result.game);
    setPlayers({ ...players, [activePlayer.id]: result.player });
    setMessage(`Drew a card. ${activePlayer.name}'s Main Phase - Play or discard cards`);
  };

  const handlePlaySelected = () => {
    if (!selectedCard) {
      setMessage('No card selected');
      return;
    }

    try {
      const result = playCard(game, activePlayer, selectedCard);
      setGame(result.game);
      setPlayers({ ...players, [activePlayer.id]: result.player });
      setSelectedCard(null);

      if (result.pendingAction) {
        setMessage('Action played! Waiting for opponent response (or auto-resolve in 10s)');
        setTimeout(() => {
          if (game.pendingAction) {
            const resolved = resolveAction(game, players);
            setGame(resolved.game);
            setPlayers(resolved.players);
            setMessage('Action resolved!');
          }
        }, 10000);
      } else {
        setMessage('Card discarded');
      }
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  // --- Drag and drop to rearrange cards in hand (allowed at any time) ---
  // The hand is a fixed 9-slot grid (Card | null)[]. Dragging places the card
  // at the exact target grid index, leaving gaps; dropping on an occupied slot
  // swaps the two cards.
  const handleDragStart = (slotIndex: number) => {
    if (!activePlayer.hand[slotIndex]) return;
    setDragIndex(slotIndex);
  };

  const handleDragOverSlot = (slotIndex: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== slotIndex) setDragOverIndex(slotIndex);
  };

  const handleDropOnSlot = (slotIndex: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = dragIndex;
    setDragOverIndex(null);
    setDragIndex(null);
    if (from === null || from === slotIndex) return;

    const card = activePlayer.hand[from];
    if (!card) return;

    // Move the dragged card to the exact grid slot. The slot may be empty
    // (targetCard is null -> leaves a gap at `from`) or occupied (swap the two).
    const targetCard = activePlayer.hand[slotIndex];
    const newHand: (Card | null)[] = [...activePlayer.hand];
    newHand[slotIndex] = card;
    newHand[from] = targetCard;

    setPlayers({
      ...players,
      [activePlayer.id]: { ...activePlayer, hand: newHand }
    });
    setMessage(targetCard ? `Swapped cards in slots ${from + 1} and ${slotIndex + 1}` : `Moved card to slot ${slotIndex + 1}`);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleEndTurn = () => {
    try {
      const result = endTurn(game, activePlayer);
      setGame(result.game);
      setPlayers({ ...players, [activePlayer.id]: result.player });

      if (result.winnerId) {
        setMessage(`${activePlayer.name} WINS!`);
        return;
      }

      const nextPlayerId = Object.keys(players).find(id => id !== game.activePlayerId) || 'player1';
      setGame({ ...result.game, activePlayerId: nextPlayerId, turnPhase: 'DRAW' });
      setMessage(`${players[nextPlayerId].name}'s turn - Draw a card`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  // The hand is a fixed 9-slot grid (Card | null)[] — use directly
  const handSlots = activePlayer.hand;
  const handCount = handSlots.filter((c): c is Card => c !== null).length;

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <HamburgerMenu players={Object.values(players)} />

      <h1 className="text-4xl font-bold text-center mb-8">3EAL</h1>

      {/* Message Bar */}
      <div
        className="p-4 rounded-lg mb-8 text-center"
        style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.25)' }}
      >
        <p className="text-lg">{message}</p>
        <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Phase: {game.turnPhase} | Active: {activePlayer.name} |
          Deck: {game.deck.length} | Discard: {game.discardPile.length}
        </p>
      </div>

      {/* Current Player Area (Top) */}
      <div className="mb-8">
        <h2 className="text-lg mb-3 text-center">{activePlayer.name}'s Hand ({handCount} cards)</h2>
        <div className="grid grid-cols-3 gap-x-3 gap-y-6 max-w-[260px] mb-4 mx-auto" style={{ rowGap: '0.5rem', columnGap: '0.5rem' }}>
          {handSlots.map((card, index) => (
            <div
              key={card?.id || `slot-${index}`}
              className={`
                ${!card ? 'border-2 border-dashed rounded-xl w-[80px] h-[112px]' : ''}
              `}
              style={{
                borderColor: !card ? 'rgba(255,255,255,0.3)' : undefined,
                backgroundColor: dragOverIndex === index ? 'rgba(255,255,255,0.12)' : undefined,
              }}
              onDragOver={handleDragOverSlot(index)}
              onDrop={handleDropOnSlot(index)}
              onDragLeave={() => dragOverIndex === index && setDragOverIndex(null)}
            >
              {card && (
                <div
                  draggable={true}
                  onDragStart={() => handleDragStart(index)}
                  onDragEnd={handleDragEnd}
                  onClick={() => game.turnPhase === 'MAIN' && (setSelectedCard(card.id), setMessage(`Selected card. Click Play/Discard to play it.`))}
                >
                  <CardComponent
                    card={card}
                    isSelectable={game.turnPhase === 'MAIN'}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex gap-4 justify-center">
          {game.turnPhase === 'DRAW' && (
            <button
              onClick={handleDrawCard}
              style={actionButtonStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#FFFFFF';
                e.currentTarget.style.color = '#000000';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#000000';
                e.currentTarget.style.color = '#FFFFFF';
              }}
            >
              Draw Card
            </button>
          )}
          {game.turnPhase === 'MAIN' && (
            <>
              <button
                onClick={handlePlaySelected}
                disabled={!selectedCard}
                style={selectedCard ? actionButtonStyle : disabledButtonStyle}
                onMouseEnter={(e) => {
                  if (!selectedCard) return;
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                  e.currentTarget.style.color = '#000000';
                }}
                onMouseLeave={(e) => {
                  if (!selectedCard) return;
                  e.currentTarget.style.backgroundColor = '#000000';
                  e.currentTarget.style.color = '#FFFFFF';
                }}
              >
                Play/Discard Selected
              </button>
              <button
                onClick={handleEndTurn}
                style={actionButtonStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                  e.currentTarget.style.color = '#000000';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#000000';
                  e.currentTarget.style.color = '#FFFFFF';
                }}
              >
                End Turn
              </button>
            </>
          )}
        </div>
      </div>

      {/* Center Area */}
      <div className="flex gap-6 justify-center mb-6">
        <div className="text-center">
          <p className="mb-2 text-sm">Draw Deck</p>
          <CardComponent card={{} as Card} faceDown />
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>{game.deck.length} cards</p>
        </div>
        <div className="text-center">
          <p className="mb-2 text-sm">Discard Pile</p>
          {game.discardPile.length > 0 ? (
            <CardComponent card={game.discardPile[game.discardPile.length - 1]} />
          ) : (
            <div className="w-[80px] h-[112px] rounded-xl" style={{ border: '2px solid rgba(255,255,255,0.3)' }} />
          )}
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>{game.discardPile.length} cards</p>
        </div>
      </div>

      {/* Winner Overlay - matches the HamburgerMenu's glass-panel treatment */}
      {game.winnerId && (
        <div
          className="fixed inset-0 flex items-center justify-center z-40"
          style={{ backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
        >
          <div
            className="p-12 rounded-2xl text-center"
            style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid #FFFFFF',
            }}
          >
            <h2 className="text-5xl font-bold mb-4 text-white">Game Over!</h2>
            <p className="text-3xl text-white">{players[game.winnerId].name} Wins!</p>
          </div>
        </div>
      )}
    </div>
  );
}
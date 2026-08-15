import type { GameState, Player, Card } from '../types';
import { generateDeck } from './deck';
import { checkWinCondition } from './validation';

export function initializeGame(players: Player[]): GameState {
  const deck = generateDeck();
  const game: GameState = {
    deck: [],
    discardPile: [],
    activePlayerId: players[0].id,
    turnPhase: 'DRAW',
    winnerId: null
  };

  // Deal 3 normal cards to each player into the fixed 9-slot grid
  for (const player of players) {
    player.hand = Array(9).fill(null);
    for (let i = 0; i < 3; i++) {
      const card = deck.pop();
      if (card && !card.isActionCard) {
        player.hand[i] = card;
      } else {
        // Put action card back and draw another
        if (card) deck.unshift(card);
        i--;
      }
    }
  }

  game.deck = deck;
  return game;
}

export function drawCard(game: GameState, player: Player): { game: GameState; player: Player } {
  if (game.turnPhase !== 'DRAW') {
    throw new Error('Cannot draw card outside of DRAW phase');
  }

  if (game.deck.length === 0) {
    // Reshuffle discard pile if deck is empty
    game.deck = [...game.discardPile];
    game.discardPile = [];
  }

  const card = game.deck.pop();
  if (card) {
    // Find first empty slot in the 9-grid
    const emptyIndex = player.hand.findIndex(c => c === null);
    if (emptyIndex !== -1) {
      player.hand[emptyIndex] = card;
    } else {
      // Hand is full (9 cards) — should be prevented by endTurn, but fallback
      player.hand.push(card);
    }
  }

  game.turnPhase = 'MAIN';
  return { game, player };
}

export function playCard(
  game: GameState,
  player: Player,
  cardId: string,
  targetPlayerId?: string,
  targetCardId?: string
): { game: GameState; player: Player; pendingAction?: boolean } {
  if (game.turnPhase !== 'MAIN') {
    throw new Error('Cannot play card outside of MAIN phase');
  }

  const cardIndex = player.hand.findIndex(c => c?.id === cardId);
  if (cardIndex === -1) {
    throw new Error('Card not in hand');
  }

  const card = player.hand[cardIndex]!;

  if (card.isActionCard) {
    return handleActionCard(game, player, card, cardIndex, targetPlayerId, targetCardId);
  } else {
    // Discard normal card - set slot to null
    player.hand[cardIndex] = null;
    game.discardPile.push(card);
    return { game, player };
  }
}

function handleActionCard(
  game: GameState,
  player: Player,
  card: Card,
  cardIndex: number,
  targetPlayerId?: string,
  targetCardId?: string
): { game: GameState; player: Player; pendingAction?: boolean } {
  switch (card.actionType) {
    case 'CONCEAL':
    case 'STEAL':
    case 'REVEAL':
      if (!targetPlayerId) {
        throw new Error(`${card.actionType} requires a target player`);
      }
      // Remove card from hand and create pending action
      player.hand[cardIndex] = null;
      game.pendingAction = {
        sourcePlayerId: player.id,
        targetPlayerId,
        actionCard: card,
        targetCardId,
        canAppealUntil: Date.now() + 10000 // 10 second appeal window
      };
      game.turnPhase = 'INTERRUPT';
      return { game, player, pendingAction: true };

    case 'APPEAL':
      // APPEAL can only be played during INTERRUPT phase
      throw new Error('APPEAL can only be played in response to an action');

    case 'TEAL':
      // TEAL stays in hand as a wild card, doesn't get played as action
      throw new Error('TEAL is not played as an action card');

    default:
      throw new Error('Unknown action type');
  }
}

export function resolveAction(
  game: GameState,
  players: Record<string, Player>
): { game: GameState; players: Record<string, Player> } {
  if (!game.pendingAction) {
    throw new Error('No pending action to resolve');
  }

  const sourcePlayer = players[game.pendingAction.sourcePlayerId];
  const targetPlayer = players[game.pendingAction.targetPlayerId];
  const action = game.pendingAction.actionCard;

  switch (action.actionType) {
    case 'CONCEAL':
      if (game.pendingAction.targetCardId) {
        const card = targetPlayer.hand.find(c => c?.id === game.pendingAction!.targetCardId);
        if (card) {
          card.isRevealed = false;
        }
      }
      break;

    case 'STEAL':
      if (game.pendingAction.targetCardId) {
        const cardIndex = targetPlayer.hand.findIndex(c => c?.id === game.pendingAction!.targetCardId);
        if (cardIndex !== -1) {
          const stolenCard = targetPlayer.hand[cardIndex]!;
          targetPlayer.hand[cardIndex] = null;
          if (!stolenCard.isActionCard || stolenCard.actionType === 'TEAL') {
            // Place into first empty slot of source player's grid
            const emptyIndex = sourcePlayer.hand.findIndex(c => c === null);
            if (emptyIndex !== -1) {
              sourcePlayer.hand[emptyIndex] = stolenCard;
            } else {
              sourcePlayer.hand.push(stolenCard);
            }
          }
        }
      }
      break;

    case 'REVEAL':
      if (game.pendingAction.targetCardId) {
        const card = targetPlayer.hand.find(c => c?.id === game.pendingAction!.targetCardId);
        if (card) {
          card.isRevealed = true;
        }
      }
      break;
  }

  game.discardPile.push(action);
  game.pendingAction = undefined;
  game.turnPhase = 'MAIN';

  return { game, players };
}

export function playAppeal(
  game: GameState,
  player: Player,
  appealCardId: string
): { game: GameState; player: Player } {
  if (game.turnPhase !== 'INTERRUPT') {
    throw new Error('APPEAL can only be played during INTERRUPT phase');
  }

  if (!game.pendingAction) {
    throw new Error('No action to appeal');
  }

  if (player.id !== game.pendingAction.targetPlayerId) {
    throw new Error('Only the targeted player can appeal');
  }

  const cardIndex = player.hand.findIndex(c => c?.id === appealCardId);
  if (cardIndex === -1) {
    throw new Error('APPEAL card not in hand');
  }

  const appealCard = player.hand[cardIndex]!;
  if (!appealCard.isActionCard || appealCard.actionType !== 'APPEAL') {
    throw new Error('Card is not an APPEAL');
  }

  // Both cards go to discard pile
  player.hand[cardIndex] = null;
  game.discardPile.push(appealCard);
  game.discardPile.push(game.pendingAction.actionCard);

  game.pendingAction = undefined;
  game.turnPhase = 'MAIN';

  return { game, player };
}

export function endTurn(
  game: GameState,
  player: Player
): { game: GameState; player: Player; winnerId?: string } {
  if (game.turnPhase !== 'MAIN') {
    throw new Error('Cannot end turn outside of MAIN phase');
  }

  // Enforce hand limit of 9 cards (count non-null slots)
  const nonNullCount = player.hand.filter(c => c !== null).length;
  if (nonNullCount > 9) {
    // Discard from the last slots backward until we're at 9
    for (let i = player.hand.length - 1; i >= 0 && nonNullCount > 9; i--) {
      if (player.hand[i] !== null) {
        const discarded = player.hand[i];
        player.hand[i] = null;
        game.discardPile.push(discarded!);
        // recompute count
        if (player.hand.filter(c => c !== null).length <= 9) break;
      }
    }
  }

  // Check win condition - pass only the actual cards (dense non-null list)
  const denseHand = player.hand.filter((c): c is Card => c !== null);
  if (checkWinCondition(denseHand)) {
    game.winnerId = player.id;
    return { game, player, winnerId: player.id };
  }

  game.turnPhase = 'DRAW';
  return { game, player };
}

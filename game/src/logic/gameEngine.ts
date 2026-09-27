import type { GameState, Player } from '../types';
import { generateDeck, shuffleDeck } from './deck';
import { checkWinCondition, findBestPartition } from './validation';

const INTERRUPT_WINDOW_MS = 30_000;

export function initializeGame(players: Player[]): GameState {
  if (players.length === 0) throw new Error('A game requires at least one player');

  const deck = generateDeck();
  for (const player of players) {
    player.table = [];
    player.hand = [];
    player.sets = [];
    while (player.table.length < 3) {
      const card = deck.pop();
      if (!card) throw new Error('Not enough cards to deal every player');
      if (card.category === 'ACTION') {
        deck.unshift(card);
      } else {
        player.table.push(card);
      }
    }
  }

  return {
    deck,
    discardPile: [],
    activePlayerId: players[Math.floor(Math.random() * players.length)].id,
    turnPhase: 'DRAW',
    winnerId: null
  };
}

export function drawCard(game: GameState, player: Player): { game: GameState; player: Player } {
  if (game.turnPhase !== 'DRAW') throw new Error('Cannot draw card outside of DRAW phase');

  if (game.deck.length === 0 && game.discardPile.length > 0) {
    game.deck = shuffleDeck(game.discardPile);
    game.discardPile = [];
  }

  const card = game.deck.pop();
  if (!card) throw new Error('There are no cards available to draw');

  if (card.category === 'ACTION') {
    player.hand.push(card);
  } else {
    player.table.push(card);
  }

  game.turnPhase = 'MAIN';
  return { game, player };
}

export function playCard(
  game: GameState,
  player: Player,
  cardId: string,
  targetPlayerId?: string,
  targetCardId?: string,
  players?: Record<string, Player>
): { game: GameState; player: Player; pendingAction?: boolean } {
  if (game.turnPhase !== 'MAIN') throw new Error('Cannot play a card outside of MAIN phase');

  const handIndex = player.hand.findIndex((card) => card.id === cardId);
  if (handIndex !== -1) {
    const card = player.hand[handIndex];
    if (card.category !== 'ACTION' || !card.actionType) {
      throw new Error('Only Action cards can be played from your Hand');
    }
    if (card.actionType === 'APPEAL') {
      throw new Error('APPEAL can only be played during an interrupt');
    }
    if (!targetPlayerId || !targetCardId) {
      throw new Error(`${card.actionType} requires a target card`);
    }

    const isSelfAction = card.actionType === 'CONCEAL';
    if (isSelfAction && targetPlayerId !== player.id) {
      throw new Error('CONCEAL can only target one of your own Table cards');
    }
    if (!isSelfAction && targetPlayerId === player.id) {
      throw new Error(`${card.actionType} must target an opponent`);
    }

    const target = isSelfAction ? player : players?.[targetPlayerId];
    if (!target) throw new Error('Target player not found');
    const pendingTarget = target.table.find((tableCard) => tableCard.id === targetCardId);
    if (!pendingTarget) throw new Error('Target card not found on the target Table');
    if (isSelfAction && (!pendingTarget || !pendingTarget.isRevealed)) {
      throw new Error('CONCEAL requires one of your Revealed Table cards');
    }
    if (card.actionType === 'REVEAL' && pendingTarget.isRevealed) {
      throw new Error('REVEAL can only target a Concealed card');
    }

    player.hand.splice(handIndex, 1);
    game.pendingAction = {
      sourcePlayerId: player.id,
      targetPlayerId,
      actionCard: card,
      actionType: card.actionType,
      targetCardId,
      wasBlindTarget: card.actionType === 'REVEAL' || (card.actionType === 'STEAL' && !pendingTarget.isRevealed),
      appealWindowEndsAt: Date.now() + INTERRUPT_WINDOW_MS
    };

    game.turnPhase = 'INTERRUPT';
    return { game, player, pendingAction: true };
  }

  const tableIndex = player.table.findIndex((card) => card.id === cardId);
  if (tableIndex !== -1) {
    const [card] = player.table.splice(tableIndex, 1);
    game.discardPile.push(card);
    return { game, player };
  }

  throw new Error('Card not found in your Hand or Table');
}

export function eligibleAppealPlayers(
  pendingAction: NonNullable<GameState['pendingAction']>,
  players: Record<string, Player>
): Player[] {
  const eligible = pendingAction.actionType === 'CONCEAL'
    ? Object.values(players).filter((player) => player.id !== pendingAction.sourcePlayerId)
    : [players[pendingAction.targetPlayerId]].filter((player): player is Player => Boolean(player));

  return eligible.filter((player) =>
    player.hand.some((card) => card.category === 'ACTION' && card.actionType === 'APPEAL')
  );
}

export function resolveAction(
  game: GameState,
  players: Record<string, Player>
): { game: GameState; players: Record<string, Player> } {
  const pendingAction = game.pendingAction;
  if (!pendingAction) throw new Error('No pending action to resolve');

  const sourcePlayer = players[pendingAction.sourcePlayerId];
  const targetPlayer = players[pendingAction.targetPlayerId];
  if (!sourcePlayer || !targetPlayer) throw new Error('Action references a player who is no longer in the game');

  const targetIndex = targetPlayer.table.findIndex((card) => card.id === pendingAction.targetCardId);
  const targetCard = targetPlayer.table[targetIndex];

  if (pendingAction.actionType === 'CONCEAL' && targetCard) {
    targetCard.isRevealed = false;
  } else if (pendingAction.actionType === 'REVEAL' && targetCard) {
    targetCard.isRevealed = true;
  } else if (pendingAction.actionType === 'STEAL' && targetCard) {
    targetPlayer.table.splice(targetIndex, 1);
    sourcePlayer.table.push(targetCard);
  }

  game.discardPile.push(pendingAction.actionCard);
  game.pendingAction = undefined;
  game.turnPhase = 'MAIN';
  return { game, players };
}

export function playAppeal(
  game: GameState,
  player: Player,
  appealCardId: string,
  players: Record<string, Player>
): { game: GameState; player: Player } {
  const pendingAction = game.pendingAction;
  if (game.turnPhase !== 'INTERRUPT' || !pendingAction) {
    throw new Error('There is no action to appeal');
  }
  if (Date.now() > pendingAction.appealWindowEndsAt) {
    throw new Error('The interrupt window has ended');
  }
  if (!eligibleAppealPlayers(pendingAction, players).some((eligible) => eligible.id === player.id)) {
    throw new Error('You are not eligible to appeal this action or do not hold an APPEAL card');
  }

  const cardIndex = player.hand.findIndex((card) => card.id === appealCardId);
  if (cardIndex === -1 || player.hand[cardIndex].actionType !== 'APPEAL') {
    throw new Error('APPEAL card not found in your Hand');
  }

  const [appealCard] = player.hand.splice(cardIndex, 1);
  game.discardPile.push(appealCard, pendingAction.actionCard);
  game.pendingAction = undefined;
  game.turnPhase = 'MAIN';
  return { game, player };
}

export function endTurn(
  game: GameState,
  player: Player
): { game: GameState; player: Player; winnerId?: string } {
  if (game.turnPhase !== 'MAIN') throw new Error('Cannot end turn outside of MAIN phase');
  if (player.table.length > 9) throw new Error('Discard Table cards until you have no more than 9');

  if (player.table.length === 9 && checkWinCondition(player.table)) {
    game.winnerId = player.id;
    player.sets = findBestPartition(player.table) ?? [];
    return { game, player, winnerId: player.id };
  }

  game.turnPhase = 'DRAW';
  return { game, player };
}

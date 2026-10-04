import type { Card, GameState, Player } from '../types';
import { generateDeck } from './deck';
import { GAME_CONFIG, MAX_STARTABLE_PLAYERS } from './config';
import { hashSeed, nextRandom, shuffleSeeded } from './seededRandom';
import { checkWinCondition, findBestPartition } from './validation';

export function getInterruptDurationMs(): number {
  return GAME_CONFIG.interruptDurationMs;
}

export function initializeGame(
  players: Player[],
  seed: number | string = Date.now(),
  turnDurationMs: number = GAME_CONFIG.defaultTurnDurationMs
): GameState {
  if (players.length === 0) throw new Error('A game requires at least one player');
  if (players.length > MAX_STARTABLE_PLAYERS) {
    throw new Error(`The deck can deal starting cards to at most ${MAX_STARTABLE_PLAYERS} players`);
  }

  const deck = generateDeck(seed);
  let randomSeed = (hashSeed(seed) + 1) >>> 0;
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
        card.isRevealed = true;
        player.table.push(card);
      }
    }
  }

  const firstPlayer = nextRandom(randomSeed);
  randomSeed = firstPlayer.state;
  return {
    deck,
    activePlayerId: players[Math.floor(firstPlayer.value * players.length)].id,
    turnNumber: 0,
    version: 0,
    turnPhase: 'DRAW',
    winnerId: null,
    randomSeed,
    turnDurationMs,
    turnEndsAt: Date.now() + turnDurationMs,
    consecutiveMissedTurns: {},
    forfeitedPlayerIds: []
  };
}

export function drawCard(game: GameState, player: Player): { game: GameState; player: Player } {
  if (game.turnPhase !== 'DRAW') throw new Error('Cannot draw card outside of DRAW phase');

  const card = game.deck.pop();
  if (!card) throw new Error('There are no cards available to draw');

  player.hand.push(card);

  game.turnPhase = 'MAIN';
  return { game, player };
}

export function recycleCardsToDeck(game: GameState, cards: Card[]): void {
  if (cards.length === 0) return;
  const shuffled = shuffleSeeded([...game.deck, ...cards], game.randomSeed);
  game.deck = shuffled.items;
  game.randomSeed = shuffled.seed;
}

export function moveCardToTable(
  game: GameState,
  player: Player,
  cardId: string,
  replaceCardId?: string
): { game: GameState; player: Player } {
  if (game.turnPhase !== 'MAIN') throw new Error('Cannot move a card outside of MAIN phase');
  const handIndex = player.hand.findIndex((card) => card.id === cardId);
  const card = player.hand[handIndex];
  if (handIndex < 0 || card.category === 'ACTION') {
    throw new Error('Only Normal and TEAL cards can be moved from your Hand to your Table');
  }

  if (player.table.length >= 9) {
    if (!replaceCardId) throw new Error('Choose a Table card to swap with');
    const tableIndex = player.table.findIndex((tableCard) => tableCard.id === replaceCardId);
    if (tableIndex < 0) throw new Error('The selected card is not on your Table');
    player.hand[handIndex] = player.table[tableIndex];
    player.table[tableIndex] = card;
  } else {
    if (replaceCardId) throw new Error('A Table card can only be swapped when your Table has 9 cards');
    player.table.push(card);
    player.hand.splice(handIndex, 1);
  }

  return { game, player };
}

export function moveCardToHand(game: GameState, player: Player, cardId: string): { game: GameState; player: Player } {
  if (game.turnPhase !== 'MAIN') throw new Error('Cannot move a card outside of MAIN phase');
  const tableIndex = player.table.findIndex((card) => card.id === cardId);
  if (tableIndex < 0) throw new Error('That card is not on your Table');
  player.hand.push(player.table.splice(tableIndex, 1)[0]);
  return { game, player };
}

export function playCard(
  game: GameState,
  player: Player,
  cardId: string,
  targetPlayerId?: string,
  targetCardId?: string,
  players?: Record<string, Player>,
  resolveAt = Date.now() + GAME_CONFIG.interruptDurationMs
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
    if (card.actionType === 'REVEAL' && !players) {
      throw new Error('REVEAL requires the current player roster');
    }
    if (card.actionType === 'REVEAL' && !Object.values(players ?? {}).some((opponent) =>
      opponent.id !== player.id && opponent.table.some((tableCard) => !tableCard.isRevealed)
    )) {
      throw new Error('REVEAL requires an opponent with a Concealed card');
    }
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
      resolveAt
    };

    game.turnPhase = 'INTERRUPT';
    return { game, player, pendingAction: true };
  }

  const tableIndex = player.table.findIndex((card) => card.id === cardId);
  if (tableIndex !== -1) {
    const [card] = player.table.splice(tableIndex, 1);
    recycleCardsToDeck(game, [card]);
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
    targetCard.isRevealed = true;
    sourcePlayer.table.push(targetCard);
  }

  recycleCardsToDeck(game, [pendingAction.actionCard]);
  if (pendingAction.turnTimeRemainingMs !== undefined) {
    game.turnEndsAt = Date.now() + pendingAction.turnTimeRemainingMs;
  }
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
  if (Date.now() > pendingAction.resolveAt) {
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
  recycleCardsToDeck(game, [appealCard, pendingAction.actionCard]);
  if (pendingAction.turnTimeRemainingMs !== undefined) {
    game.turnEndsAt = Date.now() + pendingAction.turnTimeRemainingMs;
  }
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

  recycleCardsToDeck(game, player.hand.filter((card) => card.category !== 'ACTION'));
  player.hand = player.hand.filter((card) => card.category === 'ACTION');

  if (player.table.length === 9 && checkWinCondition(player.table)) {
    game.winnerId = player.id;
    player.sets = (findBestPartition(player.table) ?? []).map((cards) => ({ cards }));
    return { game, player, winnerId: player.id };
  }

  game.turnPhase = 'DRAW';
  game.turnEndsAt = Date.now() + (game.turnDurationMs ?? GAME_CONFIG.defaultTurnDurationMs);
  return { game, player };
}

export function skipTurn(game: GameState, player: Player): void {
  const normalHandCards = player.hand.filter((card) => card.category !== 'ACTION');
  player.hand = player.hand.filter((card) => card.category === 'ACTION');
  recycleCardsToDeck(game, [...normalHandCards, ...player.table.splice(9)]);
}

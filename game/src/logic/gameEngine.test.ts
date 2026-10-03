import { describe, expect, it } from 'vitest';
import type { Card, GameState, Player } from '../types';
import { drawCard, endTurn, moveCardToHand, moveCardToTable } from './gameEngine';
import { generateDeck } from './deck';
import { checkWinCondition, validateSet } from './validation';

function makeCard(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    category: 'NORMAL',
    isRevealed: false,
    color: 'C0C0FF',
    number: 1,
    shape: 'circle',
    ...overrides
  };
}

function makePlayer(table: Card[] = [], hand: Card[] = []): Player {
  return { id: 'player-1', name: 'Player 1', isHost: true, table, hand, sets: [] };
}

function makeGame(phase: GameState['turnPhase'] = 'MAIN'): GameState {
  return {
    deck: [],
    discardPile: [],
    activePlayerId: 'player-1',
    turnPhase: phase,
    winnerId: null
  };
}

describe('deck generation', () => {
  it('creates 105 Normal, 3 TEAL, and 12 Action cards', () => {
    const deck = generateDeck();
    expect(deck).toHaveLength(120);
    expect(deck.filter((card) => card.category === 'NORMAL')).toHaveLength(105);
    expect(deck.filter((card) => card.category === 'WILD')).toHaveLength(3);
    expect(deck.filter((card) => card.category === 'ACTION')).toHaveLength(12);
    expect(new Set(deck.map((card) => card.id)).size).toBe(120);
  });
});

describe('draw and hand-to-table flow', () => {
  it('puts every drawn card in the Hand before the player chooses where it goes', () => {
    const player = makePlayer();
    const game = makeGame('DRAW');
    const drawn = makeCard('drawn');
    game.deck.push(drawn);

    drawCard(game, player);

    expect(player.hand).toEqual([drawn]);
    expect(player.table).toHaveLength(0);
    expect(game.turnPhase).toBe('MAIN');
  });

  it('moves a Normal or TEAL card from Hand to an open Table slot', () => {
    const card = makeCard('teal', { category: 'WILD', color: '008080', number: undefined, shape: undefined });
    const player = makePlayer([], [card]);

    moveCardToTable(makeGame(), player, card.id);

    expect(player.table).toEqual([card]);
    expect(player.hand).toHaveLength(0);
  });

  it('swaps a hand card with a Table card when the Table is full', () => {
    const replaced = makeCard('replaced');
    const incoming = makeCard('incoming', { category: 'WILD', color: '008080' });
    const table = Array.from({ length: 9 }, (_, index) => makeCard(`table-${index}`));
    table[4] = replaced;
    const player = makePlayer(table, [incoming]);

    moveCardToTable(makeGame(), player, incoming.id, replaced.id);

    expect(player.table[4]).toEqual(incoming);
    expect(player.hand).toEqual([replaced]);
    expect(player.table).toHaveLength(9);
  });

  it('moves a Table card to Hand for end-of-turn discard', () => {
    const discarded = makeCard('discarded');
    const player = makePlayer([discarded]);
    const game = makeGame();

    moveCardToHand(game, player, discarded.id);
    endTurn(game, player);

    expect(player.table).toHaveLength(0);
    expect(player.hand).toHaveLength(0);
    expect(game.discardPile).toEqual([discarded]);
  });

  it('discards every card left in Hand at turn end', () => {
    const normal = makeCard('normal');
    const wild = makeCard('wild', { category: 'WILD', color: '008080' });
    const action = makeCard('action', { category: 'ACTION', actionType: 'APPEAL' });
    const player = makePlayer([], [normal, wild, action]);
    const game = makeGame();

    endTurn(game, player);

    expect(player.hand).toEqual([]);
    expect(game.discardPile).toEqual([normal, wild, action]);
    expect(game.turnPhase).toBe('DRAW');
  });
});

describe('set validation and winning', () => {
  it('allows TEAL wild cards to complete matching-number sets', () => {
    expect(validateSet([
      makeCard('one', { number: 4 }),
      makeCard('two', { number: 4, shape: 'triangle' }),
      makeCard('wild', { category: 'WILD', color: '008080', number: undefined, shape: undefined })
    ])).toBe(true);
  });

  it('records a win using Firestore-safe set objects instead of nested arrays', () => {
    const table = Array.from({ length: 9 }, (_, index) => makeCard(
      `win-${index}`,
      { number: Math.floor(index / 3) + 1, shape: (['circle', 'triangle', 'square'] as const)[index % 3] }
    ));
    expect(checkWinCondition(table)).toBe(true);
    const player = makePlayer(table);
    const game = makeGame();

    const result = endTurn(game, player);

    expect(result.winnerId).toBe(player.id);
    expect(game.winnerId).toBe(player.id);
    expect(player.sets).toHaveLength(3);
    expect(player.sets.every((set) => set.cards.length === 3)).toBe(true);
  });
});

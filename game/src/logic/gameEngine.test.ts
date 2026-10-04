import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { Card, GameState, Player } from '../types';
import { drawCard, endTurn, getInterruptDurationMs, initializeGame, moveCardToHand, moveCardToTable, resolveAction, skipTurn } from './gameEngine';
import { generateDeck } from './deck';
import { GAME_CONFIG, MAX_STARTABLE_PLAYERS } from './config';
import { checkWinCondition, findBestPartition, validateSet } from './validation';

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
    activePlayerId: 'player-1',
    version: 0,
    turnPhase: phase,
    winnerId: null,
    randomSeed: 1,
    turnDurationMs: GAME_CONFIG.defaultTurnDurationMs
  };
}

describe('deck generation', () => {
  it('creates the full 218-card deck with every configured combination and count', () => {
    const deck = generateDeck();
    expect(deck).toHaveLength(218);
    expect(deck.filter((card) => card.category === 'NORMAL')).toHaveLength(175);
    expect(deck.filter((card) => card.category === 'WILD')).toHaveLength(3);
    expect(deck.filter((card) => card.category === 'ACTION')).toHaveLength(40);
    expect(new Set(deck.filter((card) => card.category === 'NORMAL').map((card) => card.color)).size).toBe(5);
    for (const color of GAME_CONFIG.colors) {
      expect(deck.filter((card) => card.category === 'NORMAL' && card.color === color)).toHaveLength(35);
    }
    for (const number of GAME_CONFIG.numbers) {
      expect(deck.filter((card) => card.category === 'NORMAL' && card.number === number)).toHaveLength(25);
    }
    for (const shape of GAME_CONFIG.shapes) {
      expect(deck.filter((card) => card.category === 'NORMAL' && card.shape === shape)).toHaveLength(35);
    }
    for (const actionType of ['CONCEAL', 'STEAL', 'REVEAL', 'APPEAL'] as const) {
      expect(deck.filter((card) => card.actionType === actionType)).toHaveLength(10);
    }
    expect(new Set(deck.map((card) => card.id)).size).toBe(218);
  });

  it('generates identical deck order for identical seeds', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 0xffff_ffff }), (seed) => {
      expect(generateDeck(seed)).toEqual(generateDeck(seed));
    }));
  });

  it('generates different deck orders for distinct seeds', () => {
    expect(generateDeck(1)).not.toEqual(generateDeck(2));
  });

  it('deals three initially revealed Table cards to each player', () => {
    const players = [makePlayer(), { ...makePlayer(), id: 'player-2' }];
    const game = initializeGame(players);
    expect(players.every((player) => player.table.length === 3)).toBe(true);
    expect(players.flatMap((player) => player.table).every((card) => card.isRevealed)).toBe(true);
    expect(game.deck).toHaveLength(212);
  });

  it('supports more than five players up to the deck-based starting deal limit', () => {
    const players = Array.from({ length: 6 }, (_, index) => ({
      ...makePlayer(),
      id: `player-${index + 1}`
    }));
    initializeGame(players, 123);

    expect(players.every((player) => player.table.length === 3)).toBe(true);
    expect(MAX_STARTABLE_PLAYERS).toBe(59);
    expect(() => initializeGame(Array.from({ length: MAX_STARTABLE_PLAYERS + 1 }, (_, index) => ({
      ...makePlayer(),
      id: `player-${index + 1}`
    })), 123)).toThrow(`at most ${MAX_STARTABLE_PLAYERS} players`);
  });
});

describe('draw and hand-to-table flow', () => {
  it('uses a fixed 30-second interrupt window regardless of APPEAL availability', () => {
    expect(getInterruptDurationMs()).toBe(30_000);
  });

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

  it('recycles a Table card moved to Hand when the turn ends', () => {
    const discarded = makeCard('discarded');
    const player = makePlayer([discarded]);
    const game = makeGame();

    moveCardToHand(game, player, discarded.id);
    endTurn(game, player);

    expect(player.table).toHaveLength(0);
    expect(player.hand).toHaveLength(0);
    expect(game.deck).toContain(discarded);
  });

  it('recycles only Normal and Wild cards left in Hand at turn end', () => {
    const normal = makeCard('normal');
    const wild = makeCard('wild', { category: 'WILD', color: '008080' });
    const action = makeCard('action', { category: 'ACTION', actionType: 'APPEAL' });
    const player = makePlayer([], [normal, wild, action]);
    const game = makeGame();

    endTurn(game, player);

    expect(game.deck).toEqual(expect.arrayContaining([normal, wild]));
    expect(game.deck).not.toContain(action);
    expect(player.hand).toEqual([action]);
    expect(game.turnPhase).toBe('DRAW');
  });

  it('skips a disconnected player without removing their seat', () => {
    const player = makePlayer([makeCard('one')], [makeCard('two')]);
    const game = makeGame();
    skipTurn(game, player);
    expect(player.table).toHaveLength(1);
    expect(player.hand).toHaveLength(0);
    expect(game.deck).toHaveLength(1);
  });

  it('pauses the active turn deadline while an interrupt resolves', () => {
    const target = makeCard('target', { isRevealed: true });
    const player = makePlayer([target]);
    const game = makeGame('INTERRUPT');
    game.turnEndsAt = Date.now() - 1;
    game.pendingAction = {
      sourcePlayerId: player.id,
      targetPlayerId: player.id,
      actionCard: makeCard('conceal-action', { category: 'ACTION', actionType: 'CONCEAL' }),
      actionType: 'CONCEAL',
      targetCardId: target.id,
      wasBlindTarget: false,
      resolveAt: Date.now(),
      turnTimeRemainingMs: 30_000
    };

    resolveAction(game, { [player.id]: player });

    expect(game.turnEndsAt).toBeGreaterThan(Date.now() + 29_000);
    expect(target.isRevealed).toBe(false);
  });
});

describe('set validation and winning', () => {
  it.each([0, 1, 2, 3])('supports matching-number sets with %i wild cards', (wildCount) => {
    const normals = Array.from({ length: 3 - wildCount }, (_, index) =>
      makeCard(`num-normal-${wildCount}-${index}`, {
        color: GAME_CONFIG.colors[index],
        number: 4,
        shape: GAME_CONFIG.shapes[index]
      })
    );
    const wilds = Array.from({ length: wildCount }, (_, index) =>
      makeCard(`num-wild-${wildCount}-${index}`, { category: 'WILD', color: '008080', number: undefined, shape: undefined })
    );
    expect(validateSet([...normals, ...wilds])).toBe(true);
  });

  it.each([0, 1, 2, 3])('supports matching-shape sets with %i wild cards', (wildCount) => {
    const normals = Array.from({ length: 3 - wildCount }, (_, index) =>
      makeCard(`shape-normal-${wildCount}-${index}`, {
        color: GAME_CONFIG.colors[index],
        number: index + 1,
        shape: 'pentagon'
      })
    );
    const wilds = Array.from({ length: wildCount }, (_, index) =>
      makeCard(`shape-wild-${wildCount}-${index}`, { category: 'WILD', color: '008080', number: undefined, shape: undefined })
    );
    expect(validateSet([...normals, ...wilds])).toBe(true);
  });

  it('allows TEAL wild cards to complete matching-number sets', () => {
    expect(validateSet([
      makeCard('one', { number: 4 }),
      makeCard('two', { number: 4, shape: 'triangle' }),
      makeCard('wild', { category: 'WILD', color: '008080', number: undefined, shape: undefined })
    ])).toBe(true);
  });

  it('does not let a wild join a non-Teal same-color set', () => {
    expect(validateSet([
      makeCard('grape-one', { color: '884488', number: 1, shape: 'circle' }),
      makeCard('grape-two', { color: '884488', number: 2, shape: 'triangle' }),
      makeCard('wild-grape-attempt', { category: 'WILD', color: '008080', number: undefined, shape: undefined })
    ])).toBe(false);
  });

  it('checks a non-obvious partition across interleaved valid sets', () => {
    const table = [
      makeCard('n1-a', { number: 1, shape: 'circle', color: 'C0C0FF' }),
      makeCard('n2-a', { number: 2, shape: 'circle', color: '884488' }),
      makeCard('p-a', { number: 3, shape: 'pentagon', color: 'C0C0FF' }),
      makeCard('n1-b', { number: 1, shape: 'square', color: 'C06060' }),
      makeCard('n2-b', { number: 2, shape: 'square', color: '404088' }),
      makeCard('p-b', { number: 4, shape: 'pentagon', color: '884488' }),
      makeCard('n1-c', { number: 1, shape: 'triangle', color: '008080' }),
      makeCard('n2-c', { number: 2, shape: 'triangle', color: 'C06060' }),
      makeCard('p-c', { number: 5, shape: 'pentagon', color: '404088' })
    ];
    const partition = findBestPartition(table);
    expect(partition).not.toBeNull();
    expect(partition).toHaveLength(3);
    expect(partition?.flatMap((set) => set.map((card) => card.id)).sort()).toEqual(table.map((card) => card.id).sort());
    expect(partition?.every(validateSet)).toBe(true);
  });

  it('rejects a near-miss table that has no partition', () => {
    const table = Array.from({ length: 9 }, (_, index) =>
      makeCard(`near-${index}`, {
        color: GAME_CONFIG.colors[index % GAME_CONFIG.colors.length],
        number: (index % 7) + 1,
        shape: GAME_CONFIG.shapes[index % GAME_CONFIG.shapes.length]
      })
    );
    expect(checkWinCondition(table)).toBe(false);
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

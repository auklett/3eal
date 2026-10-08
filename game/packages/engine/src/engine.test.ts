import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ACTIONS, COLORS, DECK_SIZE, NUMBERS, createDeck, createSeededRandom, findWinningPartition, hasWon, isValidSet, MAX_INTERRUPT_DURATION_MS, openInterrupt, respondToInterrupt, expireInterrupt, type Card, type Color, type NumberValue, type Shape, type TableCard } from './index';

function normalCard(id: string, color: Color, number: NumberValue, shape: Shape): Card {
  return { id, kind: 'normal', color, number, shape };
}

function independentWinCheck(cards: readonly Card[]): boolean {
  if (cards.length !== 9) return false;
  const visit = (remaining: readonly TableCard[]): boolean => {
    if (remaining.length === 0) return true;
    const [first, ...rest] = remaining;
    for (let left = 0; left < rest.length - 1; left += 1) {
      for (let right = left + 1; right < rest.length; right += 1) {
        const set = [first, rest[left], rest[right]];
        if (!isValidSet(set)) continue;
        const used = new Set(set.map((card) => card.id));
        if (visit(remaining.filter((card) => !used.has(card.id)))) return true;
      }
    }
    return false;
  };
  return cards.every((card) => card.kind !== 'action') && visit(cards as TableCard[]);
}

describe('seeded deck generation', () => {
  it('creates the exact 218-card deck with opaque, unique ids', () => {
    const deck = createDeck(createSeededRandom('test-seed'));
    expect(deck).toHaveLength(DECK_SIZE);
    expect(DECK_SIZE).toBe(218);
    expect(deck.filter((card) => card.kind === 'normal')).toHaveLength(175);
    expect(deck.filter((card) => card.kind === 'teal')).toHaveLength(3);
    for (const action of ACTIONS) {
      expect(deck.filter((card) => card.kind === 'action' && card.action === action)).toHaveLength(10);
    }
    expect(new Set(deck.map((card) => card.id)).size).toBe(DECK_SIZE);
    expect(deck.every((card) => /^[0-9a-f]{32}$/.test(card.id))).toBe(true);
    expect(new Set(deck.filter((card) => card.kind === 'normal').map((card) => `${card.color}/${card.number}/${card.shape}`)).size).toBe(175);
  });

  it('is reproducible for a seed while producing different games for different seeds', () => {
    expect(createDeck(createSeededRandom('same'))).toEqual(createDeck(createSeededRandom('same')));
    expect(createDeck(createSeededRandom('same'))).not.toEqual(createDeck(createSeededRandom('different')));
  });

  it('includes each of the five configured colors', () => {
    const deck = createDeck(createSeededRandom('colors'));
    expect(new Set(deck.filter((card) => card.kind === 'normal').map((card) => card.color))).toEqual(new Set(COLORS));
  });
});

describe('sets and win partitions', () => {
  it('allows TEAL to adopt a number or shape but only has its fixed Teal color', () => {
    const matchingNumber = [
      normalCard('a', 'rose', 4, 'circle'),
      normalCard('b', 'grape', 4, 'square'),
      { id: 'wild', kind: 'teal' } as const
    ];
    const matchingShape = [
      normalCard('c', 'periwinkle', 1, 'hexagon'),
      normalCard('d', 'frenchBlue', 7, 'hexagon'),
      { id: 'wild2', kind: 'teal' } as const
    ];
    const colorOnly = [
      normalCard('e', 'teal', 1, 'circle'),
      { id: 'wild3', kind: 'teal' } as const,
      { id: 'wild4', kind: 'teal' } as const
    ];
    expect(isValidSet(matchingNumber)).toBe(true);
    expect(isValidSet(matchingShape)).toBe(true);
    expect(isValidSet(colorOnly)).toBe(true);
    expect(isValidSet([
      normalCard('f', 'periwinkle', 1, 'circle'),
      normalCard('g', 'rose', 2, 'triangle'),
      { id: 'wild5', kind: 'teal' }
    ])).toBe(false);
  });

  it('returns a partition into three valid sets when the cards win', () => {
    const cards = [
      normalCard('a', 'periwinkle', 1, 'circle'),
      normalCard('b', 'periwinkle', 2, 'triangle'),
      normalCard('c', 'periwinkle', 7, 'hexagon'),
      normalCard('d', 'teal', 1, 'square'),
      normalCard('e', 'rose', 1, 'pentagon'),
      { id: 'wild-a', kind: 'teal' } as const,
      normalCard('f', 'grape', 5, 'circle'),
      normalCard('g', 'frenchBlue', 6, 'circle'),
      normalCard('h', 'rose', 3, 'circle')
    ];
    const partition = findWinningPartition(cards);
    expect(partition).not.toBeNull();
    expect(partition).toHaveLength(3);
    expect(partition?.every(isValidSet)).toBe(true);
    expect(new Set(partition?.flat().map((card) => card.id)).size).toBe(9);
    expect(hasWon(cards)).toBe(true);
  });

  it('matches an independent partition search across generated nine-card tables', () => {
    const colorArb = fc.constantFrom(...COLORS);
    const shapeArb = fc.constantFrom('circle', 'triangle', 'square', 'pentagon', 'hexagon');
    const cardArb = fc.oneof(
      fc.record({
        kind: fc.constant<'normal'>('normal'),
        color: colorArb,
        number: fc.constantFrom(...NUMBERS),
        shape: shapeArb
      }),
      fc.constant({ kind: 'teal' as const })
    );
    fc.assert(fc.property(fc.array(cardArb, { minLength: 9, maxLength: 9 }), (cards) => {
      const identified = cards.map((card, index) => ({ ...card, id: `card-${index}` })) as Card[];
      expect(hasWon(identified)).toBe(independentWinCheck(identified));
    }), { numRuns: 250 });
  });
});

describe('interrupt transitions', () => {
  const action = { id: 'interrupt-1', kind: 'STEAL' as const, actorId: 'a', targetId: 'b', targetCardId: 'slot-1' };
  const appeal = { id: 'appeal-1', kind: 'action' as const, action: 'APPEAL' as const };

  it('opens for at most 30 seconds and expires without an appeal', () => {
    const result = openInterrupt(action, [{ id: 'a', hand: [] }, { id: 'b', hand: [appeal] }], 1000);
    expect(result.status).toBe('open');
    if (result.status !== 'open') return;
    expect(result.interrupt.endsAt).toBe(1000 + MAX_INTERRUPT_DURATION_MS);
    expect(expireInterrupt(result.interrupt, result.interrupt.endsAt)).toEqual({ status: 'resolved', reason: 'all-passed' });
  });

  it('auto-resolves when no eligible player holds APPEAL', () => {
    expect(openInterrupt(action, [{ id: 'a', hand: [appeal] }, { id: 'b', hand: [] }], 0))
      .toEqual({ status: 'resolved', reason: 'no-appeal-available' });
  });

  it('only waits for the targeted player on STEAL and REVEAL', () => {
    const result = openInterrupt(action, [
      { id: 'a', hand: [appeal] },
      { id: 'b', hand: [appeal] },
      { id: 'c', hand: [appeal] }
    ], 0);
    expect(result.status).toBe('open');
    if (result.status === 'open') expect(result.interrupt.responderIds).toEqual(['b']);
  });

  it('allows any opponent to appeal CONCEAL and ends on the first appeal', () => {
    const conceal = { ...action, kind: 'CONCEAL' as const, targetId: 'a' };
    const result = openInterrupt(conceal, [
      { id: 'a', hand: [appeal] },
      { id: 'b', hand: [appeal] },
      { id: 'c', hand: [appeal] }
    ], 0);
    expect(result.status).toBe('open');
    if (result.status !== 'open') return;
    expect(result.interrupt.responderIds).toEqual(['b', 'c']);
    expect(respondToInterrupt(result.interrupt, 'b', 'appeal', 1))
      .toEqual({ status: 'resolved', reason: 'appealed', appealedBy: 'b' });
  });

  it('closes after all APPEAL holders pass and rejects ineligible responses', () => {
    const result = openInterrupt({ ...action, kind: 'CONCEAL' }, [
      { id: 'a', hand: [] },
      { id: 'b', hand: [appeal] },
      { id: 'c', hand: [appeal] }
    ], 0);
    expect(result.status).toBe('open');
    if (result.status !== 'open') return;
    const firstPass = respondToInterrupt(result.interrupt, 'b', 'pass', 1);
    expect(firstPass.status).toBe('open');
    if (firstPass.status !== 'open') return;
    expect(() => respondToInterrupt(firstPass.interrupt, 'a', 'pass', 2)).toThrow();
    expect(respondToInterrupt(firstPass.interrupt, 'c', 'pass', 2))
      .toEqual({ status: 'resolved', reason: 'all-passed' });
  });
});

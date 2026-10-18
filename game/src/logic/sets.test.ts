import { describe, expect, it } from 'vitest';
import type { Card, Color, Shape } from '@3eal/engine';
import { completeSetCardIds, completeSetGroups } from './sets';

function normal(id: string, color: Color, number: 1 | 2 | 3 | 4 | 5 | 6 | 7, shape: Shape): Card {
  return { id, kind: 'normal', color, number, shape };
}

describe('complete set highlighting', () => {
  it('finds a single three-card set below nine cards', () => {
    const cards: Card[] = [
      normal('a', 'rose', 1, 'circle'),
      normal('b', 'rose', 2, 'triangle'),
      normal('c', 'rose', 3, 'square'),
      normal('d', 'grape', 5, 'hexagon')
    ];
    const groups = completeSetGroups(cards);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((card) => card.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('uses the engine partition for a full nine-card table', () => {
    const cards: Card[] = [
      normal('a1', 'rose', 1, 'circle'),
      normal('a2', 'rose', 4, 'pentagon'),
      normal('a3', 'rose', 7, 'square'),
      normal('b1', 'grape', 2, 'circle'),
      normal('b2', 'grape', 2, 'triangle'),
      normal('b3', 'grape', 2, 'hexagon'),
      normal('c1', 'teal', 3, 'circle'),
      normal('c2', 'teal', 3, 'triangle'),
      normal('c3', 'teal', 3, 'square')
    ];
    const groups = completeSetGroups(cards);
    expect(groups).toHaveLength(3);
    expect(completeSetCardIds(cards).size).toBe(9);
  });

  it('ignores action cards and returns no groups when nothing matches', () => {
    const cards: Card[] = [
      normal('a', 'rose', 1, 'circle'),
      normal('b', 'grape', 2, 'triangle'),
      normal('c', 'teal', 3, 'square'),
      { id: 'x', kind: 'action', action: 'STEAL' }
    ];
    expect(completeSetGroups(cards)).toEqual([]);
    expect(completeSetCardIds(cards).size).toBe(0);
  });
});

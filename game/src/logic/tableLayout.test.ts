import { describe, expect, it } from 'vitest';
import { mergeTableLayout, moveOrSwap, placeInLayout, serverSlotForVisual, tableCardIds, type TableLayout } from './tableLayout';
import type { PublicSlot } from '../shared/protocol';

function concealed(...ids: string[]): PublicSlot[] {
  return ids.map((cardId) => ({ state: 'concealed' as const, cardId }));
}

describe('local Table layout', () => {
  it('keeps each card in its slot and never resets on a new snapshot', () => {
    const layout = mergeTableLayout(null, ['a', 'b', 'c']);
    expect(layout.slice(0, 4)).toEqual(['a', 'b', 'c', null]);

    // User moves card `a` to slot 7, then a snapshot with the same cards arrives.
    const rearranged = moveOrSwap(layout, 0, 7);
    const merged = mergeTableLayout(rearranged, ['a', 'b', 'c']);
    expect(merged[7]).toBe('a');
    expect(merged[0]).toBeNull();
    expect(merged).toEqual(rearranged);
  });

  it('removes cards that no longer exist and fills new cards into the first empty slot', () => {
    const layout = mergeTableLayout(null, ['a', 'b', 'c']);
    const merged = mergeTableLayout(layout, ['a', 'c', 'd']);
    expect(merged.includes('b')).toBe(false);
    expect(merged[0]).toBe('a');
    expect(merged[1]).toBe('d');
    expect(merged[2]).toBe('c');
  });

  it('honours a preferred slot for a newly placed hand card', () => {
    const layout: TableLayout = ['a', 'b', 'c', ...Array(6).fill(null)];
    const merged = mergeTableLayout(layout, ['a', 'b', 'c', 'new'], { cardId: 'new', slot: 5 });
    expect(merged[5]).toBe('new');
    expect(merged[3]).toBeNull();
  });

  it('moves onto an empty slot and swaps with an occupied one', () => {
    const layout: TableLayout = ['a', 'b', 'c', ...Array(6).fill(null)];
    expect(moveOrSwap(layout, 0, 7)[7]).toBe('a');
    expect(moveOrSwap(layout, 0, 7)[0]).toBeNull();
    const swapped = moveOrSwap(layout, 0, 1);
    expect(swapped[0]).toBe('b');
    expect(swapped[1]).toBe('a');
  });

  it('places optimistically, shifting an occupant when the table is not full', () => {
    const layout: TableLayout = ['a', 'b', ...Array(7).fill(null)];
    const placed = placeInLayout(layout, 0, 'new', false);
    expect(placed[0]).toBe('new');
    expect(placed.includes('a')).toBe(true);
  });

  it('maps a visual slot to the server slot for insert and swap semantics', () => {
    const layout: TableLayout = ['c', 'a', 'b', ...Array(6).fill(null)];
    const serverIds = ['a', 'b', 'c'];
    // Below nine cards the server inserts at the count of preceding cards.
    expect(serverSlotForVisual(layout, serverIds, 0, false)).toBe(0);
    expect(serverSlotForVisual(layout, serverIds, 2, false)).toBe(2);
    // A full table swaps, so we send the index of the displayed card.
    const fullLayout: TableLayout = ['c', 'a', 'b', 'd', 'e', 'f', 'g', 'h', 'i'];
    expect(serverSlotForVisual(fullLayout, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], 0, true)).toBe(2);
  });

  it('reads card ids from public slots without leaking identities', () => {
    expect(tableCardIds([
      { state: 'concealed', cardId: 'x' },
      { state: 'revealed', card: { id: 'y', kind: 'teal' } }
    ])).toEqual(['x', 'y']);
    expect(tableCardIds(concealed('a', 'b'))).toEqual(['a', 'b']);
  });
});

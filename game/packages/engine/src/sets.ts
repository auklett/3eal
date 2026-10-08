import type { Card, Set, TableCard } from './types';

export function isValidSet(cards: readonly Card[]): cards is Set {
  if (cards.length !== 3 || cards.some((card) => card.kind === 'action')) return false;
  const tableCards = cards as TableCard[];

  const colors = tableCards.map((card) => card.kind === 'teal' ? 'teal' : card.color);
  if (colors.every((color) => color === colors[0])) return true;

  const numberedCards = tableCards.filter((card) => card.kind === 'normal');
  if (numberedCards.length < 2 || numberedCards.every((card) => card.number === numberedCards[0].number)) return true;

  const shapedCards = tableCards.filter((card) => card.kind === 'normal');
  return shapedCards.length < 2 || shapedCards.every((card) => card.shape === shapedCards[0].shape);
}

function choosePairs<T>(values: readonly T[]): Array<[T, T]> {
  const pairs: Array<[T, T]> = [];
  for (let first = 0; first < values.length - 1; first += 1) {
    for (let second = first + 1; second < values.length; second += 1) {
      pairs.push([values[first], values[second]]);
    }
  }
  return pairs;
}

/** Searches the 280 unique three-set partitions possible for a nine-card table. */
export function findWinningPartition(cards: readonly Card[]): Set[] | null {
  if (cards.length !== 9 || cards.some((card) => card.kind === 'action')) return null;

  const partition = (remaining: TableCard[]): Set[] | null => {
    if (remaining.length === 0) return [];
    const [first, ...rest] = remaining;
    for (const [left, right] of choosePairs(rest)) {
      const candidate = [first, left, right];
      if (!isValidSet(candidate)) continue;
      const used = new Set(candidate.map((card) => card.id));
      const next = partition(remaining.filter((card) => !used.has(card.id)));
      if (next) return [candidate, ...next];
    }
    return null;
  };

  return partition(cards as TableCard[]);
}

export function hasWon(cards: readonly Card[]): boolean {
  return findWinningPartition(cards) !== null;
}

export function countCompleteSets(cards: readonly Card[]): number {
  if (cards.some((card) => card.kind === 'action')) return 0;

  const count = (remaining: TableCard[]): number => {
    if (remaining.length < 3) return 0;
    const [first, ...rest] = remaining;
    let best = count(rest);
    for (const [left, right] of choosePairs(rest)) {
      const candidate = [first, left, right];
      if (!isValidSet(candidate)) continue;
      const used = new Set(candidate.map((card) => card.id));
      best = Math.max(best, 1 + count(remaining.filter((card) => !used.has(card.id))));
    }
    return best;
  };

  return count(cards as TableCard[]);
}

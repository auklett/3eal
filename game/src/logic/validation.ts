import type { Card } from '../types';

export function validateSet(cards: Card[]): boolean {
  if (cards.length !== 3 || cards.some((card) => card.category === 'ACTION')) return false;

  return isSameColor(cards) || isSameNumber(cards) || isSameShape(cards);
}

function isSameColor(cards: Card[]): boolean {
  const colors = cards.map((card) => card.category === 'WILD' ? '008080' : card.color);
  return colors.every((color) => color !== undefined && color === colors[0]);
}

function isSameNumber(cards: Card[]): boolean {
  const numbers = cards.filter((card) => card.category !== 'WILD').map((card) => card.number);
  return numbers.every((number) => number !== undefined && number === numbers[0]);
}

function isSameShape(cards: Card[]): boolean {
  const shapes = cards.filter((card) => card.category !== 'WILD').map((card) => card.shape);
  return shapes.every((shape) => shape !== undefined && shape === shapes[0]);
}

function combinations(cards: Card[], size: number): Card[][] {
  if (size === 0) return [[]];
  if (cards.length < size) return [];

  const [first, ...rest] = cards;
  return [
    ...combinations(rest, size - 1).map((combination) => [first, ...combination]),
    ...combinations(rest, size)
  ];
}

export function findBestPartition(cards: Card[]): Card[][] | null {
  if (cards.length !== 9) return null;
  const [first, ...rest] = cards;

  for (const pair of combinations(rest, 2)) {
    const setOne = [first, ...pair];
    if (!validateSet(setOne)) continue;
    const setOneIds = new Set(setOne.map((card) => card.id));
    const afterFirst = cards.filter((card) => !setOneIds.has(card.id));
    for (const setTwo of combinations(afterFirst, 3)) {
      if (!validateSet(setTwo)) continue;
      const setTwoIds = new Set(setTwo.map((card) => card.id));
      const setThree = afterFirst.filter((card) => !setTwoIds.has(card.id));
      if (validateSet(setThree)) {
        return [setOne, setTwo, setThree];
      }
    }
  }
  return null;
}

export function checkWinCondition(cards: Card[]): boolean {
  return findBestPartition(cards) !== null;
}

export function completeSetCount(cards: Card[]): number {
  const search = (remaining: Card[]): number => {
    if (remaining.length < 3) return 0;
    const [first, ...rest] = remaining;
    let best = search(rest);

    for (const pair of combinations(rest, 2)) {
      const candidate = [first, ...pair];
      if (!validateSet(candidate)) continue;
      const usedIds = new Set(candidate.map((card) => card.id));
      const leftover = remaining.filter((card) => !usedIds.has(card.id));
      best = Math.max(best, 1 + search(leftover));
    }
    return best;
  };

  return search(cards);
}

import { findWinningPartition, isValidSet, type Card, type TableCard } from '@3eal/engine';

/** True when a card can legally live on a Table (i.e. not an Action card). */
function isTableCard(card: Card): card is TableCard {
  return card.kind !== 'action';
}

/**
 * Groups the viewer's Table cards into complete valid sets for a soft visual
 * highlight. A full nine-card Table uses the engine's authoritative partition
 * helper; any other size falls back to a greedy disjoint search built on the
 * engine's `isValidSet`. This never mutates engine state.
 */
export function completeSetGroups(cards: readonly Card[]): TableCard[][] {
  const tableCards = cards.filter(isTableCard);

  if (tableCards.length === 9) {
    const partition = findWinningPartition(tableCards);
    if (partition) return partition.map((group) => [...group]);
  }

  const groups: TableCard[][] = [];
  const remaining = [...tableCards];
  while (remaining.length >= 3) {
    const first = remaining.shift() as TableCard;
    let matched = false;
    for (let left = 0; left < remaining.length - 1 && !matched; left += 1) {
      for (let right = left + 1; right < remaining.length && !matched; right += 1) {
        const candidate = [first, remaining[left], remaining[right]];
        if (!isValidSet(candidate)) continue;
        groups.push(candidate);
        remaining.splice(right, 1);
        remaining.splice(left, 1);
        matched = true;
      }
    }
  }
  return groups;
}

/** The IDs of every card that belongs to a completed set. */
export function completeSetCardIds(cards: readonly Card[]): Set<string> {
  const ids = new Set<string>();
  for (const group of completeSetGroups(cards)) {
    for (const card of group) ids.add(card.id);
  }
  return ids;
}

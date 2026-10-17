import type { PublicSlot } from '../shared/protocol';

/**
 * A local, presentation-only mapping of Table slot index -> card ID. It is
 * keyed by card ID (never by array index) so incoming server snapshots cannot
 * wipe a player's chosen arrangement.
 */
export type TableLayout = (string | null)[];

export function tableCardIds(slots: readonly PublicSlot[]): string[] {
  return slots.map((slot) => (slot.state === 'revealed' ? slot.card.id : slot.cardId));
}

/**
 * Merges the authoritative set of Table card IDs into the local layout:
 * - cards that no longer exist are removed;
 * - cards that persist keep their slot;
 * - new cards land in `preferred.slot` when it is free, otherwise the first
 *   empty slot.
 * The layout is never reset to the server order.
 */
export function mergeTableLayout(
  previous: TableLayout | null,
  cardIds: readonly string[],
  preferred?: { cardId: string; slot: number } | null
): TableLayout {
  const size = Math.max(9, cardIds.length);
  const next: TableLayout = [];
  for (let index = 0; index < size; index += 1) {
    next.push(previous?.[index] ?? null);
  }

  const present = new Set(cardIds);
  const seen = new Set<string>();
  for (let index = 0; index < next.length; index += 1) {
    const id = next[index];
    if (id === null) continue;
    if (!present.has(id) || seen.has(id)) next[index] = null;
    else seen.add(id);
  }

  for (const id of cardIds) {
    if (next.includes(id)) continue;
    let slot = -1;
    if (preferred && preferred.cardId === id && preferred.slot >= 0 && preferred.slot < next.length && next[preferred.slot] === null) {
      slot = preferred.slot;
    }
    if (slot === -1) slot = next.indexOf(null);
    if (slot === -1) {
      next.push(id);
      continue;
    }
    next[slot] = id;
  }

  return next;
}

/** Moves `from` onto `to`, swapping contents (an empty target leaves a hole). */
export function moveOrSwap(layout: TableLayout, from: number, to: number): TableLayout {
  if (from === to || from < 0 || to < 0 || from >= layout.length || to >= layout.length) return layout;
  const next = [...layout];
  const target = next[to] ?? null;
  next[to] = next[from] ?? null;
  next[from] = target;
  return next;
}

/**
 * Optimistic local placement of a freshly placed Hand card. When the Table is
 * full the target slot is overwritten (a server-side swap); otherwise any
 * occupant shifts to the first free slot.
 */
export function placeInLayout(layout: TableLayout, slot: number, cardId: string, full: boolean): TableLayout {
  const size = Math.max(layout.length, 9);
  const next: TableLayout = [];
  for (let index = 0; index < size; index += 1) next.push(layout[index] ?? null);
  if (slot < 0 || slot >= next.length) return next;
  const occupant = next[slot];
  next[slot] = cardId;
  if (full || !occupant || occupant === cardId) return next;
  const hole = next.findIndex((value, index) => index !== slot && value === null);
  if (hole === -1) next.push(occupant);
  else next[hole] = occupant;
  return next;
}

/**
 * Converts a visual slot index into the slot index the server expects for a
 * place/toHand intent. When the Table is full the server swaps by index, so we
 * send the index of the card displayed in that slot; below nine cards the
 * server inserts, so we send the count of authoritative cards shown before it.
 */
export function serverSlotForVisual(
  layout: TableLayout,
  serverIds: readonly string[],
  visualSlot: number,
  full: boolean
): number {
  if (full) {
    const id = layout[visualSlot];
    const index = id ? serverIds.indexOf(id) : -1;
    return index === -1 ? 0 : index;
  }
  let count = 0;
  for (let index = 0; index < visualSlot && index < layout.length; index += 1) {
    const id = layout[index];
    if (id && serverIds.includes(id)) count += 1;
  }
  return Math.min(count, serverIds.length);
}

import type { CardCategory } from '../types';

export const TEAL_RING = '#008080';
export const WHITE_RING = '#FFFFFF';

/**
 * The color of the single selection/drag ring. A white ring is invisible on a
 * white Action card and on the light Periwinkle (`C0C0FF`) card, so both use
 * teal instead. Every other card (TEAL wild, Rose, Grape Soda, French Blue, and
 * the dark face-down back) reads clearly against white.
 */
export function selectionRingColor(category: CardCategory, color?: string): string {
  if (category === 'ACTION') return TEAL_RING;
  if (category === 'NORMAL' && color === 'C0C0FF') return TEAL_RING;
  return WHITE_RING;
}

/**
 * The exact box-shadow used for selection and drag: a single 4px spread ring,
 * one layer only, so a selected card never shows two outlines.
 */
export function selectionRingShadow(category: CardCategory, color?: string): string {
  return `0 0 0 4px ${selectionRingColor(category, color)}`;
}

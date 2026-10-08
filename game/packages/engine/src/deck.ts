import { ACTIONS, COLORS, NUMBERS, SHAPES, type Card, type RandomSource } from './types';
import { randomId, shuffle } from './random';

export const NORMAL_CARD_COUNT = 175;
export const TEAL_CARD_COUNT = 3;
export const ACTION_COPIES = 10;
export const DECK_SIZE = NORMAL_CARD_COUNT + TEAL_CARD_COUNT + ACTIONS.length * ACTION_COPIES;

export function createDeck(random: RandomSource): Card[] {
  const cards: Card[] = [];

  for (const color of COLORS) {
    for (const number of NUMBERS) {
      for (const shape of SHAPES) {
        cards.push({ id: randomId(random), kind: 'normal', color, number, shape });
      }
    }
  }

  for (let copy = 0; copy < TEAL_CARD_COUNT; copy += 1) {
    cards.push({ id: randomId(random), kind: 'teal' });
  }

  for (const action of ACTIONS) {
    for (let copy = 0; copy < ACTION_COPIES; copy += 1) {
      cards.push({ id: randomId(random), kind: 'action', action });
    }
  }

  return shuffle(cards, random);
}

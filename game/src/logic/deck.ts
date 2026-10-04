import type { ActionType, Card } from '../types';
import { GAME_CONFIG } from './config';
import { hashSeed, shuffleSeeded } from './seededRandom';

const ACTION_TYPES: ActionType[] = ['CONCEAL', 'STEAL', 'REVEAL', 'APPEAL'];
const ACTION_DETAILS: Record<ActionType, { title: string; description: string }> = {
  CONCEAL: {
    title: 'CONCEAL',
    description: 'Hide one of your own revealed cards from opponents'
  },
  STEAL: {
    title: 'STEAL',
    description: 'Take a Normal or TEAL card from an opponent\'s table'
  },
  REVEAL: {
    title: 'REVEAL',
    description: 'Force an opponent to reveal a concealed card'
  },
  APPEAL: {
    title: 'APPEAL',
    description: 'Block an opponent\'s CONCEAL, STEAL, or REVEAL action'
  }
};

export function generateDeck(seed: number | string = Date.now()): Card[] {
  let cardCounter = 0;
  const deck: Card[] = [];

  for (const color of GAME_CONFIG.colors) {
    for (const number of GAME_CONFIG.numbers) {
      for (const shape of GAME_CONFIG.shapes) {
        deck.push({
          id: `card_${String(cardCounter++).padStart(3, '0')}`,
          category: 'NORMAL',
          isRevealed: false,
          color,
          number,
          shape
        });
      }
    }
  }

  for (let i = 0; i < GAME_CONFIG.wildCards; i++) {
    deck.push({
      id: `card_${String(cardCounter++).padStart(3, '0')}`,
      category: 'WILD',
      isRevealed: false,
      color: '008080',
      number: undefined,
      shape: undefined,
      title: 'TEAL',
      description: 'Wild card - flexible number and shape'
    });
  }

  for (const actionType of ACTION_TYPES) {
    for (let i = 0; i < GAME_CONFIG.actionCopies; i++) {
      deck.push({
        id: `card_${String(cardCounter++).padStart(3, '0')}`,
        category: 'ACTION',
        isRevealed: false,
        actionType,
        title: ACTION_DETAILS[actionType].title,
        description: ACTION_DETAILS[actionType].description
      });
    }
  }

  return shuffleSeeded(deck, hashSeed(seed)).items;
}

export const shuffleDeck = (deck: Card[], seed: number = Date.now()): Card[] =>
  shuffleSeeded(deck, hashSeed(seed)).items;

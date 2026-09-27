import type { Card, CardColor, CardShape, ActionType } from '../types';

const COLORS: CardColor[] = ['C0C0FF', '008080', 'C06060'];
const NUMBERS = [1, 2, 3, 4, 5, 6, 7];
const SHAPES: CardShape[] = ['circle', 'triangle', 'square', 'pentagon', 'hexagon'];

const ACTION_TYPES: ActionType[] = ['CONCEAL', 'STEAL', 'REVEAL', 'APPEAL'];
const ACTION_DETAILS: Record<ActionType, { title: string; description: string }> = {
  CONCEAL: {
    title: 'CONCEAL',
    description: 'Hide one of your own revealed cards from opponents'
  },
  STEAL: {
    title: 'STEAL',
    description: 'Take a normal card from an opponent\'s table'
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

let cardCounter = 0;

export function generateDeck(): Card[] {
  cardCounter = 0;
  const deck: Card[] = [];

  for (const color of COLORS) {
    for (const number of NUMBERS) {
      for (const shape of SHAPES) {
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

  for (let i = 0; i < 3; i++) {
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
    for (let i = 0; i < 3; i++) {
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

  return shuffleDeck(deck);
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

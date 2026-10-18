import { COLOR_HEX, type Color } from '@3eal/engine';
import type { ActionType, Card as UiCard, CardShape } from '../types';

/**
 * Static, non-interactive example cards for the Rules overlay. Every example
 * shares ONLY the trait it is illustrating, so it can never be read two ways.
 */

function normal(id: string, color: Color, number: number, shape: CardShape): UiCard {
  return { id, category: 'NORMAL', isRevealed: false, color: COLOR_HEX[color], number, shape };
}

function teal(id: string): UiCard {
  return { id, category: 'WILD', isRevealed: false, color: COLOR_HEX.teal, title: 'TEAL', description: 'Wild card' };
}

function action(id: string, kind: ActionType, title: string, description: string): UiCard {
  return { id, category: 'ACTION', isRevealed: false, actionType: kind, title, description };
}

/** Section 1: a mini 3×3 Table whose three rows are three complete sets. */
export const goalRows: UiCard[][] = [
  [
    normal('goal-r1c1', 'rose', 1, 'circle'),
    normal('goal-r1c2', 'rose', 3, 'square'),
    normal('goal-r1c3', 'rose', 5, 'pentagon')
  ],
  [
    normal('goal-r2c1', 'periwinkle', 5, 'circle'),
    normal('goal-r2c2', 'frenchBlue', 5, 'triangle'),
    normal('goal-r2c3', 'grape', 5, 'hexagon')
  ],
  [
    normal('goal-r3c1', 'rose', 2, 'hexagon'),
    normal('goal-r3c2', 'grape', 6, 'hexagon'),
    normal('goal-r3c3', 'periwinkle', 7, 'hexagon')
  ]
];

export interface SetExample {
  id: string;
  /** The text chip naming the shared trait — always present, never colour-only. */
  trait: string;
  cards: UiCard[];
  /** Spoken description of the pattern. */
  ariaLabel: string;
  /** The "nothing matches" counter-example gets a red cross instead of a mark. */
  notASet?: boolean;
}

/** Section 2: one panel per valid pattern, plus one unambiguous non-set. */
export const setExamples: SetExample[] = [
  {
    id: 'same-color',
    trait: 'All Rose',
    ariaLabel: 'Same colour set: three Rose cards with different shapes and numbers',
    cards: [
      normal('set-color-1', 'rose', 1, 'circle'),
      normal('set-color-2', 'rose', 4, 'triangle'),
      normal('set-color-3', 'rose', 7, 'hexagon')
    ]
  },
  {
    id: 'same-number',
    trait: 'All 5',
    ariaLabel: 'Same number set: three 5s with different colours and shapes',
    cards: [
      normal('set-number-1', 'periwinkle', 5, 'circle'),
      normal('set-number-2', 'grape', 5, 'square'),
      normal('set-number-3', 'frenchBlue', 5, 'pentagon')
    ]
  },
  {
    id: 'same-shape',
    trait: 'All pentagons',
    ariaLabel: 'Same shape set: three pentagons with different colours and numbers',
    cards: [
      normal('set-shape-1', 'periwinkle', 2, 'pentagon'),
      normal('set-shape-2', 'rose', 5, 'pentagon'),
      normal('set-shape-3', 'grape', 7, 'pentagon')
    ]
  },
  {
    id: 'wild',
    trait: 'TEAL = 4',
    ariaLabel: 'Wild set: a TEAL wild card adopting the number 4 to complete two 4s',
    cards: [
      normal('set-wild-1', 'periwinkle', 4, 'circle'),
      normal('set-wild-2', 'rose', 4, 'triangle'),
      teal('set-wild-3')
    ]
  },
  {
    id: 'not-a-set',
    trait: 'Nothing matches',
    notASet: true,
    ariaLabel: 'Not a set: three cards sharing no colour, number, or shape',
    cards: [
      normal('set-none-1', 'periwinkle', 1, 'circle'),
      normal('set-none-2', 'rose', 3, 'triangle'),
      normal('set-none-3', 'grape', 6, 'hexagon')
    ]
  }
];

/** Section 3: one representative of each card type. */
export const typeExamples: UiCard[] = [
  normal('type-normal', 'rose', 3, 'square'),
  teal('type-teal'),
  action('type-action', 'CONCEAL', 'CONCEAL', 'Hide a revealed card')
];

/** Section 4: the four real Action cards. */
export const actionExamples: UiCard[] = [
  action('action-conceal', 'CONCEAL', 'CONCEAL', 'Hide a revealed card'),
  action('action-steal', 'STEAL', 'STEAL', 'Take a card from opponent'),
  action('action-reveal', 'REVEAL', 'REVEAL', 'Expose a concealed card'),
  action('action-appeal', 'APPEAL', 'APPEAL', 'Cancel an action card')
];

/** Section 6: a normal card shown revealed, so the eye badge has meaning. */
export const revealedExample: UiCard = { ...normal('revealed-example', 'rose', 3, 'square'), isRevealed: true };

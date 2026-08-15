import type { Card, CardShape } from '../types';

export function validateSet(cards: Card[]): boolean {
  if (cards.length !== 3) return false;

  // Filter out action cards (except TEAL which acts as wild)
  const validCards = cards.filter(c => !c.isActionCard || c.actionType === 'TEAL');
  if (validCards.length !== 3) return false;

  // Check all 4 patterns: Same Color, Same Number, Same Shape, Consecutive Numbers
  return (
    isSameColor(validCards) ||
    isSameNumber(validCards) ||
    isSameShape(validCards) ||
    isConsecutiveNumbers(validCards)
  );
}

function isSameColor(cards: Card[]): boolean {
  const colors = cards.map(c => c.color).filter(Boolean);
  if (colors.length === 0) return false;

  // TEAL wild cards have fixed color '008080'
  return colors.every(color => color === colors[0]);
}

function isSameNumber(cards: Card[]): boolean {
  const numbers = cards.map(c => c.number).filter((n): n is number => n !== undefined);

  // TEAL can adopt any number, so if we have at least one real number, pattern can match
  if (numbers.length === 0) return false;

  // Get the target number from non-TEAL cards
  const targetNumber = numbers[0];

  // All real numbers must match
  return numbers.every(num => num === targetNumber);
}

function isSameShape(cards: Card[]): boolean {
  const shapes = cards.map(c => c.shape).filter((s): s is CardShape => s !== undefined);

  // TEAL can adopt any shape
  if (shapes.length === 0) return false;

  const targetShape = shapes[0];
  return shapes.every(shape => shape === targetShape);
}

function isConsecutiveNumbers(cards: Card[]): boolean {
  const numbers = cards.map(c => c.number).filter((n): n is number => n !== undefined);

  // Need at least 2 real numbers to establish a sequence
  if (numbers.length < 2) return false;

  const sorted = [...numbers].sort((a, b) => a - b);

  // If we have 3 real numbers, check strict sequence
  if (sorted.length === 3) {
    return sorted[1] === sorted[0] + 1 && sorted[2] === sorted[1] + 1;
  }

  // If we have 2 real numbers + 1 TEAL wild
  if (sorted.length === 2) {
    const diff = sorted[1] - sorted[0];
    // TEAL can fill: [n, TEAL, n+2] or [n, n+1, TEAL] or [TEAL, n, n+1]
    return diff === 1 || diff === 2;
  }

  return false;
}

export function checkWinCondition(hand: Card[]): boolean {
  // Player needs exactly 9 cards in 3 valid sets
  if (hand.length < 9) return false;

  // Try all combinations of 3 sets of 3 cards
  const combinations = generateSetCombinations(hand);

  for (const [set1, set2, set3] of combinations) {
    if (validateSet(set1) && validateSet(set2) && validateSet(set3)) {
      return true;
    }
  }

  return false;
}

function generateSetCombinations(cards: Card[]): [Card[], Card[], Card[]][] {
  const results: [Card[], Card[], Card[]][] = [];

  // Generate all combinations of 3 cards for first set
  for (let i = 0; i < cards.length - 8; i++) {
    for (let j = i + 1; j < cards.length - 7; j++) {
      for (let k = j + 1; k < cards.length - 6; k++) {
        const set1 = [cards[i], cards[j], cards[k]];
        const remaining1 = cards.filter((_, idx) => idx !== i && idx !== j && idx !== k);

        // Generate all combinations for second set
        for (let l = 0; l < remaining1.length - 5; l++) {
          for (let m = l + 1; m < remaining1.length - 4; m++) {
            for (let n = m + 1; n < remaining1.length - 3; n++) {
              const set2 = [remaining1[l], remaining1[m], remaining1[n]];
              const remaining2 = remaining1.filter((_, idx) => idx !== l && idx !== m && idx !== n);

              // Third set is the remaining 3 cards
              if (remaining2.length >= 3) {
                const set3 = [remaining2[0], remaining2[1], remaining2[2]];
                results.push([set1, set2, set3]);
              }
            }
          }
        }
      }
    }
  }

  return results;
}

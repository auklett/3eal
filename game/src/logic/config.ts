import type { CardColor, CardShape } from '../types';

export const GAME_CONFIG = {
  colors: [
    'C0C0FF',
    '008080',
    'C06060',
    '884488',
    '404088'
  ] as const satisfies readonly CardColor[],
  numbers: [1, 2, 3, 4, 5, 6, 7],
  shapes: ['circle', 'triangle', 'square', 'pentagon', 'hexagon'] as const satisfies readonly CardShape[],
  wildCards: 3,
  actionCopies: 10,
  minPlayers: 2,
  spectatorCap: 8,
  turnDurationOptionsMs: [45_000, 75_000, 120_000],
  defaultTurnDurationMs: 75_000,
  interruptDurationMs: 30_000,
  awayAfterMs: 45_000,
  heartbeatIntervalMs: 15_000,
  maxConsecutiveMissedTurns: 3,
  hideOpponentHandCounts: true,
  pendingRejoinExpiryMs: 60_000
} as const;

export const MAX_STARTABLE_PLAYERS = Math.floor(
  (GAME_CONFIG.colors.length * GAME_CONFIG.numbers.length * GAME_CONFIG.shapes.length + GAME_CONFIG.wildCards) / 3
);

export type ConfiguredCardColor = (typeof GAME_CONFIG.colors)[number];

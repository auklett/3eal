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
  minTurnDurationSeconds: 15,
  maxTurnDurationSeconds: 180,
  defaultTurnDurationSeconds: 60,
  interruptDurationMs: 30_000,
  awayAfterMs: 60_000,
  heartbeatIntervalMs: 15_000,
  maxConsecutiveMissedTurns: 3,
  pendingRejoinExpiryMs: 60_000
} as const;

export type ConfiguredCardColor = (typeof GAME_CONFIG.colors)[number];

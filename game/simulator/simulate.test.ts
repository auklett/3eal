import { describe, expect, it } from 'vitest';
import { simulateMonteCarlo } from './simulate';

describe('Monte Carlo simulator', () => {
  it('produces repeatable game-length and balance metrics from a fixed seed', () => {
    const options = { games: 8, playerCount: 3, seed: 'sim-test' };
    const first = simulateMonteCarlo(options);
    const second = simulateMonteCarlo(options);
    expect(first).toEqual(second);
    expect(first.gamesCompleted + first.gamesUnresolved).toBe(first.gamesRequested);
    expect(first.averageTurnsToWin).toBeGreaterThan(0);
    expect(first.averageSimulatedMinutes).toBeGreaterThan(0);
    expect(first.firstPlayerWinRatePercent).toBeGreaterThanOrEqual(0);
    expect(first.firstPlayerWinRatePercent).toBeLessThanOrEqual(100);
    expect(first.stealSwingRatePercent).toBeGreaterThanOrEqual(0);
    expect(first.appealSwingRatePercent).toBeGreaterThanOrEqual(0);
  });
});

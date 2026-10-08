import { simulateMonteCarlo, SIMULATOR_DEFAULTS } from './simulate';

function readInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new RangeError(`${name} must be an integer`);
  return value;
}

const report = simulateMonteCarlo({
  games: readInteger('SIM_GAMES', SIMULATOR_DEFAULTS.games),
  playerCount: readInteger('SIM_PLAYERS', SIMULATOR_DEFAULTS.playerCount),
  simulatedTurnSeconds: readInteger('SIM_TURN_SECONDS', SIMULATOR_DEFAULTS.simulatedTurnSeconds),
  seed: process.env.SIM_SEED ?? '3eal-monte-carlo-v1'
});

console.log(JSON.stringify(report, null, 2));

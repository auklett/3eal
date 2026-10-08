import {
  addParticipant,
  countCompleteSets,
  createRoom,
  createSeededRandom,
  reduceRoom,
  type RoomIntent,
  type RoomPlayer,
  type RoomState,
  type TableSlot
} from '@3eal/engine';

const DEFAULT_SIMULATED_TURN_SECONDS = 30;
const TARGET_MIN_SECONDS = 15 * 60;
const TARGET_MAX_SECONDS = 25 * 60;

export interface SimulationOptions {
  games: number;
  playerCount: number;
  seed: string;
  simulatedTurnSeconds: number;
  maxTurnsPerGame: number;
}

export interface SimulationReport {
  gamesRequested: number;
  gamesCompleted: number;
  gamesUnresolved: number;
  playerCount: number;
  simulatedTurnSeconds: number;
  averageTurnsToWin: number;
  averageSimulatedMinutes: number;
  gamesWithinTargetPercent: number;
  targetAverageTurnSecondsFor15To25Minutes: { minimum: number; maximum: number };
  firstPlayerWinRatePercent: number;
  stealActions: number;
  stealSetLossSwings: number;
  stealSwingRatePercent: number;
  appealCardsPlayed: number;
  appealSetLossesPrevented: number;
  appealSwingRatePercent: number;
  averagePlayerTurnsToFirstSet: number | null;
}

interface GameMetrics {
  turns: number;
  winnerId: string;
  firstPlayerId: string;
  stealActions: number;
  stealSetLossSwings: number;
  appealCardsPlayed: number;
  appealSetLossesPrevented: number;
  firstSetTurnCounts: number[];
}

function completeSets(player: RoomPlayer): number {
  return countCompleteSets(player.table.map((slot) => slot.card));
}

function playerFor(state: RoomState, id: string): RoomPlayer {
  const player = state.players.find((candidate) => candidate.id === id);
  if (!player) throw new Error(`Simulation player ${id} is missing`);
  return player;
}

function choose<T>(items: readonly T[], random: () => number): T | undefined {
  return items.length > 0 ? items[Math.floor(random() * items.length)] : undefined;
}

function visibleSetCount(player: RoomPlayer): number {
  return countCompleteSets(player.table.filter((slot) => slot.revealed).map((slot) => slot.card));
}

function noteFirstSet(state: RoomState, turnsByPlayer: Map<string, number>, firstSetTurn: Map<string, number>): void {
  for (const player of state.players) {
    if (!firstSetTurn.has(player.id) && completeSets(player) > 0) {
      firstSetTurn.set(player.id, turnsByPlayer.get(player.id) ?? 0);
    }
  }
}

function chooseReplacementSlot(player: RoomPlayer, incoming: TableSlot['card']): number {
  let bestSlot = 0;
  let bestSetCount = -1;
  for (let slot = 0; slot < player.table.length; slot += 1) {
    const candidate = player.table.map((tableSlot, index) =>
      index === slot ? incoming : tableSlot.card
    );
    const candidateCount = countCompleteSets(candidate);
    if (candidateCount > bestSetCount) {
      bestSlot = slot;
      bestSetCount = candidateCount;
    }
  }
  return bestSlot;
}

function chooseAction(state: RoomState, player: RoomPlayer, random: () => number): Extract<RoomIntent, { t: 'action' }> | null {
  const actionCard = player.hand.find((card) => card.kind === 'action' && card.action !== 'APPEAL');
  if (!actionCard || actionCard.kind !== 'action' || actionCard.action === 'APPEAL') return null;

  if (actionCard.action === 'CONCEAL') {
    const slot = choose(player.table.flatMap((tableSlot, index) => tableSlot.revealed ? [index] : []), random);
    return slot === undefined ? null : {
      t: 'action',
      cardId: actionCard.id,
      kind: 'CONCEAL',
      targetId: player.id,
      slot
    };
  }

  const opponents = state.players
    .filter((candidate) => candidate.id !== player.id && candidate.table.length > 0)
    .sort((left, right) => visibleSetCount(right) - visibleSetCount(left));
  const opponent = opponents[0];
  if (!opponent) return null;

  if (actionCard.action === 'REVEAL') {
    const slot = choose(opponent.table.flatMap((tableSlot, index) => tableSlot.revealed ? [] : [index]), random);
    return slot === undefined ? null : {
      t: 'action',
      cardId: actionCard.id,
      kind: 'REVEAL',
      targetId: opponent.id,
      slot
    };
  }

  const revealed = opponent.table.flatMap((tableSlot, index) => tableSlot.revealed ? [{ tableSlot, index }] : []);
  let target = revealed[0];
  let largestKnownSetLoss = 0;
  const knownCards = opponent.table.filter((slot) => slot.revealed).map((slot) => slot.card);
  for (const candidate of revealed) {
    const withoutCard = knownCards.filter((card) => card.id !== candidate.tableSlot.card.id);
    const setLoss = countCompleteSets(knownCards) - countCompleteSets(withoutCard);
    if (setLoss > largestKnownSetLoss) {
      target = candidate;
      largestKnownSetLoss = setLoss;
    }
  }
  if (!target) {
    const slot = choose(opponent.table.flatMap((tableSlot, index) => tableSlot.revealed ? [] : [index]), random);
    if (slot === undefined) return null;
    target = { tableSlot: opponent.table[slot], index: slot };
  }
  return {
    t: 'action',
    cardId: actionCard.id,
    kind: 'STEAL',
    targetId: opponent.id,
    slot: target.index
  };
}

function stealSetLoss(state: RoomState, targetId: string, cardId: string): number {
  const target = playerFor(state, targetId);
  const before = completeSets(target);
  const after = countCompleteSets(target.table.filter((slot) => slot.card.id !== cardId).map((slot) => slot.card));
  return Math.max(0, before - after);
}

function resolveInterrupts(
  state: RoomState,
  now: number,
  lossIfStolen: number
): { state: RoomState; appealPlayed: boolean; appealSwing: boolean } {
  let current = state;
  let appealPlayed = false;
  let appealSwing = false;
  while (current.pendingAction) {
    const interrupt = current.pendingAction.interrupt;
    const responderId = interrupt.responderIds.find((id) => !interrupt.passedIds.includes(id));
    if (!responderId) break;
    const responder = playerFor(current, responderId);
    const appeal = responder.hand.find((card) => card.kind === 'action' && card.action === 'APPEAL');
    const shouldAppeal = Boolean(
      appeal
      && interrupt.kind === 'STEAL'
      && interrupt.targetId === responderId
      && lossIfStolen > 0
    );
    const response = reduceRoom(current, responderId, shouldAppeal
      ? { t: 'appeal', cardId: appeal?.id ?? '' }
      : { t: 'pass' }, now);
    if ('error' in response) throw new Error(`Bot interrupt response rejected: ${response.error}`);
    current = response.state;
    if (shouldAppeal) {
      appealPlayed = true;
      appealSwing = lossIfStolen > 0;
    }
  }
  return { state: current, appealPlayed, appealSwing };
}

function runGame(options: SimulationOptions, gameIndex: number): GameMetrics | null {
  const firstId = 'player-0';
  let state = createRoom(
    `S${String(gameIndex).padStart(3, '0')}`,
    firstId,
    `${firstId}-session`,
    'Bot 1',
    `${options.seed}:${gameIndex}`
  );
  for (let playerIndex = 1; playerIndex < options.playerCount; playerIndex += 1) {
    const result = addParticipant(
      state,
      `player-${playerIndex}`,
      `Bot ${playerIndex + 1}`,
      'player',
      `player-${playerIndex}-session`
    );
    if ('error' in result) throw new Error(`Could not add simulator player: ${result.error}`);
    state = result.state;
  }
  const started = reduceRoom(state, firstId, { t: 'start' }, 0);
  if ('error' in started) throw new Error(`Could not start simulated game: ${started.error}`);
  state = started.state;

  const firstPlayerId = state.activePlayerId;
  if (!firstPlayerId) throw new Error('Simulation did not select a starting player');
  const random = createSeededRandom(`${options.seed}:bots:${gameIndex}`);
  const turnsByPlayer = new Map(state.players.map((player) => [player.id, 0]));
  const firstSetTurn = new Map<string, number>();
  noteFirstSet(state, turnsByPlayer, firstSetTurn);
  let now = 0;
  let stealActions = 0;
  let stealSetLossSwings = 0;
  let appealCardsPlayed = 0;
  let appealSetLossesPrevented = 0;

  while (state.phase === 'playing' && state.turnNumber <= options.maxTurnsPerGame) {
    const activeId = state.activePlayerId;
    if (!activeId) break;
    const active = playerFor(state, activeId);
    turnsByPlayer.set(activeId, (turnsByPlayer.get(activeId) ?? 0) + 1);

    const playable = active.hand.find((card) => card.kind === 'normal' || card.kind === 'teal');
    if (playable && playable.kind !== 'action') {
      while (playerFor(state, activeId).table.length > 9) {
        const activeTable = playerFor(state, activeId).table;
        const discarded = reduceRoom(state, activeId, { t: 'toHand', slot: activeTable.length - 1 }, now);
        if ('error' in discarded) throw new Error(`Bot cleanup rejected: ${discarded.error}`);
        state = discarded.state;
      }
      const currentPlayer = playerFor(state, activeId);
      const slot = currentPlayer.table.length < 9
        ? currentPlayer.table.length
        : chooseReplacementSlot(currentPlayer, playable);
      const placed = reduceRoom(state, activeId, { t: 'place', cardId: playable.id, slot }, now);
      if ('error' in placed) throw new Error(`Bot placement rejected: ${placed.error}`);
      state = placed.state;
      noteFirstSet(state, turnsByPlayer, firstSetTurn);
    }

    const currentPlayer = playerFor(state, activeId);
    const action = chooseAction(state, currentPlayer, random);
    if (action) {
      const targetCardId = playerFor(state, action.targetId).table[action.slot]?.card.id;
      const lossIfStolen = action.kind === 'STEAL' && targetCardId
        ? stealSetLoss(state, action.targetId, targetCardId)
        : 0;
      const previousSetCount = action.kind === 'STEAL' ? completeSets(playerFor(state, action.targetId)) : 0;
      const played = reduceRoom(state, activeId, action, now);
      if ('error' in played) throw new Error(`Bot action rejected: ${played.error}`);
      state = played.state;
      if (action.kind === 'STEAL') {
        stealActions += 1;
        if (state.pendingAction) {
          const response = resolveInterrupts(state, now, lossIfStolen);
          state = response.state;
          if (response.appealPlayed) appealCardsPlayed += 1;
          if (response.appealSwing) appealSetLossesPrevented += 1;
        }
        const remainingSets = completeSets(playerFor(state, action.targetId));
        if (remainingSets < previousSetCount && state.lastInterruptResult?.outcome !== 'appealed') {
          stealSetLossSwings += 1;
        }
        noteFirstSet(state, turnsByPlayer, firstSetTurn);
      } else if (state.pendingAction) {
        state = resolveInterrupts(state, now, 0).state;
      }
    }

    if (state.phase !== 'playing') break;
    now += options.simulatedTurnSeconds * 1000;
    const ended = reduceRoom(state, activeId, { t: 'endTurn' }, now);
    if ('error' in ended) throw new Error(`Bot end-turn rejected: ${ended.error}`);
    state = ended.state;
    noteFirstSet(state, turnsByPlayer, firstSetTurn);
  }

  if (state.phase !== 'finished' || !state.winnerId) return null;
  return {
    turns: state.turnNumber,
    winnerId: state.winnerId,
    firstPlayerId,
    stealActions,
    stealSetLossSwings,
    appealCardsPlayed,
    appealSetLossesPrevented,
    firstSetTurnCounts: [...firstSetTurn.values()]
  };
}

export function simulateMonteCarlo(options: Partial<SimulationOptions> = {}): SimulationReport {
  const config: SimulationOptions = {
    games: options.games ?? 250,
    playerCount: options.playerCount ?? 4,
    seed: options.seed ?? '3eal-monte-carlo-v1',
    simulatedTurnSeconds: options.simulatedTurnSeconds ?? DEFAULT_SIMULATED_TURN_SECONDS,
    maxTurnsPerGame: options.maxTurnsPerGame ?? 240
  };
  if (!Number.isInteger(config.games) || config.games < 1) throw new RangeError('games must be a positive integer');
  if (!Number.isInteger(config.playerCount) || config.playerCount < 2) throw new RangeError('playerCount must be at least 2');
  if (!Number.isInteger(config.simulatedTurnSeconds) || config.simulatedTurnSeconds < 1 || config.simulatedTurnSeconds >= 60) {
    throw new RangeError('simulatedTurnSeconds must be between 1 and 59');
  }

  const results: GameMetrics[] = [];
  for (let gameIndex = 0; gameIndex < config.games; gameIndex += 1) {
    const result = runGame(config, gameIndex);
    if (result) results.push(result);
  }
  const gamesCompleted = results.length;
  const averageTurnsToWin = gamesCompleted
    ? results.reduce((sum, result) => sum + result.turns, 0) / gamesCompleted
    : 0;
  const averageSimulatedSeconds = averageTurnsToWin * config.simulatedTurnSeconds;
  const stealActions = results.reduce((sum, result) => sum + result.stealActions, 0);
  const stealSetLossSwings = results.reduce((sum, result) => sum + result.stealSetLossSwings, 0);
  const appealCardsPlayed = results.reduce((sum, result) => sum + result.appealCardsPlayed, 0);
  const appealSetLossesPrevented = results.reduce((sum, result) => sum + result.appealSetLossesPrevented, 0);
  const setFormationTurns = results.flatMap((result) => result.firstSetTurnCounts);
  const firstPlayerWins = results.filter((result) => result.winnerId === result.firstPlayerId).length;

  return {
    gamesRequested: config.games,
    gamesCompleted,
    gamesUnresolved: config.games - gamesCompleted,
    playerCount: config.playerCount,
    simulatedTurnSeconds: config.simulatedTurnSeconds,
    averageTurnsToWin,
    averageSimulatedMinutes: averageSimulatedSeconds / 60,
    gamesWithinTargetPercent: gamesCompleted
      ? results.filter((result) => {
        const duration = result.turns * config.simulatedTurnSeconds;
        return duration >= TARGET_MIN_SECONDS && duration <= TARGET_MAX_SECONDS;
      }).length / gamesCompleted * 100
      : 0,
    targetAverageTurnSecondsFor15To25Minutes: {
      minimum: averageTurnsToWin ? TARGET_MIN_SECONDS / averageTurnsToWin : 0,
      maximum: averageTurnsToWin ? TARGET_MAX_SECONDS / averageTurnsToWin : 0
    },
    firstPlayerWinRatePercent: gamesCompleted ? firstPlayerWins / gamesCompleted * 100 : 0,
    stealActions,
    stealSetLossSwings,
    stealSwingRatePercent: stealActions ? stealSetLossSwings / stealActions * 100 : 0,
    appealCardsPlayed,
    appealSetLossesPrevented,
    appealSwingRatePercent: appealCardsPlayed ? appealSetLossesPrevented / appealCardsPlayed * 100 : 0,
    averagePlayerTurnsToFirstSet: setFormationTurns.length
      ? setFormationTurns.reduce((sum, value) => sum + value, 0) / setFormationTurns.length
      : null
  };
}

export const SIMULATOR_DEFAULTS = {
  games: 250,
  playerCount: 4,
  simulatedTurnSeconds: DEFAULT_SIMULATED_TURN_SECONDS,
  targetGameMinutes: { minimum: TARGET_MIN_SECONDS / 60, maximum: TARGET_MAX_SECONDS / 60 }
};

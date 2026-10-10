import { createDeck } from './deck';
import { expireInterrupt, openInterrupt, respondToInterrupt } from './interrupts';
import { createSeededRandom, shuffle } from './random';
import { findWinningPartition } from './sets';
import type {
  ActionCard,
  Card,
  InterruptAction,
  InterruptActionIntent,
  InterruptOutcome,
  InterruptState,
  TableCard
} from './types';

export const DEFAULT_TURN_SECONDS = 60;
export const MIN_TURN_SECONDS = 15;
export const MAX_TURN_SECONDS = 180;
export const AWAY_AFTER_MS = 60_000;
export const REJOIN_REQUEST_TIMEOUT_MS = 60_000;

export type TableSlot = { card: TableCard; revealed: boolean };
export type RoomPlayer = {
  id: string;
  sessionIds: string[];
  name: string;
  connected: boolean;
  away: boolean;
  awayAt: number | null;
  kicked: boolean;
  table: TableSlot[];
  hand: Card[];
};
export type RoomSpectator = { id: string; sessionIds: string[]; name: string; connected: boolean };
export type RejoinRequest = {
  id: string;
  requesterId: string;
  spectatorId: string;
  playerId: string;
  name: string;
  expiresAt: number;
};
export type LastInterruptResult = {
  kind: InterruptAction;
  outcome: 'appealed' | 'resolved' | 'expired';
};

export type RoomState = {
  roomCode: string;
  phase: 'lobby' | 'playing' | 'finished';
  hostId: string;
  players: RoomPlayer[];
  spectators: RoomSpectator[];
  turnDurationSeconds: number;
  deck: Card[];
  discardPile: Card[];
  activePlayerId: string | null;
  turnNumber: number;
  turnEndsAt: number | null;
  turnRemainingMs: number | null;
  pendingAction: { actionCard: ActionCard; interrupt: InterruptState } | null;
  lastInterruptResult: LastInterruptResult | null;
  winnerId: string | null;
  randomSeed: string;
  randomCounter: number;
  rejoinRequests: RejoinRequest[];
  skipAfterInterrupt: boolean;
};

export type RoomIntent =
  | { t: 'setRole'; role: 'player' | 'spectator' }
  | { t: 'setTurnTimer'; seconds: number }
  | { t: 'start' }
  | { t: 'place'; cardId: string; slot: number }
  | { t: 'toHand'; slot: number }
  | { t: 'action'; cardId: string; kind: InterruptAction; targetId: string; slot: number }
  | { t: 'appeal'; cardId: string }
  | { t: 'pass' }
  | { t: 'endTurn' }
  | { t: 'rematch' };

export type ReduceResult = { state: RoomState } | { state: RoomState; error: string };
export type DeadlineResult = { state: RoomState; expiredRejoinIds: string[] };

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function cleanName(name: string): string {
  return name.trim();
}

function identityInUse(state: RoomState, id: string): boolean {
  return [...state.players, ...state.spectators].some((participant) =>
    participant.id === id || participant.sessionIds.includes(id)
  );
}

function uniqueSpectatorName(state: RoomState, name: string): string {
  const existing = [...state.players, ...state.spectators].map((participant) => normalizeName(participant.name));
  const base = `${cleanName(name)} (spectator)`;
  if (!existing.includes(normalizeName(base))) return base;
  let suffix = 2;
  while (existing.includes(normalizeName(`${base} ${suffix}`))) suffix += 1;
  return `${base} ${suffix}`;
}

function randomFor(state: RoomState) {
  state.randomCounter += 1;
  return createSeededRandom(`${state.randomSeed}:${state.randomCounter}`);
}

function getPlayer(state: RoomState, playerId: string): RoomPlayer | undefined {
  return state.players.find((player) => player.id === playerId);
}

function getParticipant(state: RoomState, id: string): RoomPlayer | RoomSpectator | undefined {
  return getPlayer(state, id) ?? state.spectators.find((spectator) => spectator.id === id);
}

function transferHost(state: RoomState): void {
  const currentIndex = state.players.findIndex((player) => player.id === state.hostId);
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const candidate = state.players[(currentIndex + offset + state.players.length) % state.players.length];
    if (candidate?.connected && !candidate.kicked) {
      state.hostId = candidate.id;
      return;
    }
  }
}

function setPublicResult(
  state: RoomState,
  kind: InterruptAction,
  outcome: LastInterruptResult['outcome']
): void {
  state.lastInterruptResult = { kind, outcome };
}

function drawForTurn(state: RoomState): void {
  if (state.deck.length === 0 && state.discardPile.length > 0) {
    state.deck = shuffle(state.discardPile, randomFor(state));
    state.discardPile = [];
  }
  const card = state.deck.pop();
  const active = state.activePlayerId ? getPlayer(state, state.activePlayerId) : undefined;
  if (card && active) active.hand.push(card);
}

function beginTurn(state: RoomState, playerId: string, now: number): void {
  state.activePlayerId = playerId;
  state.turnNumber += 1;
  state.turnRemainingMs = null;
  state.turnEndsAt = now + state.turnDurationSeconds * 1000;
  drawForTurn(state);
}

function nextTurn(state: RoomState, now: number): void {
  const currentIndex = state.players.findIndex((player) => player.id === state.activePlayerId);
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const candidate = state.players[(currentIndex + offset + state.players.length) % state.players.length];
    if (candidate?.connected && !candidate.away && !candidate.kicked) {
      beginTurn(state, candidate.id, now);
      return;
    }
  }
  state.activePlayerId = null;
  state.turnEndsAt = null;
  state.turnRemainingMs = null;
}

function finishTurn(state: RoomState, now: number): void {
  const active = state.activePlayerId ? getPlayer(state, state.activePlayerId) : undefined;
  if (!active) {
    state.turnEndsAt = null;
    return;
  }

  const keptActionCards = active.hand.filter((card) => card.kind === 'action');
  state.discardPile.push(...active.hand.filter((card) => card.kind !== 'action'));
  active.hand = keptActionCards;
  if (active.table.length > 9) {
    const removed = active.table.splice(9);
    state.discardPile.push(...removed.map((slot) => slot.card));
  }

  const winningPartition = active.table.length === 9
    ? findWinningPartition(active.table.map((slot) => slot.card))
    : null;
  if (winningPartition) {
    state.phase = 'finished';
    state.winnerId = active.id;
    state.turnEndsAt = null;
    state.turnRemainingMs = null;
    state.pendingAction = null;
    state.skipAfterInterrupt = false;
    return;
  }

  state.turnEndsAt = null;
  state.turnRemainingMs = null;
  nextTurn(state, now);
}

function resolvePendingAction(
  state: RoomState,
  outcome: LastInterruptResult['outcome'],
  now: number,
  appealedCard?: Card
): void {
  const pending = state.pendingAction;
  if (!pending) return;
  const action = pending.interrupt;
  const remaining = state.turnRemainingMs ?? 0;
  const actor = getPlayer(state, action.actorId);
  const target = getPlayer(state, action.targetId);
  if (outcome === 'appealed') {
    if (!appealedCard) throw new Error('An appealed interrupt requires an APPEAL card');
    state.discardPile.push(pending.actionCard, appealedCard);
  } else {
    const targetSlotIndex = target?.table.findIndex((slot) => slot.card.id === action.targetCardId) ?? -1;
    const targetSlot = target?.table[targetSlotIndex];
    if (!actor || !target || !targetSlot) throw new Error('Pending action target no longer exists');

    if (action.kind === 'CONCEAL') {
      targetSlot.revealed = false;
    } else if (action.kind === 'REVEAL') {
      targetSlot.revealed = true;
    } else {
      target.table.splice(targetSlotIndex, 1);
      actor.table.push(targetSlot);
    }
    state.discardPile.push(pending.actionCard);
  }

  setPublicResult(state, action.kind, outcome);
  state.pendingAction = null;
  state.turnEndsAt = null;

  if (state.skipAfterInterrupt || (state.activePlayerId && getPlayer(state, state.activePlayerId)?.away)) {
    state.turnRemainingMs = null;
    state.skipAfterInterrupt = false;
    finishTurn(state, now);
    return;
  }

  state.turnRemainingMs = null;
  state.turnEndsAt = now + remaining;
}

function continueAfterInterrupt(state: RoomState, outcome: InterruptOutcome, now: number, appealCard?: Card): void {
  if (outcome.status === 'open') {
    state.pendingAction = { ...state.pendingAction!, interrupt: outcome.interrupt };
    return;
  }
  resolvePendingAction(state, outcome.reason === 'appealed' ? 'appealed' : 'resolved', now, appealCard);
}

function validTimer(seconds: number): boolean {
  return Number.isInteger(seconds) && seconds >= MIN_TURN_SECONDS && seconds <= MAX_TURN_SECONDS;
}

export function createRoom(roomCode: string, hostId: string, hostSessionId: string, hostName: string, randomSeed: string): RoomState {
  const name = cleanName(hostName);
  if (!name || name.length > 24) throw new RangeError('Player name must contain 1 to 24 characters');
  if (hostId === hostSessionId) throw new RangeError('Public participant IDs and private session IDs must be different');
  return {
    roomCode,
    phase: 'lobby',
    hostId,
    players: [{
      id: hostId,
      sessionIds: [hostSessionId],
      name,
      connected: true,
      away: false,
      awayAt: null,
      kicked: false,
      table: [],
      hand: []
    }],
    spectators: [],
    turnDurationSeconds: DEFAULT_TURN_SECONDS,
    deck: [],
    discardPile: [],
    activePlayerId: null,
    turnNumber: 0,
    turnEndsAt: null,
    turnRemainingMs: null,
    pendingAction: null,
    lastInterruptResult: null,
    winnerId: null,
    randomSeed,
    randomCounter: 0,
    rejoinRequests: [],
    skipAfterInterrupt: false
  };
}

export function addParticipant(
  state: RoomState,
  id: string,
  name: string,
  requestedRole: 'player' | 'spectator',
  sessionId: string
): ReduceResult {
  const normalized = normalizeName(name);
  if (!normalized || normalized.length > 24) return { state, error: 'Name must contain 1 to 24 characters' };
  if (identityInUse(state, id) || identityInUse(state, sessionId)) {
    return { state, error: 'Session is already a room participant' };
  }
  if (id === sessionId) return { state, error: 'Public participant and private session IDs must be different' };
  if ([...state.players, ...state.spectators].some((participant) => normalizeName(participant.name) === normalized)) {
    return { state, error: 'That name is already in use' };
  }

  const next = structuredClone(state);
  const role = next.phase === 'lobby' ? requestedRole : 'spectator';
  if (role === 'player') {
    next.players.push({
      id,
      sessionIds: [sessionId],
      name: cleanName(name),
      connected: true,
      away: false,
      awayAt: null,
      kicked: false,
      table: [],
      hand: []
    });
  } else {
    next.spectators.push({ id, sessionIds: [sessionId], name: cleanName(name), connected: true });
  }
  return { state: next };
}

export function requestRejoin(
  state: RoomState,
  requestId: string,
  requesterId: string,
  spectatorId: string,
  name: string,
  now: number
): ReduceResult {
  const normalized = normalizeName(name);
  const player = state.players.find((candidate) => normalizeName(candidate.name) === normalized && !candidate.kicked);
  if (!player) return { state, error: 'No player with that name can rejoin this room' };
  if (identityInUse(state, requesterId) || identityInUse(state, spectatorId) || requesterId === spectatorId) {
    return { state, error: 'Rejoin session is invalid' };
  }
  if (state.rejoinRequests.some((request) => request.requesterId === requesterId)) {
    return { state, error: 'A rejoin request is already pending for this session' };
  }
  const next = structuredClone(state);
  next.rejoinRequests.push({
    id: requestId,
    requesterId,
    spectatorId,
    playerId: player.id,
    name: player.name,
    expiresAt: now + REJOIN_REQUEST_TIMEOUT_MS
  });
  return { state: next };
}

export function resolveRejoinRequest(
  state: RoomState,
  actorId: string,
  requestId: string,
  accept: boolean,
  now: number
): { result: ReduceResult; acceptedPlayerId?: string; requesterId?: string; name?: string } {
  if (actorId !== state.hostId) return { result: { state, error: 'Only the host can decide rejoin requests' } };
  const request = state.rejoinRequests.find((item) => item.id === requestId);
  if (!request) return { result: { state, error: 'Rejoin request was not found or has expired' } };
  const next = structuredClone(state);
  const nextRequest = next.rejoinRequests.find((item) => item.id === requestId);
  if (!nextRequest) return { result: { state, error: 'Rejoin request was not found or has expired' } };
  next.rejoinRequests = next.rejoinRequests.filter((item) => item.id !== requestId);

  if (accept) {
    const player = getPlayer(next, request.playerId);
    if (!player || player.kicked) return { result: { state, error: 'That player can no longer rejoin' } };
    player.connected = true;
    player.sessionIds = [request.requesterId];
    player.away = false;
    player.awayAt = null;
    if (next.phase === 'playing' && next.activePlayerId === null) beginTurn(next, player.id, now);
    return {
      result: { state: next },
      acceptedPlayerId: player.id,
      requesterId: request.requesterId,
      name: request.name
    };
  }

  const spectatorName = uniqueSpectatorName(next, request.name);
  next.spectators.push({
    id: request.spectatorId,
    sessionIds: [request.requesterId],
    name: spectatorName,
    connected: true
  });
  return {
    result: { state: next },
    requesterId: request.requesterId,
    name: request.name
  };
}

function startGame(state: RoomState, now: number): string | undefined {
  if (state.phase !== 'lobby') return 'The game can only be started from the lobby';
  if (state.players.length < 2) return 'At least two players are required to start';
  if (state.players.some((player) => player.kicked)) return 'Remove kicked seats before starting';

  const random = randomFor(state);
  const deck = createDeck(random);
  if (deck.filter((card) => card.kind !== 'action').length < state.players.length * 3) {
    return 'There are not enough Normal and TEAL cards to deal this many players';
  }

  const skippedActions: Card[] = [];
  for (const player of state.players) {
    player.table = [];
    player.hand = [];
    while (player.table.length < 3) {
      const card = deck.pop();
      if (!card) return 'The deck ran out while dealing the starting Tables';
      if (card.kind === 'action') skippedActions.push(card);
      else player.table.push({ card, revealed: false });
    }
  }
  deck.push(...skippedActions);
  state.deck = shuffle(deck, randomFor(state));
  state.discardPile = [];
  state.phase = 'playing';
  state.winnerId = null;
  state.turnNumber = 0;
  state.lastInterruptResult = null;
  state.skipAfterInterrupt = false;

  const startingPlayer = state.players[Math.floor(randomFor(state)() * state.players.length)];
  if (!startingPlayer) return 'A starting player could not be selected';
  beginTurn(state, startingPlayer.id, now);
  return undefined;
}

function changeRole(state: RoomState, playerId: string, role: 'player' | 'spectator'): string | undefined {
  if (state.phase !== 'lobby') return 'Roles can only be changed in the lobby';
  const player = getPlayer(state, playerId);
  const spectator = state.spectators.find((candidate) => candidate.id === playerId);
  if (role === 'spectator' && player) {
    if (player.id === state.hostId) {
      state.spectators.push({ id: player.id, sessionIds: player.sessionIds, name: player.name, connected: true });
      state.players = state.players.filter((candidate) => candidate.id !== player.id);
      transferHost(state);
      return undefined;
    }
    state.spectators.push({ id: player.id, sessionIds: player.sessionIds, name: player.name, connected: player.connected });
    state.players = state.players.filter((candidate) => candidate.id !== player.id);
  } else if (role === 'player' && spectator) {
    state.players.push({
      id: spectator.id,
      sessionIds: spectator.sessionIds,
      name: spectator.name,
      connected: spectator.connected,
      away: false,
      awayAt: null,
      kicked: false,
      table: [],
      hand: []
    });
    state.spectators = state.spectators.filter((candidate) => candidate.id !== spectator.id);
  }
  return undefined;
}

function currentMainPlayer(state: RoomState, actorId: string): RoomPlayer | undefined {
  if (state.phase !== 'playing' || state.pendingAction || state.activePlayerId !== actorId) return undefined;
  return getPlayer(state, actorId);
}

function doAction(
  state: RoomState,
  actor: RoomPlayer,
  intent: Extract<RoomIntent, { t: 'action' }>,
  now: number
): string | undefined {
  const handIndex = actor.hand.findIndex((card) => card.id === intent.cardId);
  const actionCard = actor.hand[handIndex];
  if (!actionCard || actionCard.kind !== 'action' || actionCard.action !== intent.kind) {
    return 'That action card is not in your Hand';
  }
  if (intent.kind === 'CONCEAL' ? intent.targetId !== actor.id : intent.targetId === actor.id) {
    return intent.kind === 'CONCEAL' ? 'CONCEAL targets your own Table' : `${intent.kind} must target an opponent`;
  }
  const target = getPlayer(state, intent.targetId);
  const targetSlot = target?.table[intent.slot];
  if (!target || !targetSlot) return 'Target Table slot was not found';
  if (intent.kind === 'CONCEAL' && targetSlot.revealed !== true) return 'CONCEAL requires a revealed Table card';
  if (intent.kind === 'REVEAL' && targetSlot.revealed) return 'REVEAL requires a concealed Table card';
  if (intent.kind === 'STEAL' && targetSlot.card.kind !== 'normal' && targetSlot.card.kind !== 'teal') {
    return 'Only Normal or TEAL cards can be stolen';
  }

  actor.hand.splice(handIndex, 1);
  const action: InterruptActionIntent = {
    id: `i-${randomFor(state)().toString(16).slice(2)}`,
    kind: intent.kind,
    actorId: actor.id,
    targetId: intent.targetId,
    targetCardId: targetSlot.card.id
  };
  const remaining = Math.max(0, (state.turnEndsAt ?? now) - now);
  state.turnRemainingMs = remaining;
  state.turnEndsAt = null;
  state.pendingAction = { actionCard, interrupt: { ...action, endsAt: now, responderIds: [], passedIds: [] } };
  const outcome = openInterrupt(action, state.players, now);
  if (outcome.status === 'resolved') {
    state.lastInterruptResult = { kind: intent.kind, outcome: 'resolved' };
    const result = { status: 'resolved' as const, reason: 'no-appeal-available' as const };
    continueAfterInterrupt(state, result, now);
  } else {
    state.pendingAction.interrupt = outcome.interrupt;
  }
  return undefined;
}

export function reduceRoom(state: RoomState, actorId: string, intent: RoomIntent, now: number): ReduceResult {
  const actor = getParticipant(state, actorId);
  if (!actor) return { state, error: 'You are not a member of this room' };
  const next = structuredClone(state);
  const nextPlayer = getPlayer(next, actorId);

  if (intent.t === 'setRole') {
    const error = changeRole(next, actorId, intent.role);
    return error ? { state, error } : { state: next };
  }

  if (intent.t === 'setTurnTimer') {
    if (actorId !== state.hostId) return { state, error: 'Only the host can change the turn timer' };
    if (state.phase !== 'lobby') return { state, error: 'The turn timer can only be changed in the lobby' };
    if (!validTimer(intent.seconds)) return { state, error: 'Turn timer must be between 15 and 180 seconds' };
    next.turnDurationSeconds = intent.seconds;
    return { state: next };
  }

  if (intent.t === 'start') {
    if (actorId !== state.hostId) return { state, error: 'Only the host can start the game' };
    const error = startGame(next, now);
    return error ? { state, error } : { state: next };
  }

  if (intent.t === 'rematch') {
    if (actorId !== state.hostId || state.phase !== 'finished') {
      return { state, error: 'Only the host can start a rematch after the game ends' };
    }
    next.players = next.players.filter((player) => player.connected && !player.kicked);
    if (next.players.length < 2) return { state, error: 'At least two connected players are required for a rematch' };
    next.phase = 'lobby';
    next.deck = [];
    next.discardPile = [];
    next.activePlayerId = null;
    next.turnNumber = 0;
    next.turnEndsAt = null;
    next.turnRemainingMs = null;
    next.pendingAction = null;
    next.lastInterruptResult = null;
    next.winnerId = null;
    next.rejoinRequests = [];
    for (const player of next.players) {
      player.table = [];
      player.hand = [];
      player.away = false;
      player.awayAt = null;
    }
    return { state: next };
  }

  if (intent.t === 'endTurn') {
    if (!currentMainPlayer(state, actorId)) return { state, error: 'Only the active player can end their Main phase' };
    finishTurn(next, now);
    return { state: next };
  }

  if (intent.t === 'appeal' || intent.t === 'pass') {
    const pending = state.pendingAction;
    if (!pending) return { state, error: 'There is no interrupt to respond to' };
    if (now >= pending.interrupt.endsAt) return { state, error: 'The interrupt window has ended' };
    if (!pending.interrupt.responderIds.includes(actorId)) {
      return { state, error: 'You are not eligible to respond to this interrupt' };
    }
    if (pending.interrupt.passedIds.includes(actorId)) {
      return { state, error: 'You have already passed this interrupt' };
    }
    let appealCard: Card | undefined;
    if (intent.t === 'appeal') {
      const handIndex = nextPlayer?.hand.findIndex((card) => card.id === intent.cardId) ?? -1;
      appealCard = nextPlayer?.hand[handIndex];
      if (!appealCard || appealCard.kind !== 'action' || appealCard.action !== 'APPEAL') {
        return { state, error: 'APPEAL card is not in your Hand' };
      }
      nextPlayer?.hand.splice(handIndex, 1);
    }
    const result = respondToInterrupt(
      pending.interrupt,
      actorId,
      intent.t,
      now
    );
    if (result.status === 'resolved') {
      resolvePendingAction(next, intent.t === 'appeal' ? 'appealed' : 'resolved', now, appealCard);
    } else {
      next.pendingAction = { ...pending, interrupt: result.interrupt };
    }
    return { state: next };
  }

  if (intent.t === 'place') {
    const player = currentMainPlayer(state, actorId);
    if (!player || !nextPlayer) return { state, error: 'Only the active player can place a card during Main' };
    const handIndex = nextPlayer.hand.findIndex((card) => card.id === intent.cardId);
    const card = nextPlayer.hand[handIndex];
    if (handIndex < 0 || !card || (card.kind !== 'normal' && card.kind !== 'teal')) {
      return { state, error: 'Only Normal and TEAL cards can be moved to your Table' };
    }
    if (intent.slot < 0 || intent.slot > 8) return { state, error: 'Table slot is out of range' };
    if (player.table.length >= 9) {
      const replaced = nextPlayer.table[intent.slot];
      if (!replaced) return { state, error: 'Choose a Table card to swap with' };
      nextPlayer.hand[handIndex] = replaced.card;
      nextPlayer.table[intent.slot] = { card, revealed: false };
    } else {
      if (intent.slot > player.table.length) return { state, error: 'Table slot is out of range' };
      nextPlayer.hand.splice(handIndex, 1);
      nextPlayer.table.splice(intent.slot, 0, { card, revealed: false });
    }
    return { state: next };
  }

  if (intent.t === 'toHand') {
    if (!currentMainPlayer(state, actorId) || !nextPlayer) return { state, error: 'Only the active player can move a card to Hand during Main' };
    const slot = nextPlayer.table[intent.slot];
    if (!slot) return { state, error: 'That Table slot is empty' };
    nextPlayer.hand.push(slot.card);
    nextPlayer.table.splice(intent.slot, 1);
    return { state: next };
  }

  if (intent.t === 'action') {
    const player = currentMainPlayer(next, actorId);
    if (!player) return { state, error: 'Actions can only be played by the active player during Main' };
    const error = doAction(next, player, intent, now);
    return error ? { state, error } : { state: next };
  }

  return { state, error: 'Unsupported room action' };
}

export function setParticipantConnected(state: RoomState, participantId: string, connected: boolean, now: number): RoomState {
  const next = structuredClone(state);
  const player = getPlayer(next, participantId);
  if (player) {
    player.connected = connected;
    player.awayAt = connected ? null : now + AWAY_AFTER_MS;
    if (connected) player.away = false;
    if (!connected && participantId === next.hostId) transferHost(next);
    if (connected && next.phase === 'playing' && next.activePlayerId === null && !player.away && !player.kicked) {
      beginTurn(next, player.id, now);
    }
  } else {
    const spectator = next.spectators.find((candidate) => candidate.id === participantId);
    if (spectator) spectator.connected = connected;
  }
  return next;
}

export function kickParticipant(state: RoomState, actorId: string, targetId: string, now: number): ReduceResult {
  if (actorId !== state.hostId) return { state, error: 'Only the host can kick participants' };
  if (actorId === targetId) return { state, error: 'The host cannot kick themselves' };
  const next = structuredClone(state);
  const spectator = next.spectators.find((candidate) => candidate.id === targetId);
  if (spectator) {
    next.spectators = next.spectators.filter((candidate) => candidate.id !== targetId);
    return { state: next };
  }
  const player = getPlayer(next, targetId);
  if (!player) return { state, error: 'Participant was not found' };
  if (next.phase === 'lobby') {
    next.players = next.players.filter((candidate) => candidate.id !== targetId);
  } else {
    player.connected = false;
    player.away = true;
    player.awayAt = null;
    player.kicked = true;
    if (next.activePlayerId === targetId) {
      if (next.pendingAction) next.skipAfterInterrupt = true;
      else finishTurn(next, now);
    }
  }
  return { state: next };
}

function resolveExpiredPendingAction(state: RoomState, now: number): void {
  const pending = state.pendingAction;
  if (!pending || now < pending.interrupt.endsAt) return;
  const expired = expireInterrupt(pending.interrupt, now);
  if (expired.status !== 'resolved') return;
  resolvePendingAction(state, 'expired', now);
}

export function processDeadlines(state: RoomState, now: number): DeadlineResult {
  const next = structuredClone(state);
  const expiredRejoinIds = next.rejoinRequests
    .filter((request) => request.expiresAt <= now)
    .map((request) => request.id);
  const expiredRequests = next.rejoinRequests.filter((request) => expiredRejoinIds.includes(request.id));
  next.rejoinRequests = next.rejoinRequests.filter((request) => !expiredRejoinIds.includes(request.id));
  for (const request of expiredRequests) {
    next.spectators.push({
      id: request.spectatorId,
      sessionIds: [request.requesterId],
      name: uniqueSpectatorName(next, request.name),
      connected: true
    });
  }

  for (const player of next.players) {
    if (player.awayAt !== null && player.awayAt <= now) {
      player.away = true;
      player.awayAt = null;
    }
  }

  resolveExpiredPendingAction(next, now);
  const active = next.activePlayerId ? getPlayer(next, next.activePlayerId) : undefined;
  if (next.phase === 'playing' && !next.pendingAction && active?.away) {
    finishTurn(next, now);
  } else if (next.phase === 'playing' && next.turnEndsAt !== null && next.turnEndsAt <= now) {
    finishTurn(next, now);
  }
  return { state: next, expiredRejoinIds };
}

export function nextRoomDeadline(state: RoomState): number | null {
  const deadlines = [
    state.turnEndsAt,
    state.pendingAction?.interrupt.endsAt,
    ...state.players.map((player) => player.awayAt),
    ...state.rejoinRequests.map((request) => request.expiresAt)
  ].filter((deadline): deadline is number => deadline !== null && deadline !== undefined);
  return deadlines.length ? Math.min(...deadlines) : null;
}

export function eligibleAppealIds(interrupt: InterruptState): readonly string[] {
  return interrupt.responderIds;
}

export function publicInterrupt(interrupt: InterruptState | null): Omit<InterruptState, 'responderIds' | 'passedIds'> | null {
  if (!interrupt) return null;
  const { responderIds: _responders, passedIds: _passed, ...publicFields } = interrupt;
  return publicFields;
}

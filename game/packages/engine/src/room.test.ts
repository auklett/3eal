import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addParticipant,
  createRoom,
  DECK_SIZE,
  eligibleAppealIds,
  leaveRoom,
  nextRoomDeadline,
  processDeadlines,
  reduceRoom,
  requestRejoin,
  resolveRejoinRequest,
  returnToLobby,
  setParticipantConnected,
  transferHostTo,
  type RoomState
} from './index';

function startTwoPlayerRoom(): RoomState {
  const created = createRoom('ABCD', 'host', 'host-session', 'Host', 'seed');
  const joined = addParticipant(created, 'guest', 'Guest', 'player', 'guest-session');
  if ('error' in joined) throw new Error(joined.error);
  const started = reduceRoom(joined.state, 'host', { t: 'start' }, 1000);
  if ('error' in started) throw new Error(started.error);
  return started.state;
}

function startRoomWithPlayers(count: number, seed = 'seed'): RoomState {
  let room = createRoom('ABCD', 'host', 'host-session', 'Host', seed);
  for (let index = 1; index < count; index += 1) {
    const joined = addParticipant(room, `player-${index}`, `Player ${index}`, 'player', `session-${index}`);
    if ('error' in joined) throw new Error(joined.error);
    room = joined.state;
  }
  const started = reduceRoom(room, 'host', { t: 'start' }, 1000);
  if ('error' in started) throw new Error(started.error);
  return started.state;
}

function fillTable(player: RoomState['players'][number], count: number, revealed: boolean): void {
  player.table = Array.from({ length: count }, (_, index) => {
    const card = {
      id: `fill-${player.id}-${index}`,
      kind: 'normal' as const,
      color: 'periwinkle' as const,
      number: 1 as const,
      shape: 'circle' as const
    };
    return { card, revealed };
  });
}

function performSteal(
  room: RoomState,
  tableCount: number,
  revealed: boolean
): { room: RoomState; stolen: RoomState['players'][number]['table'][number] } {
  const active = room.players.find((player) => player.id === room.activePlayerId);
  const target = room.players.find((player) => player.id !== room.activePlayerId);
  if (!active || !target) throw new Error('Expected two players');
  fillTable(active, tableCount, revealed);
  target.table[0].revealed = revealed;
  const stolen = target.table[0];
  target.hand = target.hand.filter((card) => !(card.kind === 'action' && card.action === 'APPEAL'));
  active.hand.push({ id: `steal-${tableCount}`, kind: 'action', action: 'STEAL' });
  const result = reduceRoom(room, active.id, {
    t: 'action',
    cardId: `steal-${tableCount}`,
    kind: 'STEAL',
    targetId: target.id,
    slot: 0
  }, 1000);
  if ('error' in result) throw new Error(result.error);
  return { room: result.state, stolen };
}

function finishedRoom(): RoomState {
  const room = startTwoPlayerRoom();
  room.phase = 'finished';
  room.winnerId = room.players[0].id;
  room.winningSets = [[room.players[0].table[0].card.id, room.players[0].table[1].card.id, room.players[0].table[2].card.id]];
  room.turnEndsAt = null;
  room.turnRemainingMs = null;
  room.pendingAction = null;
  room.lastInterruptResult = { kind: 'STEAL', outcome: 'appealed', resolvedAt: 5000, appealDepth: 1, appealedBy: room.players[1].id };
  return room;
}

describe('room rules', () => {
  it('requires two players and starts a revealed three-card table plus one of each action card for each', () => {
    const room = createRoom('ABCD', 'host', 'host-session', 'Host', 'seed');
    expect(reduceRoom(room, 'host', { t: 'start' }, 1000)).toMatchObject({ error: 'At least two players are required to start' });

    const started = startTwoPlayerRoom();
    expect(started.phase).toBe('playing');
    expect(started.players.map((player) => player.table)).toHaveLength(2);
    expect(started.players.every((player) => player.table.length === 3)).toBe(true);
    expect(started.players.every((player) => player.table.every((slot) => slot.revealed))).toBe(true);
    for (const player of started.players) {
      // The starting Hand is exactly one of each action, in a fixed order,
      // followed by the one card drawn at turn start.
      expect(player.hand.slice(0, 4).map((card) => card.kind === 'action' ? card.action : card.kind))
        .toEqual(['CONCEAL', 'STEAL', 'REVEAL', 'APPEAL']);
      expect(player.hand.length).toBeGreaterThanOrEqual(4);
    }
    expect(started.deck.length).toBe(218 - 7 * started.players.length - 1);
    expect(started.turnEndsAt).toBe(61_000);
    expect(started.turnNumber).toBe(1);
    expect(started.players[0].id).not.toBe(started.players[0].sessionIds[0]);
    expect(started.players[0].sessionIds).not.toContain(started.players[0].id);
  });

  it('starts with 10 players but rejects 11 with a clear message', () => {
    let room = createRoom('ABCD', 'host', 'host-session', 'Host', 'seed');
    for (let index = 1; index <= 9; index += 1) {
      const joined = addParticipant(room, `player-${index}`, `Player ${index}`, 'player', `session-${index}`);
      if ('error' in joined) throw new Error(joined.error);
      room = joined.state;
    }
    const eleven = addParticipant(room, 'player-10', 'Player 10', 'player', 'session-10');
    if ('error' in eleven) throw new Error(eleven.error);
    const rejected = reduceRoom(eleven.state, 'host', { t: 'start' }, 1000);
    expect(rejected).toMatchObject({ error: 'Up to 10 players can start a game. Move extras to Spectator.' });
    expect(rejected.state.phase).toBe('lobby');

    const started = reduceRoom(room, 'host', { t: 'start' }, 1000);
    if ('error' in started) throw new Error(started.error);
    expect(started.state.phase).toBe('playing');
    expect(started.state.players.every((player) => player.table.length === 3)).toBe(true);
    expect(started.state.deck.length).toBe(218 - 7 * 10 - 1);
  });

  it('never restores a seat from its public participant ID', () => {
    const room = startTwoPlayerRoom();
    const host = room.players.find((player) => player.id === room.hostId);
    if (!host) throw new Error('Expected the host seat');
    expect(host.sessionIds).not.toContain(host.id);
    expect(requestRejoin(room, 'req', host.id, 'spectator-public', host.name, 0))
      .toMatchObject({ error: 'Rejoin session is invalid' });
  });

  it('limits lobby timer changes to the host and the configured 15–180 second range', () => {
    const room = createRoom('ABCD', 'host', 'host-session', 'Host', 'seed');
    const guest = addParticipant(room, 'guest', 'Guest', 'player', 'guest-session');
    if ('error' in guest) throw new Error(guest.error);
    expect(reduceRoom(guest.state, 'guest', { t: 'setTurnTimer', seconds: 30 }, 0))
      .toMatchObject({ error: 'Only the host can change the turn timer' });
    expect(reduceRoom(guest.state, 'host', { t: 'setTurnTimer', seconds: 181 }, 0))
      .toMatchObject({ error: 'Turn timer must be between 15 and 180 seconds' });
    expect(reduceRoom(guest.state, 'host', { t: 'setTurnTimer', seconds: 15 }, 0).state.turnDurationSeconds).toBe(15);
  });

  it('keeps unplayed Action cards between turns and discards other Hand cards', () => {
    const room = startTwoPlayerRoom();
    const active = room.players.find((player) => player.id === room.activePlayerId);
    if (!active) throw new Error('Expected an active player');
    active.hand = [];
    active.hand.push(
      { id: 'saved-appeal', kind: 'action', action: 'APPEAL' },
      { id: 'unused-steal', kind: 'action', action: 'STEAL' },
      { id: 'normal-card', kind: 'normal', color: 'periwinkle', number: 1, shape: 'circle', isRevealed: true }
    );
    const result = reduceRoom(room, active.id, { t: 'endTurn' }, 2000);
    if ('error' in result) throw new Error(result.error);
    expect(result.state.players.find((player) => player.id === active.id)?.hand)
      .toEqual([
        { id: 'saved-appeal', kind: 'action', action: 'APPEAL' },
        { id: 'unused-steal', kind: 'action', action: 'STEAL' }
      ]);
    expect(result.state.deck).toContainEqual({ id: 'normal-card', kind: 'normal', color: 'periwinkle', number: 1, shape: 'circle', isRevealed: true });
  });

  it('pauses the turn clock during an interrupt and resumes it after every appeal-holder passes', () => {
    const room = startTwoPlayerRoom();
    const active = room.players.find((player) => player.id === room.activePlayerId);
    const opponent = room.players.find((player) => player.id !== room.activePlayerId);
    if (!active || !opponent) throw new Error('Expected two players');
    active.hand.push({ id: 'conceal-action', kind: 'action', action: 'CONCEAL' });
    active.table[0].revealed = true;
    opponent.hand.push({ id: 'appeal', kind: 'action', action: 'APPEAL' });

    const action = reduceRoom(room, active.id, {
      t: 'action',
      cardId: 'conceal-action',
      kind: 'CONCEAL',
      targetId: active.id,
      slot: 0
    }, 10_000);
    if ('error' in action) throw new Error(action.error);
    expect(action.state.turnEndsAt).toBeNull();
    expect(action.state.turnRemainingMs).toBe(51_000);
    expect(action.state.pendingAction?.interrupt.endsAt).toBe(40_000);

    const passed = reduceRoom(action.state, opponent.id, { t: 'pass' }, 11_000);
    if ('error' in passed) throw new Error(passed.error);
    expect(passed.state.pendingAction).toBeNull();
    expect(passed.state.players.find((player) => player.id === active.id)?.table[0].revealed).toBe(false);
    expect(passed.state.turnEndsAt).toBe(62_000);
    expect(passed.state.lastInterruptResult).toEqual({ kind: 'CONCEAL', outcome: 'resolved', resolvedAt: 11_000, appealDepth: 0, appealedBy: null });
  });

  it('preserves a concealed card when stolen and reveals its identity only in authoritative state', () => {
    const room = startTwoPlayerRoom();
    const active = room.players.find((player) => player.id === room.activePlayerId);
    const target = room.players.find((player) => player.id !== room.activePlayerId);
    if (!active || !target) throw new Error('Expected two players');
    target.table[0].revealed = false;
    const stolen = target.table[0].card;
    // Remove the starting APPEAL so this STEAL resolves without an interrupt.
    target.hand = target.hand.filter((card) => !(card.kind === 'action' && card.action === 'APPEAL'));
    active.hand.push({ id: 'steal-action', kind: 'action', action: 'STEAL' });

    const result = reduceRoom(room, active.id, {
      t: 'action',
      cardId: 'steal-action',
      kind: 'STEAL',
      targetId: target.id,
      slot: 0
    }, 1000);
    if ('error' in result) throw new Error(result.error);
    expect(result.state.pendingAction).toBeNull();
    expect(result.state.players.find((player) => player.id === active.id)?.table.at(-1))
      .toEqual({ card: stolen, revealed: false });
  });

  it('keeps a steal on the Table below nine cards and preserves its reveal state', () => {
    const { room, stolen } = performSteal(startTwoPlayerRoom(), 8, false);
    const active = room.players.find((player) => player.id === room.activePlayerId);
    if (!active) throw new Error('Expected an active player');
    expect(active.table).toHaveLength(9);
    expect(active.table.at(-1)).toEqual(stolen);
    expect(active.table.at(-1)?.revealed).toBe(false);
    expect(active.hand.some((card) => card.id === stolen.card.id)).toBe(false);
    expect(room.lastInterruptResult).toEqual({ kind: 'STEAL', outcome: 'resolved', resolvedAt: 1000, appealDepth: 0, appealedBy: null });
  });

  it('sends a steal to Hand when the Table already has exactly nine cards', () => {
    const { room, stolen } = performSteal(startTwoPlayerRoom(), 9, true);
    const active = room.players.find((player) => player.id === room.activePlayerId);
    if (!active) throw new Error('Expected an active player');
    expect(active.table).toHaveLength(9);
    expect(active.hand.some((card) => card.id === stolen.card.id)).toBe(true);
    expect(room.lastInterruptResult).toEqual({
      kind: 'STEAL',
      outcome: 'resolved',
      resolvedAt: 1000,
      appealDepth: 0,
      appealedBy: null,
      stolenToHandBy: active.id
    });
  });

  it('sends a legacy over-limit STEAL to Hand instead of growing the Table', () => {
    const room = startTwoPlayerRoom();
    room.turnEndsAt = null;
    room.turnRemainingMs = 30_000;
    const active = room.players.find((player) => player.id === room.activePlayerId);
    const target = room.players.find((player) => player.id !== room.activePlayerId);
    if (!active || !target) throw new Error('Expected two players');
    fillTable(active, 10, true);
    const stolen = target.table[0].card;
    room.pendingAction = {
      actionCard: { id: 'legacy-over-limit-steal', kind: 'action', action: 'STEAL' },
      interrupt: {
        id: 'legacy-over-limit-interrupt',
        kind: 'STEAL',
        actorId: active.id,
        targetId: target.id,
        targetCardId: stolen.id,
        endsAt: 1000,
        appeals: [],
        responderIds: [target.id],
        passedIds: []
      },
      appealCards: []
    };

    const result = processDeadlines(room, 1000);
    const nextActive = result.state.players.find((player) => player.id === active.id);
    expect(nextActive?.table).toHaveLength(10);
    expect(nextActive?.hand.some((card) => card.id === stolen.id)).toBe(true);
  });

  it('allows an appeal chain: target appeals, actor counter-appeals, steal resolves', () => {
    const room = startTwoPlayerRoom();
    const active = room.players.find((player) => player.id === room.activePlayerId);
    const target = room.players.find((player) => player.id !== room.activePlayerId);
    if (!active || !target) throw new Error('Expected two players');
    fillTable(active, 9, true);
    const before = structuredClone(target.table);
    active.hand.push({ id: 'appealed-steal', kind: 'action', action: 'STEAL' });

    const opened = reduceRoom(room, active.id, {
      t: 'action',
      cardId: 'appealed-steal',
      kind: 'STEAL',
      targetId: target.id,
      slot: 0
    }, 1000);
    if ('error' in opened) throw new Error(opened.error);
    expect(opened.state.pendingAction).not.toBeNull();
    expect(opened.state.lastInterruptResult).toBeNull();

    const appeal = target.hand.find((card) => card.kind === 'action' && card.action === 'APPEAL');
    if (!appeal) throw new Error('Expected the target to hold APPEAL');
    const appealed = reduceRoom(opened.state, target.id, { t: 'appeal', cardId: appeal.id }, 2000);
    if ('error' in appealed) throw new Error(appealed.error);
    // Depth 1: still open, the actor may counter-appeal.
    expect(appealed.state.pendingAction).not.toBeNull();
    expect(appealed.state.lastInterruptResult).toBeNull();
    expect(appealed.state.players.find((player) => player.id === target.id)?.table).toEqual(before);

    const counterAppeal = active.hand.find((card) => card.kind === 'action' && card.action === 'APPEAL');
    if (!counterAppeal) throw new Error('Expected the actor to hold APPEAL');
    const resolved = reduceRoom(appealed.state, active.id, { t: 'appeal', cardId: counterAppeal.id }, 3000);
    if ('error' in resolved) throw new Error(resolved.error);
    // Depth 2 (even): the steal resolves normally, card moved to actor's Hand.
    expect(resolved.state.pendingAction).toBeNull();
    expect(resolved.state.lastInterruptResult).toEqual({
      kind: 'STEAL',
      outcome: 'resolved',
      resolvedAt: 3000,
      appealDepth: 2,
      appealedBy: null,
      stolenToHandBy: 'host'
    });
    expect(resolved.state.players.find((player) => player.id === active.id)?.hand.some((card) => card.id === before[0]?.card.id)).toBe(true);
  });

  it('is deterministic for the same seed and action sequence', () => {
    const first = performSteal(startTwoPlayerRoom(), 9, false);
    // startTwoPlayerRoom always uses the same seed, so the deal and resolution
    // must be identical, including which card went to Hand.
    const second = performSteal(startTwoPlayerRoom(), 9, false);
    expect(first).toEqual(second);
  });

  it('never leaves more than nine cards on a Table after a steal', () => {
    fc.assert(fc.property(
      fc.integer({ min: 3, max: 9 }),
      fc.boolean(),
      (tableCount, revealed) => {
        const { room } = performSteal(startTwoPlayerRoom(), tableCount, revealed);
        for (const player of room.players) {
          expect(player.table.length).toBeLessThanOrEqual(9);
        }
        const active = room.players.find((player) => player.id === room.activePlayerId);
        if (!active) throw new Error('Expected an active player');
        expect(active.table).toHaveLength(tableCount === 9 ? 9 : tableCount + 1);
      }
    ), { numRuns: 10 });
  });

  it('rejects ending a turn while any Table is over nine cards', () => {
    const room = startTwoPlayerRoom();
    const active = room.players.find((player) => player.id === room.activePlayerId);
    if (!active) throw new Error('Expected an active player');
    fillTable(active, 10, false);

    const result = reduceRoom(room, active.id, { t: 'endTurn' }, 2000);

    expect(result).toMatchObject({ error: 'A Table cannot hold more than 9 cards' });
    expect(result.state.activePlayerId).toBe(active.id);
    expect(result.state.players.find((player) => player.id === active.id)?.table).toHaveLength(10);
  });

  it('does not trim an oversized legacy Table during timer expiry', () => {
    const room = startTwoPlayerRoom();
    const active = room.players.find((player) => player.id === room.activePlayerId);
    if (!active) throw new Error('Expected an active player');
    fillTable(active, 10, false);
    const tableBeforeExpiry = structuredClone(active.table);
    room.turnEndsAt = 2000;

    const expired = processDeadlines(room, 2000);

    expect(expired.state.players.find((player) => player.id === active.id)?.table).toEqual(tableBeforeExpiry);
    expect(expired.state.players.find((player) => player.id === active.id)?.table).toHaveLength(10);
  });

  it('rejects REVEAL without consuming the action card when no concealed card exists', () => {
    const room = startTwoPlayerRoom();
    const active = room.players.find((player) => player.id === room.activePlayerId);
    const target = room.players.find((player) => player.id !== room.activePlayerId);
    if (!active || !target) throw new Error('Expected two players');
    // Starting Table cards are dealt revealed, so REVEAL has no valid target yet.
    expect(target.table.every((slot) => slot.revealed)).toBe(true);
    active.hand.push({ id: 'reveal-action', kind: 'action', action: 'REVEAL' });
    const result = reduceRoom(room, active.id, {
      t: 'action',
      cardId: 'reveal-action',
      kind: 'REVEAL',
      targetId: target.id,
      slot: 0
    }, 1000);
    expect(result).toMatchObject({ error: 'REVEAL requires a concealed Table card' });
    expect(active.hand.some((card) => card.id === 'reveal-action')).toBe(true);
  });

  it('marks disconnected players away after 60 seconds and skips their active turn', () => {
    let room = startTwoPlayerRoom();
    const activeId = room.activePlayerId;
    if (!activeId) throw new Error('Expected an active player');
    room = setParticipantConnected(room, activeId, false, 10_000);
    expect(nextRoomDeadline(room)).toBe(61_000);
    const deadline = processDeadlines(room, 70_000);
    expect(deadline.state.players.find((player) => player.id === activeId)?.away).toBe(true);
    expect(deadline.state.activePlayerId).not.toBe(activeId);
  });

  it('turns an unanswered rejoin request into a spectator using a unique display name', () => {
    const room = startTwoPlayerRoom();
    const requester = requestRejoin(room, 'request', 'new-session', 'spectator-public', 'Guest', 100);
    if ('error' in requester) throw new Error(requester.error);
    expect(nextRoomDeadline(requester.state)).toBe(60_100);
    const timedOut = processDeadlines(requester.state, 60_100);
    expect(timedOut.expiredRejoinIds).toEqual(['request']);
    expect(timedOut.state.spectators).toEqual([
      { id: 'spectator-public', sessionIds: ['new-session'], name: 'Guest (spectator)', connected: true, left: false }
    ]);
  });

  it('transfers host ownership when the current host disconnects', () => {
    const room = startTwoPlayerRoom();
    const nextHost = room.players.find((player) => player.id !== room.hostId);
    if (!nextHost) throw new Error('Expected a second player');
    const disconnected = setParticipantConnected(room, room.hostId, false, 500);
    expect(disconnected.hostId).toBe(nextHost.id);
  });

  it('transfers host to a connected player without changing seats or phase', () => {
    const room = startTwoPlayerRoom();
    const guest = room.players.find((player) => player.id !== room.hostId);
    if (!guest) throw new Error('Expected a second player');
    const result = transferHostTo(room, room.hostId, guest.id);
    if ('error' in result) throw new Error(result.error);
    expect(result.state.hostId).toBe(guest.id);
    expect(result.state.players).toEqual(room.players);
    expect(result.state.spectators).toEqual(room.spectators);
    expect(result.state.phase).toBe('playing');
    // The helper is pure: the input room is untouched.
    expect(room.hostId).toBe('host');
  });

  it('transfers host after the game is finished without changing the result', () => {
    const room = finishedRoom();
    const nextHost = room.players.find((player) => player.id !== room.hostId);
    if (!nextHost) throw new Error('Expected a second player');

    const result = transferHostTo(room, room.hostId, nextHost.id);
    if ('error' in result) throw new Error(result.error);
    expect(result.state.hostId).toBe(nextHost.id);
    expect(result.state.phase).toBe('finished');
    expect(result.state.winnerId).toBe(room.winnerId);
    expect(result.state.winningSets).toEqual(room.winningSets);
  });

  it('transfers host while paused and leaves the pause and rejoin requests alone', () => {
    const room = startTwoPlayerRoom();
    const guest = room.players.find((player) => player.id !== room.hostId);
    if (!guest) throw new Error('Expected a second player');
    const request = requestRejoin(room, 'req', 'new-session', 'spectator-public', 'Guest', 0);
    if ('error' in request) throw new Error(request.error);
    const paused = reduceRoom(request.state, room.hostId, { t: 'pause' }, 1_000);
    if ('error' in paused) throw new Error(paused.error);

    const result = transferHostTo(paused.state, room.hostId, guest.id);
    if ('error' in result) throw new Error(result.error);
    expect(result.state.hostId).toBe(guest.id);
    expect(result.state.paused).toBe(true);
    expect(result.state.pauseRemaining).toEqual(paused.state.pauseRemaining);
    expect(result.state.rejoinRequests).toEqual(paused.state.rejoinRequests);
  });

  it('transfers host in the lobby and to a connected spectator', () => {
    const created = createRoom('ABCD', 'host', 'host-session', 'Host', 'seed');
    const guest = addParticipant(created, 'guest', 'Guest', 'player', 'guest-session');
    if ('error' in guest) throw new Error(guest.error);
    const spectator = addParticipant(guest.state, 'spec', 'Spec', 'spectator', 'spec-session');
    if ('error' in spectator) throw new Error(spectator.error);

    const lobbyTransfer = transferHostTo(spectator.state, 'host', 'guest');
    if ('error' in lobbyTransfer) throw new Error(lobbyTransfer.error);
    expect(lobbyTransfer.state.hostId).toBe('guest');
    expect(lobbyTransfer.state.phase).toBe('lobby');

    const spectatorTransfer = transferHostTo(lobbyTransfer.state, 'guest', 'spec');
    if ('error' in spectatorTransfer) throw new Error(spectatorTransfer.error);
    expect(spectatorTransfer.state.hostId).toBe('spec');
  });

  it('rejects invalid host transfer attempts with clear errors', () => {
    const room = startTwoPlayerRoom();
    const guest = room.players.find((player) => player.id !== room.hostId);
    if (!guest) throw new Error('Expected a second player');

    expect(transferHostTo(room, guest.id, room.hostId))
      .toMatchObject({ error: 'Only the host can transfer host' });
    expect(transferHostTo(room, room.hostId, room.hostId))
      .toMatchObject({ error: 'The host cannot transfer host to themselves' });
    expect(transferHostTo(room, room.hostId, 'missing-member'))
      .toMatchObject({ error: 'That member is not in this room' });

    const disconnected = structuredClone(room);
    const disconnectedGuest = disconnected.players.find((player) => player.id === guest.id);
    if (!disconnectedGuest) throw new Error('Expected the guest');
    disconnectedGuest.connected = false;
    expect(transferHostTo(disconnected, room.hostId, guest.id))
      .toMatchObject({ error: 'You can only transfer host to a connected member' });

    const kicked = structuredClone(room);
    const kickedGuest = kicked.players.find((player) => player.id === guest.id);
    if (!kickedGuest) throw new Error('Expected the guest');
    kickedGuest.kicked = true;
    expect(transferHostTo(kicked, room.hostId, guest.id))
      .toMatchObject({ error: 'That member is not in this room' });

    const left = structuredClone(room);
    const leftGuest = left.players.find((player) => player.id === guest.id);
    if (!leftGuest) throw new Error('Expected the guest');
    leftGuest.left = true;
    expect(transferHostTo(left, room.hostId, guest.id))
      .toMatchObject({ error: 'That member is not in this room' });
  });

  it('always leaves exactly one host after repeated transfers', () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 10 }), (count) => {
      let room = startRoomWithPlayers(count);
      const target = room.players.find((player) => player.id !== room.hostId);
      if (!target) throw new Error('Expected another player');
      const result = transferHostTo(room, room.hostId, target.id);
      if ('error' in result) throw new Error(result.error);
      room = result.state;
      const members = [...room.players, ...room.spectators];
      expect(members.filter((member) => member.id === room.hostId)).toHaveLength(1);
    }), { numRuns: 9 });
  });

  it('requires host approval before binding a rejoin request to its seat', () => {
    const room = startTwoPlayerRoom();
    const request = requestRejoin(room, 'req', 'new-session', 'spectator-public', 'Guest', 0);
    if ('error' in request) throw new Error(request.error);
    const targetPlayer = request.state.players.find((player) => player.name === 'Guest');
    if (!targetPlayer) throw new Error('Expected rejoin target');
    expect(resolveRejoinRequest(request.state, 'not-host', 'req', true, 100).result)
      .toMatchObject({ error: 'Only the host can decide rejoin requests' });
    const accepted = resolveRejoinRequest(request.state, request.state.hostId, 'req', true, 100);
    expect(accepted.acceptedPlayerId).toBe(targetPlayer.id);
    expect(accepted.result.state.players.find((player) => player.id === targetPlayer.id)?.connected).toBe(true);
    expect(accepted.result.state.rejoinRequests).toHaveLength(0);
  });

  it('assigns next available Player N name when default name is taken', () => {
    // Create room with host
    let room = createRoom('ABCD', 'host', 'host-session', 'Host', 'seed');

    // Add first player with default name "Player 1"
    let result = addParticipant(room, 'player1', 'Player 1', 'player', 'player1-session');
    expect('error' in result).toBe(false);
    room = result.state;

    // Add second player with default name "Player 1" - should get "Player 2"
    result = addParticipant(room, 'player2', 'Player 1', 'player', 'player2-session');
    expect('error' in result).toBe(false);
    room = result.state;
    const player2 = room.players.find(p => p.id === 'player2');
    expect(player2).toBeDefined();
    expect(player2?.name).toBe('Player 2');

    // Add third player with default name "Player 1" - should get "Player 3"
    result = addParticipant(room, 'player3', 'Player 1', 'player', 'player3-session');
    expect('error' in result).toBe(false);
    room = result.state;
    const player3 = room.players.find(p => p.id === 'player3');
    expect(player3).toBeDefined();
    expect(player3?.name).toBe('Player 3');

    // Add fourth player with default name "Player 1" - should get "Player 4"
    result = addParticipant(room, 'player4', 'Player 1', 'player', 'player4-session');
    expect('error' in result).toBe(false);
    room = result.state;
    const player4 = room.players.find(p => p.id === 'player4');
    expect(player4).toBeDefined();
    expect(player4?.name).toBe('Player 4');
  });

  it('reuses freed Player N numbers when players leave', () => {
    // Create room with host
    let room = createRoom('ABCD', 'host', 'host-session', 'Host', 'seed');

    // Add three players with default names
    let result = addParticipant(room, 'p1', 'Player 1', 'player', 's1');
    expect('error' in result).toBe(false);
    room = result.state;

    result = addParticipant(room, 'p2', 'Player 1', 'player', 's2');
    expect('error' in result).toBe(false);
    room = result.state;

    result = addParticipant(room, 'p3', 'Player 1', 'player', 's3');
    expect('error' in result).toBe(false);
    room = result.state;

    // Verify we have Player 1, 2, 3
    expect(room.players.find(p => p.name === 'Player 1')).toBeDefined();
    expect(room.players.find(p => p.name === 'Player 2')).toBeDefined();
    expect(room.players.find(p => p.name === 'Player 3')).toBeDefined();

    // Remove Player 2
    room = {
      ...room,
      players: room.players.filter(p => p.id !== 'p2')
    };

    // Add new player with default name - should get Player 2 (the freed number)
    result = addParticipant(room, 'p4', 'Player 1', 'player', 's4');
    expect('error' in result).toBe(false);
    room = result.state;
    const newPlayer = room.players.find(p => p.id === 'p4');
    expect(newPlayer).toBeDefined();
    expect(newPlayer?.name).toBe('Player 2');
  });

  it('still rejects custom names that are taken', () => {
    // Create room with host
    let room = createRoom('ABCD', 'host', 'host-session', 'Host', 'seed');

    // Add a player with custom name
    let result = addParticipant(room, 'player1', 'Alice', 'player', 'player1-session');
    expect('error' in result).toBe(false);
    room = result.state;

    // Try to add another player with the same custom name - should fail
    result = addParticipant(room, 'player2', 'Alice', 'player', 'player2-session');
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toBe('That name is already in use');
    }

    // Try with different case - should still fail (case-insensitive)
    result = addParticipant(room, 'player3', 'alice', 'player', 'player3-session');
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toBe('That name is already in use');
    }
  });

  it('allows custom names that are not taken', () => {
    // Create room with host
    let room = createRoom('ABCD', 'host', 'host-session', 'Host', 'seed');

    // Add a player with custom name
    let result = addParticipant(room, 'player1', 'Alice', 'player', 'player1-session');
    expect('error' in result).toBe(false);
    room = result.state;

    // Add another player with different custom name - should succeed
    result = addParticipant(room, 'player2', 'Bob', 'player', 'player2-session');
    expect('error' in result).toBe(false);
    room = result.state;
    const bob = room.players.find(p => p.id === 'player2');
    expect(bob).toBeDefined();
    expect(bob?.name).toBe('Bob');
  });

  it('simulates multiple tabs joining lobby with default name', () => {    // Simulate the scenario described in the task:
    // 1. Open three tabs and join lobby - should get Player 1, 2, 3
    // 2. Fourth tab joins without error - should get Player 4
    // 3. Close second tab, open new one - should get Player 2 (freed name)

    let room = createRoom('ABCD', 'host', 'host-session', 'Host', 'seed');

    // Tab 1: joins lobby (public ID: tab1-public, session ID: tab1-session)
    let result = addParticipant(room, 'tab1-public', 'Player 1', 'player', 'tab1-session');
    expect('error' in result).toBe(false);
    room = result.state;
    expect(room.players.find(p => p.id === 'tab1-public')?.name).toBe('Player 1');

    // Tab 2: joins lobby (public ID: tab2-public, session ID: tab2-session)
    result = addParticipant(room, 'tab2-public', 'Player 1', 'player', 'tab2-session');
    expect('error' in result).toBe(false);
    room = result.state;
    expect(room.players.find(p => p.id === 'tab2-public')?.name).toBe('Player 2');

    // Tab 3: joins lobby (public ID: tab3-public, session ID: tab3-session)
    result = addParticipant(room, 'tab3-public', 'Player 1', 'player', 'tab3-session');
    expect('error' in result).toBe(false);
    room = result.state;
    expect(room.players.find(p => p.id === 'tab3-public')?.name).toBe('Player 3');

    // Tab 4: joins lobby (public ID: tab4-public, session ID: tab4-session)
    result = addParticipant(room, 'tab4-public', 'Player 1', 'player', 'tab4-session');
    expect('error' in result).toBe(false);
    room = result.state;
    expect(room.players.find(p => p.id === 'tab4-public')?.name).toBe('Player 4');

    // Verify we have Players 1, 2, 3, 4 plus the Host
    const playerNames = room.players.map(p => p.name).sort();
    expect(playerNames).toEqual(['Host', 'Player 1', 'Player 2', 'Player 3', 'Player 4']);

    // Close Tab 2 (simulate by removing the player with public ID tab2-public)
    room = {
      ...room,
      players: room.players.filter(p => p.id !== 'tab2-public')
    };

    // New Tab joins (simulating Tab 2 being reopened) - public ID: tab5-public, session ID: tab5-session
    result = addParticipant(room, 'tab5-public', 'Player 1', 'player', 'tab5-session');
    expect('error' in result).toBe(false);
    room = result.state;

    // The new player should get the freed name "Player 2"
    expect(room.players.find(p => p.id === 'tab5-public')?.name).toBe('Player 2');

    // Verify final state: Players 1, 2 (from tab5), 3, 4 plus the Host
    const finalPlayerNames = room.players.map(p => p.name).sort();
    expect(finalPlayerNames).toEqual(['Host', 'Player 1', 'Player 2', 'Player 3', 'Player 4']);
  });
});

function clearAppeals(player: RoomState['players'][number]): void {
  player.hand = player.hand.filter((card) => !(card.kind === 'action' && card.action === 'APPEAL'));
}

/** Counts every card that exists, including cards held out of play in a chain. */
function countCards(room: RoomState): number {
  const held = room.pendingAction ? 1 + room.pendingAction.appealCards.length : 0;
  return room.deck.length
    + held
    + room.players.reduce((sum, player) => sum + player.hand.length + player.table.length, 0);
}

function startStealChain(): { room: RoomState; activeId: string; targetId: string; targetTable: RoomState['players'][number]['table'] } {
  const room = startTwoPlayerRoom();
  const active = room.players.find((player) => player.id === room.activePlayerId);
  const target = room.players.find((player) => player.id !== room.activePlayerId);
  if (!active || !target) throw new Error('Expected two players');
  clearAppeals(active);
  clearAppeals(target);
  active.hand.push({ id: 'chain-steal', kind: 'action', action: 'STEAL' });
  for (let index = 0; index < 8; index += 1) {
    active.hand.push({ id: `active-appeal-${index}`, kind: 'action', action: 'APPEAL' });
    target.hand.push({ id: `target-appeal-${index}`, kind: 'action', action: 'APPEAL' });
  }
  const targetTable = structuredClone(target.table);
  const opened = reduceRoom(room, active.id, {
    t: 'action',
    cardId: 'chain-steal',
    kind: 'STEAL',
    targetId: target.id,
    slot: 0
  }, 10_000);
  if ('error' in opened) throw new Error(opened.error);
  return { room: opened.state, activeId: active.id, targetId: target.id, targetTable };
}

function appealFor(room: RoomState, playerId: string, now: number): RoomState {
  const player = room.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error('Expected the appealing player');
  const card = player.hand.find((candidate) => candidate.kind === 'action' && candidate.action === 'APPEAL');
  if (!card) throw new Error('Expected an APPEAL card');
  const result = reduceRoom(room, playerId, { t: 'appeal', cardId: card.id }, now);
  if ('error' in result) throw new Error(result.error);
  return result.state;
}

function passFor(room: RoomState, playerId: string, now: number): RoomState {
  const result = reduceRoom(room, playerId, { t: 'pass' }, now);
  if ('error' in result) throw new Error(result.error);
  return result.state;
}

/**
 * Plays `appeals` alternating links, then has the next eligible player pass.
 * For a STEAL the target responds on even depth and the actor on odd depth.
 */
function runStealChain(appeals: number): {
  state: RoomState;
  activeId: string;
  targetId: string;
  targetTable: RoomState['players'][number]['table'];
  cardsBefore: number;
} {
  const start = startStealChain();
  const cardsBefore = countCards(start.room);
  let state = start.room;
  let now = 10_000;
  for (let depth = 0; depth < appeals; depth += 1) {
    const expectedResponder = depth % 2 === 0 ? start.targetId : start.activeId;
    const interrupt = state.pendingAction?.interrupt;
    if (!interrupt) throw new Error('Expected an open interrupt');
    expect(interrupt.appeals.length).toBe(depth);
    expect(eligibleAppealIds(interrupt)).toEqual([expectedResponder]);
    now += 1000;
    state = appealFor(state, expectedResponder, now);
    expect(state.pendingAction?.interrupt.endsAt).toBe(now + 30_000);
    expect(state.turnEndsAt).toBeNull();
  }
  const terminalPlayer = appeals % 2 === 0 ? start.targetId : start.activeId;
  now += 1000;
  state = passFor(state, terminalPlayer, now);
  return { state, activeId: start.activeId, targetId: start.targetId, targetTable: start.targetTable, cardsBefore };
}

describe('appeal chain parity and eligibility', () => {
  it('alternates eligibility and resolves by appeal parity for every chain length', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 6 }), (appeals) => {
      const { state, activeId, targetId, targetTable, cardsBefore } = runStealChain(appeals);
      expect(state.pendingAction).toBeNull();
      expect(state.lastInterruptResult?.appealDepth).toBe(appeals);
      expect(state.lastInterruptResult?.outcome).toBe(appeals % 2 === 1 ? 'appealed' : 'resolved');
      expect(state.lastInterruptResult?.appealedBy).toBe(appeals % 2 === 1 ? targetId : null);
      const target = state.players.find((player) => player.id === targetId);
      if (appeals % 2 === 1) {
        // Odd: the action was cancelled, so the card never left the Table.
        expect(target?.table).toEqual(targetTable);
      } else {
        // Even (including zero): the STEAL resolves.
        expect(target?.table.some((slot) => slot.card.id === targetTable[0].card.id)).toBe(false);
        const actor = state.players.find((player) => player.id === activeId);
        const holder = actor?.table.some((slot) => slot.card.id === targetTable[0].card.id)
          || actor?.hand.some((card) => card.id === targetTable[0].card.id);
        expect(holder).toBe(true);
      }
      // Every action and APPEAL card returns to the deck once the chain ends.
      expect(countCards(state)).toBe(cardsBefore);
      expect(state.deck.some((card) => card.id === 'chain-steal')).toBe(true);
    }), { numRuns: 7 });
  });

  it('rejects the player who is not the current link responder', () => {
    const start = startStealChain();
    const active = start.room.players.find((player) => player.id === start.activeId);
    const target = start.room.players.find((player) => player.id === start.targetId);
    if (!active || !target) throw new Error('Expected two players');
    const targetAppeal = target.hand.find((card) => card.kind === 'action' && card.action === 'APPEAL');
    const activeAppeal = active.hand.find((card) => card.kind === 'action' && card.action === 'APPEAL');
    if (!targetAppeal || !activeAppeal) throw new Error('Expected APPEAL cards');

    // Depth 0 belongs to the target; the actor cannot answer.
    expect(reduceRoom(start.room, start.activeId, { t: 'appeal', cardId: activeAppeal.id }, 11_000))
      .toMatchObject({ error: 'You are not eligible to respond to this interrupt' });
    // Depth 1 belongs to the actor; the target cannot answer again.
    const linked = appealFor(start.room, start.targetId, 11_000);
    expect(reduceRoom(linked, start.targetId, { t: 'pass' }, 12_000))
      .toMatchObject({ error: 'You are not eligible to respond to this interrupt' });
    // Depth 2 belongs to the first appealer again.
    const counter = appealFor(linked, start.activeId, 12_000);
    expect(reduceRoom(counter, start.activeId, { t: 'pass' }, 13_000))
      .toMatchObject({ error: 'You are not eligible to respond to this interrupt' });
  });

  it('turns a CONCEAL race into an alternating chain and preserves the first appealer', () => {
    const room = startRoomWithPlayers(3);
    const actor = room.players.find((player) => player.id === room.activePlayerId);
    const opponents = room.players.filter((player) => player.id !== room.activePlayerId);
    if (!actor || opponents.length !== 2) throw new Error('Expected three players');
    actor.hand.push({ id: 'race-conceal', kind: 'action', action: 'CONCEAL' });
    actor.table[0].revealed = true;
    for (const opponent of opponents) {
      clearAppeals(opponent);
      opponent.hand.push({ id: `race-appeal-${opponent.id}`, kind: 'action', action: 'APPEAL' });
    }
    const opened = reduceRoom(room, actor.id, {
      t: 'action',
      cardId: 'race-conceal',
      kind: 'CONCEAL',
      targetId: actor.id,
      slot: 0
    }, 10_000);
    if ('error' in opened) throw new Error(opened.error);
    expect(opened.state.pendingAction?.interrupt.responderIds).toEqual(opponents.map((player) => player.id));

    const [first, second] = opponents;
    const linked = appealFor(opened.state, first.id, 11_000);
    expect(linked.pendingAction?.interrupt.appeals).toEqual([{ playerId: first.id, cardId: `race-appeal-${first.id}` }]);
    // Once one opponent appeals, only the actor can answer; the other opponent is out.
    expect(reduceRoom(linked, second.id, { t: 'pass' }, 12_000))
      .toMatchObject({ error: 'You are not eligible to respond to this interrupt' });

    // Odd depth: the actor passes and the CONCEAL is cancelled.
    const cancelled = passFor(linked, actor.id, 12_000);
    expect(cancelled.lastInterruptResult).toMatchObject({
      kind: 'CONCEAL',
      outcome: 'appealed',
      appealDepth: 1,
      appealedBy: first.id
    });
    expect(cancelled.players.find((player) => player.id === actor.id)?.table[0].revealed).toBe(true);
  });

  it('auto-passes a link when the responder holds no APPEAL', () => {
    // Odd link: the target appeals, then the actor has no counter-appeal.
    const odd = startStealChain();
    const oddActive = odd.room.players.find((player) => player.id === odd.activeId);
    if (!oddActive) throw new Error('Expected the actor');
    clearAppeals(oddActive);
    const oddState = appealFor(odd.room, odd.targetId, 11_000);
    expect(oddState.pendingAction).toBeNull();
    expect(oddState.lastInterruptResult).toMatchObject({
      kind: 'STEAL',
      outcome: 'appealed',
      appealDepth: 1,
      appealedBy: odd.targetId
    });
    // The action was cancelled and every chain card returned to the deck.
    expect(oddState.deck.some((card) => card.id === 'chain-steal')).toBe(true);
    expect(countCards(oddState)).toBe(countCards(odd.room));

    // Even link: target appeals, actor counters, target has no second APPEAL.
    const even = startStealChain();
    const evenActive = even.room.players.find((player) => player.id === even.activeId);
    const evenTarget = even.room.players.find((player) => player.id === even.targetId);
    if (!evenActive || !evenTarget) throw new Error('Expected two players');
    clearAppeals(evenTarget);
    evenTarget.hand.push({ id: 'only-target-appeal', kind: 'action', action: 'APPEAL' });
    clearAppeals(evenActive);
    evenActive.hand.push({ id: 'only-active-appeal', kind: 'action', action: 'APPEAL' });
    const firstLink = appealFor(even.room, even.targetId, 11_000);
    const evenState = appealFor(firstLink, even.activeId, 12_000);
    expect(evenState.pendingAction).toBeNull();
    expect(evenState.lastInterruptResult).toMatchObject({
      kind: 'STEAL',
      outcome: 'resolved',
      appealDepth: 2,
      appealedBy: null
    });
    expect(evenState.players.find((player) => player.id === even.targetId)?.table
      .some((slot) => slot.card.id === even.targetTable[0].card.id)).toBe(false);
  });

  it('applies parity when a chain expires mid-link', () => {
    for (const appeals of [0, 1, 2]) {
      const start = startStealChain();
      let state = start.room;
      let now = 10_000;
      for (let depth = 0; depth < appeals; depth += 1) {
        const responder = depth % 2 === 0 ? start.targetId : start.activeId;
        now += 1000;
        state = appealFor(state, responder, now);
      }
      const endsAt = state.pendingAction?.interrupt.endsAt;
      if (endsAt === null || endsAt === undefined) throw new Error('Expected a live deadline');
      state = processDeadlines(state, endsAt).state;
      expect(state.pendingAction).toBeNull();
      expect(state.lastInterruptResult?.appealDepth).toBe(appeals);
      if (appeals === 0) {
        expect(state.lastInterruptResult?.outcome).toBe('expired');
        expect(state.lastInterruptResult?.appealedBy).toBeNull();
        // A timed-out action still resolves after its 30 seconds.
        expect(state.players.find((player) => player.id === start.targetId)?.table
          .some((slot) => slot.card.id === start.targetTable[0].card.id)).toBe(false);
      } else if (appeals % 2 === 1) {
        expect(state.lastInterruptResult?.outcome).toBe('appealed');
        expect(state.lastInterruptResult?.appealedBy).toBe(start.targetId);
        expect(state.players.find((player) => player.id === start.targetId)?.table).toEqual(start.targetTable);
      } else {
        expect(state.lastInterruptResult?.outcome).toBe('resolved');
        expect(state.lastInterruptResult?.appealedBy).toBeNull();
        expect(state.players.find((player) => player.id === start.targetId)?.table
          .some((slot) => slot.card.id === start.targetTable[0].card.id)).toBe(false);
      }
    }
  });

  it('keeps the turn paused through every link and is deterministic for the same sequence', () => {
    const first = runStealChain(4);
    const second = runStealChain(4);
    expect(first.state).toEqual(second.state);
    const active = first.state.players.find((player) => player.id === first.activeId);
    expect(active).toBeDefined();
    expect(first.state.turnEndsAt).toBe(10_000 + 4 * 1000 + 1000 + 51_000);
  });
});

function interruptRoom(): RoomState {
  const room = startTwoPlayerRoom();
  const active = room.players.find((player) => player.id === room.activePlayerId);
  const opponent = room.players.find((player) => player.id !== room.activePlayerId);
  if (!active || !opponent) throw new Error('Expected two players');
  active.hand.push({ id: 'conceal-action', kind: 'action', action: 'CONCEAL' });
  active.table[0].revealed = true;
  opponent.hand.push({ id: 'appeal', kind: 'action', action: 'APPEAL' });
  const action = reduceRoom(room, active.id, {
    t: 'action',
    cardId: 'conceal-action',
    kind: 'CONCEAL',
    targetId: active.id,
    slot: 0
  }, 10_000);
  if ('error' in action) throw new Error(action.error);
  return action.state;
}

describe('interrupt response validation', () => {
  it('rejects late responses and resolves based on appeal parity once the link expires', () => {
    const start = startStealChain();
    const target = start.room.players.find((player) => player.id === start.targetId);
    const active = start.room.players.find((player) => player.id === start.activeId);
    if (!target || !active) throw new Error('Expected two players');

    const linked = appealFor(start.room, start.targetId, 11_000);
    const current = linked.pendingAction?.interrupt;
    if (!current || current.endsAt === null) throw new Error('Expected a live interrupt');
    const before = structuredClone(linked);
    const late = reduceRoom(linked, start.activeId, { t: 'pass' }, current.endsAt + 1);
    expect(late).toMatchObject({ error: 'The interrupt window has ended' });
    expect(late.state).toEqual(before);

    const expired = processDeadlines(linked, current.endsAt + 1).state;
    expect(expired.pendingAction).toBeNull();
    expect(expired.lastInterruptResult).toMatchObject({
      kind: 'STEAL',
      outcome: 'appealed',
      appealDepth: 1,
      appealedBy: start.targetId
    });
  });

  it('rejects out-of-turn responses without changing state or ending the chain', () => {
    const start = startStealChain();
    const active = start.room.players.find((player) => player.id === start.activeId);
    const target = start.room.players.find((player) => player.id === start.targetId);
    if (!active || !target) throw new Error('Expected two players');
    const targetAppeal = target.hand.find((card) => card.kind === 'action' && card.action === 'APPEAL');
    const activeAppeal = active.hand.find((card) => card.kind === 'action' && card.action === 'APPEAL');
    if (!targetAppeal || !activeAppeal) throw new Error('Expected APPEAL cards');

    const linked = appealFor(start.room, start.targetId, 11_000);
    const before = structuredClone(linked);
    const wrong = reduceRoom(linked, start.targetId, { t: 'pass' }, 12_000);
    expect(wrong).toMatchObject({ error: 'You are not eligible to respond to this interrupt' });
    expect(wrong.state).toEqual(before);
    expect(linked.pendingAction).not.toBeNull();

    const validCounter = reduceRoom(linked, start.activeId, { t: 'appeal', cardId: activeAppeal.id }, 12_000);
    if ('error' in validCounter) throw new Error(validCounter.error);
    expect(validCounter.state.pendingAction).not.toBeNull();
  });

  it('rejects duplicate and post-resolution appeal or pass messages cleanly', () => {
    const room = interruptRoom();
    const opponent = room.players.find((player) => player.id !== room.activePlayerId);
    if (!opponent) throw new Error('Expected an opponent');
    const before = structuredClone(room);

    const firstPass = reduceRoom(room, opponent.id, { t: 'pass' }, 11_000);
    if ('error' in firstPass) throw new Error(firstPass.error);
    expect(firstPass.state.pendingAction).toBeNull();

    const duplicatePass = reduceRoom(firstPass.state, opponent.id, { t: 'pass' }, 12_000);
    expect(duplicatePass).toMatchObject({ error: 'There is no interrupt to respond to' });
    expect(duplicatePass.state).toEqual(firstPass.state);

    const duplicateAppeal = reduceRoom(firstPass.state, opponent.id, { t: 'appeal', cardId: 'unused' }, 12_000);
    expect(duplicateAppeal).toMatchObject({ error: 'There is no interrupt to respond to' });
    expect(duplicateAppeal.state).toEqual(firstPass.state);

    const unresolved = startStealChain();
    const unresolvedBefore = structuredClone(unresolved.room);
    const stillOpen = reduceRoom(unresolved.room, unresolved.targetId, { t: 'pass' }, 11_000);
    if ('error' in stillOpen) throw new Error(stillOpen.error);
    expect(stillOpen.state.pendingAction).toBeNull();
    const duplicateEarly = reduceRoom(stillOpen.state, unresolved.targetId, { t: 'pass' }, 12_000);
    expect(duplicateEarly).toMatchObject({ error: 'There is no interrupt to respond to' });
    expect(duplicateEarly.state).toEqual(stillOpen.state);
    expect(before).toEqual(room);
    expect(unresolvedBefore).toEqual(unresolved.room);
  });
});

describe('host pause and resume', () => {
  it('only allows the host to pause and resume during play', () => {
    const room = startTwoPlayerRoom();
    const guest = room.players.find((player) => player.id !== room.hostId);
    if (!guest) throw new Error('Expected a guest');
    expect(reduceRoom(room, guest.id, { t: 'pause' }, 0))
      .toMatchObject({ error: 'Only the host can pause the game' });

    const lobby = createRoom('WXYZ', 'host', 'host-session', 'Host', 'seed');
    expect(reduceRoom(lobby, 'host', { t: 'pause' }, 0))
      .toMatchObject({ error: 'The game can only be paused during play' });

    const paused = reduceRoom(room, room.hostId, { t: 'pause' }, 0);
    if ('error' in paused) throw new Error(paused.error);
    expect(paused.state.paused).toBe(true);
    expect(reduceRoom(paused.state, room.hostId, { t: 'pause' }, 0))
      .toMatchObject({ error: 'The game is already paused' });
    expect(reduceRoom(paused.state, guest.id, { t: 'resume' }, 0))
      .toMatchObject({ error: 'Only the host can resume the game' });
  });

  it('preserves the exact remaining turn time across pause and resume', () => {
    const room = startTwoPlayerRoom();
    const paused = reduceRoom(room, room.hostId, { t: 'pause' }, 11_000);
    if ('error' in paused) throw new Error(paused.error);
    expect(paused.state.turnEndsAt).toBeNull();
    expect(paused.state.turnRemainingMs).toBe(50_000);
    expect(nextRoomDeadline(paused.state)).toBeNull();

    // Nothing expires while paused, no matter how much time passes.
    const frozen = processDeadlines(paused.state, 10_000_000);
    expect(frozen.state.turnEndsAt).toBeNull();
    expect(frozen.state.phase).toBe('playing');

    const resumed = reduceRoom(paused.state, room.hostId, { t: 'resume' }, 500_000);
    if ('error' in resumed) throw new Error(resumed.error);
    expect(resumed.state.paused).toBe(false);
    expect(resumed.state.turnRemainingMs).toBeNull();
    expect(resumed.state.turnEndsAt).toBe(550_000);
    expect(nextRoomDeadline(resumed.state)).toBe(550_000);
  });

  it('freezes the interrupt timer and re-arms the earliest deadline on resume', () => {
    const room = interruptRoom();
    expect(room.pendingAction?.interrupt.endsAt).toBe(40_000);
    expect(room.turnRemainingMs).toBe(51_000);

    const paused = reduceRoom(room, room.hostId, { t: 'pause' }, 20_000);
    if ('error' in paused) throw new Error(paused.error);
    expect(paused.state.pendingAction?.interrupt.endsAt).toBeNull();
    expect(paused.state.pauseRemaining).toMatchObject({ turn: 51_000, interrupt: 20_000 });
    expect(nextRoomDeadline(paused.state)).toBeNull();

    const resumed = reduceRoom(paused.state, room.hostId, { t: 'resume' }, 100_000);
    if ('error' in resumed) throw new Error(resumed.error);
    expect(resumed.state.pendingAction?.interrupt.endsAt).toBe(120_000);
    // The turn clock stays paused for the whole interrupt, even after resume.
    expect(resumed.state.turnEndsAt).toBeNull();
    expect(resumed.state.turnRemainingMs).toBe(51_000);
    expect(nextRoomDeadline(resumed.state)).toBe(120_000);

    // Ending the chain restarts the turn with its preserved remaining time.
    const passed = reduceRoom(resumed.state, room.players.find((player) => player.id !== room.activePlayerId)!.id, { t: 'pass' }, 119_000);
    if ('error' in passed) throw new Error(passed.error);
    expect(passed.state.pendingAction).toBeNull();
    expect(passed.state.turnEndsAt).toBe(170_000);
  });

  it('freezes and re-arms a later appeal link so the chain can continue after resume', () => {
    const start = startStealChain();
    const linked = appealFor(start.room, start.targetId, 11_000);
    expect(linked.pendingAction?.interrupt.appeals).toHaveLength(1);
    expect(linked.pendingAction?.interrupt.endsAt).toBe(41_000);

    const paused = reduceRoom(linked, linked.hostId, { t: 'pause' }, 21_000);
    if ('error' in paused) throw new Error(paused.error);
    expect(paused.state.pendingAction?.interrupt.endsAt).toBeNull();
    expect(paused.state.pauseRemaining).toMatchObject({ turn: 51_000, interrupt: 20_000 });
    expect(nextRoomDeadline(paused.state)).toBeNull();

    const frozen = processDeadlines(paused.state, 10_000_000).state;
    expect(frozen.pendingAction?.interrupt.appeals).toHaveLength(1);
    expect(frozen.pendingAction?.interrupt.endsAt).toBeNull();

    const resumed = reduceRoom(paused.state, linked.hostId, { t: 'resume' }, 100_000);
    if ('error' in resumed) throw new Error(resumed.error);
    expect(resumed.state.pendingAction?.interrupt.endsAt).toBe(120_000);
    expect(resumed.state.turnEndsAt).toBe(151_000);
    // The earliest deadline is the current appeal link, not the turn.
    expect(nextRoomDeadline(resumed.state)).toBe(120_000);

    // The chain still alternates after resume: the actor may counter-appeal.
    expect(eligibleAppealIds(resumed.state.pendingAction!.interrupt)).toEqual([start.activeId]);
  });

  it('preserves turnRemainingMs and recomputes each interrupt link on pause/resume across links 1, 2, and 3+', () => {
    for (const targetDepth of [1, 2, 3]) {
      let state = startStealChain().room;
      let now = 10_000;
      const start = startStealChain();
      state = start.room;
      const activeId = start.activeId;
      const targetId = start.targetId;
      for (let depth = 0; depth < targetDepth; depth += 1) {
        const responder = depth % 2 === 0 ? targetId : activeId;
        now += 1000;
        state = appealFor(state, responder, now);
      }
      const interrupt = state.pendingAction?.interrupt;
      if (!interrupt || interrupt.endsAt === null) throw new Error('Expected a live interrupt');
      const pauseNow = interrupt.endsAt - 10_000;
      const paused = reduceRoom(state, state.hostId, { t: 'pause' }, pauseNow);
      if ('error' in paused) throw new Error(paused.error);
      expect(paused.state.turnRemainingMs).toBe(51_000);
      expect(paused.state.pendingAction?.interrupt.endsAt).toBeNull();
      expect(paused.state.pauseRemaining).toMatchObject({ interrupt: 10_000, turn: 51_000 });
      expect(nextRoomDeadline(paused.state)).toBeNull();

      expect(reduceRoom(paused.state, activeId, { t: 'pass' }, pauseNow + 5000)).toMatchObject({ error: 'Game is paused' });
      expect(reduceRoom(paused.state, targetId, { t: 'appeal', cardId: 'unused' }, pauseNow + 5000)).toMatchObject({ error: 'Game is paused' });

      const resumed = reduceRoom(paused.state, state.hostId, { t: 'resume' }, 100_000);
      if ('error' in resumed) throw new Error(resumed.error);
      expect(resumed.state.turnRemainingMs).toBe(51_000);
      expect(resumed.state.pendingAction?.interrupt.endsAt).toBe(110_000);
      expect(nextRoomDeadline(resumed.state)).toBe(110_000);
      expect(resumed.state.pauseRemaining).toBeNull();
    }
  });

  it('rejects every game action while paused but allows host management', () => {
    const room = interruptRoom();
    const active = room.players.find((player) => player.id === room.activePlayerId);
    if (!active) throw new Error('Expected an active player');
    const paused = reduceRoom(room, room.hostId, { t: 'pause' }, 20_000);
    if ('error' in paused) throw new Error(paused.error);
    const state = paused.state;

    expect(reduceRoom(state, active.id, { t: 'endTurn' }, 20_000)).toMatchObject({ error: 'Game is paused' });
    expect(reduceRoom(state, active.id, { t: 'toHand', slot: 0 }, 20_000)).toMatchObject({ error: 'Game is paused' });
    expect(reduceRoom(state, active.id, { t: 'place', cardId: 'x', slot: 0 }, 20_000)).toMatchObject({ error: 'Game is paused' });
    expect(reduceRoom(state, active.id, { t: 'pass' }, 20_000)).toMatchObject({ error: 'Game is paused' });
    expect(reduceRoom(state, active.id, { t: 'appeal', cardId: 'appeal' }, 20_000)).toMatchObject({ error: 'Game is paused' });

    // Host management actions remain available while paused.
    const guest = room.players.find((player) => player.id !== room.hostId);
    if (!guest) throw new Error('Expected a guest');
    expect('error' in reduceRoom(state, room.hostId, { t: 'resume' }, 20_000)).toBe(false);
  });

  it('keeps the game paused when the host transfers, and never auto-resumes', () => {
    const room = startTwoPlayerRoom();
    const paused = reduceRoom(room, room.hostId, { t: 'pause' }, 1_000);
    if ('error' in paused) throw new Error(paused.error);
    const nextHost = paused.state.players.find((player) => player.id !== paused.state.hostId);
    if (!nextHost) throw new Error('Expected a second player');

    const disconnected = setParticipantConnected(paused.state, paused.state.hostId, false, 5_000);
    expect(disconnected.paused).toBe(true);
    expect(disconnected.hostId).toBe(nextHost.id);
    expect(nextRoomDeadline(disconnected)).toBeNull();

    const resumed = reduceRoom(disconnected, nextHost.id, { t: 'resume' }, 10_000);
    if ('error' in resumed) throw new Error(resumed.error);
    expect(resumed.state.paused).toBe(false);
  });

  it('does not mark players away or skip turns while paused, and resumes their clocks', () => {
    const room = startTwoPlayerRoom();
    const activeId = room.activePlayerId;
    if (!activeId) throw new Error('Expected an active player');
    const paused = reduceRoom(room, room.hostId, { t: 'pause' }, 1_000);
    if ('error' in paused) throw new Error(paused.error);

    const disconnected = setParticipantConnected(paused.state, activeId, false, 5_000);
    const player = disconnected.players.find((candidate) => candidate.id === activeId);
    expect(player?.away).toBe(false);
    expect(player?.awayAt).toBeNull();
    expect(disconnected.pauseRemaining?.away[activeId]).toBe(60_000);

    const later = processDeadlines(disconnected, 10_000_000);
    expect(later.state.players.find((candidate) => candidate.id === activeId)?.away).toBe(false);
    expect(later.state.activePlayerId).toBe(activeId);

    const resumed = reduceRoom(disconnected, disconnected.hostId, { t: 'resume' }, 20_000);
    if ('error' in resumed) throw new Error(resumed.error);
    expect(resumed.state.players.find((candidate) => candidate.id === activeId)?.awayAt).toBe(80_000);
  });

  it('keeps an already-away player’s stored remaining time across pause and resume', () => {
    const room = startTwoPlayerRoom();
    const guest = room.players.find((player) => player.id !== room.hostId);
    if (!guest) throw new Error('Expected a guest');

    // The guest disconnected before the pause, so their 60s clock is running.
    const disconnected = setParticipantConnected(room, guest.id, false, 10_000);
    expect(disconnected.players.find((player) => player.id === guest.id)?.awayAt).toBe(70_000);

    // Pause half-way through: 30s must be stored, not restarted at 60s.
    const paused = reduceRoom(disconnected, room.hostId, { t: 'pause' }, 40_000);
    if ('error' in paused) throw new Error(paused.error);
    expect(paused.state.pauseRemaining?.away[guest.id]).toBe(30_000);
    expect(paused.state.players.find((player) => player.id === guest.id)?.awayAt).toBeNull();

    const resumed = reduceRoom(paused.state, room.hostId, { t: 'resume' }, 1_000_000);
    if ('error' in resumed) throw new Error(resumed.error);
    expect(resumed.state.players.find((player) => player.id === guest.id)?.awayAt).toBe(1_030_000);
  });

  it('freezes pending rejoin-request timers while paused', () => {
    const room = startTwoPlayerRoom();
    const requested = requestRejoin(room, 'req', 'new-session', 'spectator-public', 'Guest', 1_000);
    if ('error' in requested) throw new Error(requested.error);
    expect(nextRoomDeadline(requested.state)).toBe(61_000);

    const paused = reduceRoom(requested.state, requested.state.hostId, { t: 'pause' }, 11_000);
    if ('error' in paused) throw new Error(paused.error);
    expect(paused.state.pauseRemaining?.rejoin['req']).toBe(50_000);

    const frozen = processDeadlines(paused.state, 10_000_000);
    expect(frozen.expiredRejoinIds).toEqual([]);
    expect(frozen.state.rejoinRequests).toHaveLength(1);

    const resumed = reduceRoom(paused.state, paused.state.hostId, { t: 'resume' }, 100_000);
    if ('error' in resumed) throw new Error(resumed.error);
    expect(resumed.state.rejoinRequests[0].expiresAt).toBe(150_000);
  });

  it('deals unique cards totalling the 218-card deck for every legal player count', () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 10 }), (count) => {
      const room = startRoomWithPlayers(count);
      const cards = [
        ...room.deck,
        ...room.players.flatMap((player) => player.hand),
        ...room.players.flatMap((player) => player.table.map((slot) => slot.card))
      ];
      expect(new Set(cards.map((card) => card.id)).size).toBe(DECK_SIZE);
      expect(room.deck.length).toBe(DECK_SIZE - 7 * count - 1);
      for (const player of room.players) {
        expect(player.table).toHaveLength(3);
        expect(player.table.every((slot) => slot.revealed)).toBe(true);
        expect(player.hand.slice(0, 4).map((card) => card.kind === 'action' ? card.action : card.kind))
          .toEqual(['CONCEAL', 'STEAL', 'REVEAL', 'APPEAL']);
      }
    }), { numRuns: 9 });
  });

  it('reproduces the same deal from the same seed', () => {
    const first = startRoomWithPlayers(4, 'same-seed');
    const second = startRoomWithPlayers(4, 'same-seed');
    expect(first.deck.map((card) => card.id)).toEqual(second.deck.map((card) => card.id));
    expect(first.players.map((player) => player.hand.map((card) => card.id)))
      .toEqual(second.players.map((player) => player.hand.map((card) => card.id)));
    expect(first.players.map((player) => player.table.map((slot) => slot.card.id)))
      .toEqual(second.players.map((player) => player.table.map((slot) => slot.card.id)));
  });

  it('returns a finished room to a clean lobby while keeping present people and settings', () => {
    let room = startRoomWithPlayers(3);
    room.phase = 'finished';
    room.winnerId = room.players[0].id;
    room.winningSets = [[room.players[0].table[0].card.id]];
    room.turnDurationSeconds = 45;
    room.paused = true;
    room.pauseRemaining = { turn: 10_000, interrupt: null, rejoin: {} };
    room.pendingAction = null;
    room.lastInterruptResult = { kind: 'REVEAL', outcome: 'resolved', resolvedAt: 9_000 };
    room.rejoinRequests = [];
    room.skipAfterInterrupt = true;
    room.activePlayerId = room.players[1].id;
    room.turnNumber = 9;
    room.turnEndsAt = 50_000;
    room.turnRemainingMs = 20_000;
    room.players[2].away = true;
    room.players[2].awayAt = 10_000;
    room.spectators.push(
      { id: 'spec-keep', sessionIds: ['spec-session'], name: 'Spec', connected: true, left: false },
      { id: 'spec-drop', sessionIds: ['spec2-session'], name: 'Spec Two', connected: false, left: false }
    );

    expect(returnToLobby(room, room.players[1].id, 'fresh')).toMatchObject({ error: 'Only the host can return to the lobby' });
    expect(returnToLobby(startTwoPlayerRoom(), startTwoPlayerRoom().hostId, 'fresh'))
      .toMatchObject({ error: "The game isn't over yet" });

    const reset = returnToLobby(room, room.hostId, 'fresh-seed');
    if ('error' in reset) throw new Error(reset.error);
    const next = reset.state;
    expect(next.phase).toBe('lobby');
    expect(next.players.map((player) => player.name)).toEqual(['Host', 'Player 1']);
    expect(next.spectators.map((spectator) => spectator.name)).toEqual(['Spec']);
    expect(next.hostId).toBe(room.hostId);
    expect(next.turnDurationSeconds).toBe(45);
    expect(next.deck).toEqual([]);
    expect(next.activePlayerId).toBeNull();
    expect(next.turnNumber).toBe(0);
    expect(next.turnEndsAt).toBeNull();
    expect(next.turnRemainingMs).toBeNull();
    expect(next.pendingAction).toBeNull();
    expect(next.lastInterruptResult).toBeNull();
    expect(next.winnerId).toBeNull();
    expect(next.winningSets).toBeNull();
    expect(next.paused).toBe(false);
    expect(next.pauseRemaining).toBeNull();
    expect(next.rejoinRequests).toEqual([]);
    expect(next.skipAfterInterrupt).toBe(false);
    expect(next.randomSeed).toBe('fresh-seed');
    expect(next.randomCounter).toBe(0);
    for (const player of next.players) {
      expect(player.hand).toEqual([]);
      expect(player.table).toEqual([]);
      expect(player.away).toBe(false);
      expect(player.awayAt).toBeNull();
      expect(player.left).toBe(false);
    }
    // The dropped default name is available again.
    const rejoined = addParticipant(next, 'new-player', 'Player 2', 'player', 'new-session');
    if ('error' in rejoined) throw new Error(rejoined.error);
    expect(rejoined.state.players.some((player) => player.name === 'Player 2')).toBe(true);
  });

  it('starts the next game with a different seed after returning to the lobby', () => {
    const first = startRoomWithPlayers(2, 'first-seed');
    const firstDeck = first.deck.map((card) => card.id);
    first.phase = 'finished';
    first.winnerId = first.players[0].id;
    const reset = returnToLobby(first, first.hostId, 'second-seed');
    if ('error' in reset) throw new Error(reset.error);
    const second = reduceRoom(reset.state, reset.state.hostId, { t: 'start' }, 2000);
    if ('error' in second) throw new Error(second.error);
    expect(second.state.randomSeed).not.toBe('first-seed');
    expect(second.state.deck.map((card) => card.id)).not.toEqual(firstDeck);
  });

  it('leaveRoom removes a non-winner and frees their name', () => {
    const room = finishedRoom();
    const guest = room.players[1];
    const result = leaveRoom(room, guest.id);
    if ('error' in result.result) throw new Error(result.result.error);
    expect(result.roomDeleted).toBeUndefined();
    expect(result.result.state.players.map((player) => player.id)).toEqual([room.hostId]);
    const reused = addParticipant(result.result.state, 'new', 'Guest', 'spectator', 'new-session');
    if ('error' in reused) throw new Error(reused.error);
    expect(reused.state.spectators.some((spectator) => spectator.name === 'Guest')).toBe(true);
  });

  it('keeps a leaving winner renderable until the reset and passes the host on', () => {
    const room = finishedRoom();
    const winner = room.players.find((player) => player.id === room.winnerId);
    if (!winner) throw new Error('Expected a winner');
    const result = leaveRoom(room, winner.id);
    if ('error' in result.result) throw new Error(result.result.error);
    const kept = result.result.state.players.find((player) => player.id === winner.id);
    expect(kept?.left).toBe(true);
    expect(result.result.state.winnerId).toBe(winner.id);
    expect(result.result.state.hostId).not.toBe(winner.id);
    expect(result.result.state.players.find((player) => player.id === result.result.state.hostId)?.connected).toBe(true);
  });

  it('cascades host succession through players in list order', () => {
    const room = startRoomWithPlayers(3);
    room.phase = 'finished';
    room.winnerId = room.players[0].id;
    const first = leaveRoom(room, room.hostId);
    if ('error' in first.result) throw new Error(first.result.error);
    expect(first.result.state.hostId).toBe(room.players[1].id);
    const second = leaveRoom(first.result.state, first.result.state.hostId);
    if ('error' in second.result) throw new Error(second.result.error);
    expect(second.result.state.hostId).toBe(room.players[2].id);
  });

  it('deletes the room when the last member leaves', () => {
    const room = finishedRoom();
    const guest = room.players[1];
    const first = leaveRoom(room, guest.id);
    expect(first.roomDeleted).toBeUndefined();
    if ('error' in first.result) throw new Error(first.result.error);
    const last = leaveRoom(first.result.state, first.result.state.hostId);
    expect(last.roomDeleted).toBe(true);
  });

  it('removes lobby members on leave and deletes an emptied room', () => {
    const created = createRoom('ABCD', 'host', 'host-session', 'Host', 'seed');
    const joined = addParticipant(created, 'guest', 'Guest', 'player', 'guest-session');
    if ('error' in joined) throw new Error(joined.error);
    const first = leaveRoom(joined.state, 'guest');
    if ('error' in first.result) throw new Error(first.result.error);
    expect(first.result.state.players.map((player) => player.id)).toEqual(['host']);
    const last = leaveRoom(first.result.state, 'host');
    expect(last.roomDeleted).toBe(true);
  });
});

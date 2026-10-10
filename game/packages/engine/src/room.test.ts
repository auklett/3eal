import { describe, expect, it } from 'vitest';
import {
  addParticipant,
  createRoom,
  nextRoomDeadline,
  processDeadlines,
  reduceRoom,
  requestRejoin,
  resolveRejoinRequest,
  setParticipantConnected,
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

describe('room rules', () => {
  it('requires two players and starts a concealed three-card table for each', () => {
    const room = createRoom('ABCD', 'host', 'host-session', 'Host', 'seed');
    expect(reduceRoom(room, 'host', { t: 'start' }, 1000)).toMatchObject({ error: 'At least two players are required to start' });

    const started = startTwoPlayerRoom();
    expect(started.phase).toBe('playing');
    expect(started.players.map((player) => player.table)).toHaveLength(2);
    expect(started.players.every((player) => player.table.length === 3)).toBe(true);
    expect(started.players.every((player) => player.table.every((slot) => !slot.revealed))).toBe(true);
    expect(started.turnEndsAt).toBe(61_000);
    expect(started.turnNumber).toBe(1);
    expect(started.players[0].id).not.toBe(started.players[0].sessionIds[0]);
    expect(started.players[0].sessionIds).not.toContain(started.players[0].id);
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
    expect(result.state.discardPile).toContainEqual({ id: 'normal-card', kind: 'normal', color: 'periwinkle', number: 1, shape: 'circle', isRevealed: true });
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
    expect(passed.state.lastInterruptResult).toEqual({ kind: 'CONCEAL', outcome: 'resolved' });
  });

  it('preserves a concealed card when stolen and reveals its identity only in authoritative state', () => {
    const room = startTwoPlayerRoom();
    const active = room.players.find((player) => player.id === room.activePlayerId);
    const target = room.players.find((player) => player.id !== room.activePlayerId);
    if (!active || !target) throw new Error('Expected two players');
    target.table[0].revealed = false;
    const stolen = target.table[0].card;
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

  it('rejects REVEAL without consuming the action card when no concealed card exists', () => {
    const room = startTwoPlayerRoom();
    const active = room.players.find((player) => player.id === room.activePlayerId);
    const target = room.players.find((player) => player.id !== room.activePlayerId);
    if (!active || !target) throw new Error('Expected two players');
    target.table.forEach((slot) => { slot.revealed = true; });
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
      { id: 'spectator-public', sessionIds: ['new-session'], name: 'Guest (spectator)', connected: true }
    ]);
  });

  it('transfers host ownership when the current host disconnects', () => {
    const room = startTwoPlayerRoom();
    const nextHost = room.players.find((player) => player.id !== room.hostId);
    if (!nextHost) throw new Error('Expected a second player');
    const disconnected = setParticipantConnected(room, room.hostId, false, 500);
    expect(disconnected.hostId).toBe(nextHost.id);
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
  });
});

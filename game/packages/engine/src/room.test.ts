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

  it('refuses to start when the deck cannot deal three Table cards per player', () => {
    let room = createRoom('ABCD', 'host', 'host-session', 'Host', 'seed');
    for (let index = 1; index <= 99; index += 1) {
      const joined = addParticipant(room, `player-${index}`, `Player ${index}`, 'player', `session-${index}`);
      if ('error' in joined) throw new Error(joined.error);
      room = joined.state;
    }
    expect(room.players).toHaveLength(100);

    // The deck only holds 178 Normal + TEAL cards, well short of 100 × 3.
    const result = reduceRoom(room, 'host', { t: 'start' }, 1000);
    expect(result).toMatchObject({ error: 'There are not enough Normal and TEAL cards to deal this many players' });
    expect(result.state.phase).toBe('lobby');
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
    expect(resumed.state.turnEndsAt).toBe(151_000);
    expect(nextRoomDeadline(resumed.state)).toBe(120_000);
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
});

import { describe, expect, it } from 'vitest';
import {
  addParticipant,
  createRoom,
  reduceRoom,
  requestRejoin,
  transferHostTo,
  type RoomState
} from '@3eal/engine';
import { playerView, spectatorView } from './views';

function startedRoom(): RoomState {
  const room = createRoom(
    'ABCD',
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Host',
    'secret-seed'
  );
  const joined = addParticipant(
    room,
    '00000000-0000-4000-8000-000000000002',
    'Guest',
    'player',
    '10000000-0000-4000-8000-000000000002'
  );
  if ('error' in joined) throw new Error(joined.error);
  const started = reduceRoom(joined.state, room.hostId, { t: 'start' }, 1000);
  if ('error' in started) throw new Error(started.error);
  return started.state;
}

function startedThreePlayerRoom(): RoomState {
  const room = createRoom(
    'ABCD',
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Host',
    'secret-seed'
  );
  const guest = addParticipant(
    room,
    '00000000-0000-4000-8000-000000000002',
    'Guest',
    'player',
    '10000000-0000-4000-8000-000000000002'
  );
  if ('error' in guest) throw new Error(guest.error);
  const third = addParticipant(
    guest.state,
    '00000000-0000-4000-8000-000000000003',
    'Third',
    'player',
    '10000000-0000-4000-8000-000000000003'
  );
  if ('error' in third) throw new Error(third.error);
  const started = reduceRoom(third.state, room.hostId, { t: 'start' }, 1000);
  if ('error' in started) throw new Error(started.error);
  return started.state;
}

function pausedInterruptRoom(): RoomState {
  const room = startedRoom();
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
  const paused = reduceRoom(action.state, room.hostId, { t: 'pause' }, 20_000);
  if ('error' in paused) throw new Error(paused.error);
  return paused.state;
}

describe('filtered room views', () => {
  it('gives spectators exactly the same public information opponents receive', () => {
    const room = startedRoom();
    const player = room.players[0];
    const playerSnapshot = playerView(room, player.id);
    const spectatorSnapshot = spectatorView(room, '20000000-0000-4000-8000-000000000001');
    if (playerSnapshot.role !== 'player' || spectatorSnapshot.role !== 'spectator') {
      throw new Error('Expected filtered player and spectator views');
    }
    const { you: _private, ...playerPublic } = playerSnapshot.data;
    const { you: _spectatorPrivate, ...spectatorPublic } = spectatorSnapshot.data;
    expect(spectatorPublic).toEqual(playerPublic);
    expect(spectatorSnapshot.data.you).toEqual({
      id: '20000000-0000-4000-8000-000000000001',
      interruptCard: null
    });
    expect(JSON.stringify(spectatorSnapshot)).not.toContain('"hand":');
    expect(JSON.stringify(spectatorSnapshot)).not.toContain('secret-seed');
    expect(JSON.stringify(spectatorSnapshot)).not.toContain('10000000-0000-4000-8000-000000000001');
    expect(JSON.stringify(playerSnapshot)).not.toContain('10000000-0000-4000-8000-000000000002');
  });

  it('deals the three starting Table cards revealed to opponents and spectators', () => {
    const room = startedRoom();
    const spectator = spectatorView(room, '20000000-0000-4000-8000-000000000001');
    if (spectator.role !== 'spectator') throw new Error('Expected spectator view');
    for (const player of spectator.data.players) {
      expect(player.table).toHaveLength(3);
      expect(player.table.every((slot) => slot.state === 'revealed')).toBe(true);
    }
  });

  it('never serializes the identity of a concealed card to another viewer', () => {
    const room = startedRoom();
    const owner = room.players[0];
    // Starting cards are dealt revealed; conceal one to create hidden state.
    owner.table[0].revealed = false;
    const concealedId = owner.table[0].card.id;

    const spectator = spectatorView(room, '20000000-0000-4000-8000-000000000001');
    if (spectator.role !== 'spectator') throw new Error('Expected spectator view');
    const publicOwner = spectator.data.players.find((player) => player.id === owner.id);
    expect(publicOwner?.table[0]).toEqual({ state: 'concealed', cardId: concealedId });
    expect(JSON.stringify(publicOwner?.table[0])).not.toContain('"color"');
    expect(JSON.stringify(publicOwner?.table[0])).not.toContain('"number"');
    expect(JSON.stringify(publicOwner?.table[0])).not.toContain('"shape"');

    const privateOwner = playerView(room, owner.id);
    if (privateOwner.role !== 'player') throw new Error('Expected player view');
    expect(Object.keys(privateOwner.data.you.concealedOwn)).toEqual([concealedId]);
    expect(spectator.data.you).toEqual({
      id: '20000000-0000-4000-8000-000000000001',
      interruptCard: null
    });
    expect(Object.keys(spectator.data.you)).toEqual(['id', 'interruptCard']);
  });

  it('reveals all cards to spectators only after the game has ended', () => {
    const room = startedRoom();
    room.phase = 'finished';
    room.winnerId = room.players[0].id;
    const view = spectatorView(room, '20000000-0000-4000-8000-000000000001');
    if (view.role !== 'spectator') throw new Error('Expected spectator view');
    expect(view.data.reveal?.players[room.players[0].id].table).toHaveLength(3);
    expect(view.data.players[0].table.every((slot) => slot.state === 'revealed')).toBe(true);
  });

  it('carries no live interrupt deadline while the game is paused', () => {
    const room = pausedInterruptRoom();
    const snapshot = playerView(room, room.hostId);
    expect(snapshot.data.paused).toBe(true);
    // Only the frozen remaining time survives; the deadline itself is gone.
    expect(snapshot.data.pauseRemaining?.interrupt).toBe(20_000);
    expect(snapshot.data.interrupt?.endsAt).toBeNull();

    const spectator = spectatorView(room, '20000000-0000-4000-8000-000000000001');
    expect(spectator.data.interrupt?.endsAt).toBeNull();

    // A client must never see a stale numeric deadline (e.g. 0 = "expired").
    const serialized = JSON.parse(JSON.stringify(snapshot)) as { data: { interrupt: { endsAt: unknown } } };
    expect(serialized.data.interrupt.endsAt).toBeNull();
    expect(JSON.stringify(snapshot)).not.toContain('"endsAt":0');
  });

  it('shows a blind STEAL card only to its owner, never to the actor or a spectator', () => {
    const room = startedRoom();
    const active = room.players.find((player) => player.id === room.activePlayerId);
    const target = room.players.find((player) => player.id !== room.activePlayerId);
    if (!active || !target) throw new Error('Expected two players');
    target.table[0].revealed = false;
    const stolen = target.table[0].card;
    active.hand.push({ id: 'blind-steal', kind: 'action', action: 'STEAL' });
    const opened = reduceRoom(room, active.id, {
      t: 'action',
      cardId: 'blind-steal',
      kind: 'STEAL',
      targetId: target.id,
      slot: 0
    }, 10_000);
    if ('error' in opened) throw new Error(opened.error);

    const targetView = playerView(opened.state, target.id);
    if (targetView.role !== 'player') throw new Error('Expected a player view');
    expect(targetView.data.you.interruptCard).toEqual({ cardId: stolen.id, card: stolen, revealed: false });

    const actorView = playerView(opened.state, active.id);
    if (actorView.role !== 'player') throw new Error('Expected a player view');
    expect(actorView.data.you.interruptCard).toBeNull();

    const spectator = spectatorView(opened.state, '20000000-0000-4000-8000-000000000001');
    expect(spectator.data.you.interruptCard).toBeNull();
    expect(JSON.stringify(actorView)).not.toContain(`"interruptCard":{"cardId":"${stolen.id}"`);
  });

  it('filters a blind STEAL card to the target, returning null to the actor, others, and spectators', () => {
    const room = startedThreePlayerRoom();
    const actor = room.players.find((player) => player.id === room.activePlayerId);
    const target = room.players.find((player) => player.id !== actor?.id);
    const uninvolved = room.players.find((player) => player.id !== actor?.id && player.id !== target?.id);
    if (!actor || !target || !uninvolved) throw new Error('Expected three players');

    target.table[0].revealed = false;
    const stolen = target.table[0].card;
    actor.hand.push({ id: 'blind-steal', kind: 'action', action: 'STEAL' });
    const opened = reduceRoom(room, actor.id, {
      t: 'action',
      cardId: 'blind-steal',
      kind: 'STEAL',
      targetId: target.id,
      slot: 0
    }, 10_000);
    if ('error' in opened) throw new Error(opened.error);

    const targetView = playerView(opened.state, target.id);
    const actorView = playerView(opened.state, actor.id);
    const uninvolvedView = playerView(opened.state, uninvolved.id);
    const spectator = spectatorView(opened.state, '20000000-0000-4000-8000-000000000001');
    if (targetView.role !== 'player' || actorView.role !== 'player' || uninvolvedView.role !== 'player') {
      throw new Error('Expected player views');
    }

    expect(targetView.data.you.interruptCard).toEqual({ cardId: stolen.id, card: stolen, revealed: false });
    expect(actorView.data.you.interruptCard).toBeNull();
    expect(uninvolvedView.data.you.interruptCard).toBeNull();
    expect(spectator.data.you.interruptCard).toBeNull();
    for (const view of [actorView, uninvolvedView, spectator]) {
      expect(view.data.players.find((player) => player.id === target.id)?.table[0])
        .toEqual({ state: 'concealed', cardId: stolen.id });
    }
  });

  it('keeps pending rejoin requests private to the new host after a transfer', () => {
    const room = startedRoom();
    const newHost = room.players.find((player) => player.id !== room.hostId);
    if (!newHost) throw new Error('Expected a second player');
    const request = requestRejoin(
      room,
      '20000000-0000-4000-8000-000000000003',
      '20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      newHost.name,
      10_000
    );
    if ('error' in request) throw new Error(request.error);
    const transferred = transferHostTo(request.state, room.hostId, newHost.id);
    if ('error' in transferred) throw new Error(transferred.error);

    const newHostView = playerView(transferred.state, newHost.id);
    const oldHostView = playerView(transferred.state, room.hostId);
    if (newHostView.role !== 'player' || oldHostView.role !== 'player') {
      throw new Error('Expected player views');
    }
    expect(newHostView.data.you.rejoinRequests).toEqual([{
      requestId: '20000000-0000-4000-8000-000000000003',
      name: newHost.name
    }]);
    expect(oldHostView.data.you.rejoinRequests).toEqual([]);
  });

  it('shows the CONCEAL card to eligible responders but not to its actor', () => {
    const room = pausedInterruptRoom();
    const actor = room.players.find((player) => player.id === room.activePlayerId);
    const responder = room.players.find((player) => player.id !== room.activePlayerId);
    if (!actor || !responder) throw new Error('Expected two players');
    const card = actor.table[0].card;

    const actorView = playerView(room, actor.id);
    if (actorView.role !== 'player') throw new Error('Expected a player view');
    expect(actorView.data.you.interruptCard).toBeNull();

    const responderView = playerView(room, responder.id);
    if (responderView.role !== 'player') throw new Error('Expected a player view');
    expect(responderView.data.you.interruptCard).toEqual({ cardId: card.id, card, revealed: true });
  });

  it('publishes chain depth and shows the played APPEAL face only to the countered player', () => {
    const room = startedThreePlayerRoom();
    const actor = room.players.find((player) => player.id === room.activePlayerId);
    const target = room.players.find((player) => player.id !== actor?.id);
    const uninvolved = room.players.find((player) => player.id !== actor?.id && player.id !== target?.id);
    if (!actor || !target || !uninvolved) throw new Error('Expected three players');
    actor.hand.push({ id: 'chain-steal', kind: 'action', action: 'STEAL' });
    // A second APPEAL keeps the depth-2 link open after the target uses the first.
    target.hand.push({ id: 'target-appeal-2', kind: 'action', action: 'APPEAL' });
    const opened = reduceRoom(room, actor.id, {
      t: 'action',
      cardId: 'chain-steal',
      kind: 'STEAL',
      targetId: target.id,
      slot: 0
    }, 10_000);
    if ('error' in opened) throw new Error(opened.error);
    const targetAppeal = target.hand.find((card) => card.kind === 'action' && card.action === 'APPEAL');
    if (!targetAppeal) throw new Error('Expected the target to hold APPEAL');

    const depth1 = reduceRoom(opened.state, target.id, { t: 'appeal', cardId: targetAppeal.id }, 11_000);
    if ('error' in depth1) throw new Error(depth1.error);

    const spectator1 = spectatorView(depth1.state, '20000000-0000-4000-8000-000000000001');
    expect(spectator1.data.interrupt).toEqual({
      id: opened.state.pendingAction?.interrupt.id,
      kind: 'STEAL',
      actorId: actor.id,
      targetId: target.id,
      targetCardId: opened.state.pendingAction?.interrupt.targetCardId,
      endsAt: 41_000,
      appealDepth: 1,
      appealPlayers: [target.id]
    });

    // The actor was just countered, so only the actor sees the APPEAL face.
    const actor1 = playerView(depth1.state, actor.id);
    if (actor1.role !== 'player') throw new Error('Expected a player view');
    expect(actor1.data.you.interruptCard).toEqual({
      cardId: targetAppeal.id,
      card: targetAppeal,
      revealed: false
    });
    const target1 = playerView(depth1.state, target.id);
    const uninvolved1 = playerView(depth1.state, uninvolved.id);
    if (target1.role !== 'player' || uninvolved1.role !== 'player') throw new Error('Expected player views');
    expect(target1.data.you.interruptCard).toBeNull();
    expect(uninvolved1.data.you.interruptCard).toBeNull();

    const actorAppeal = actor.hand.find((card) => card.kind === 'action' && card.action === 'APPEAL');
    if (!actorAppeal) throw new Error('Expected the actor to hold APPEAL');
    const depth2 = reduceRoom(depth1.state, actor.id, { t: 'appeal', cardId: actorAppeal.id }, 12_000);
    if ('error' in depth2) throw new Error(depth2.error);

    const spectator2 = spectatorView(depth2.state, '20000000-0000-4000-8000-000000000001');
    expect(spectator2.data.interrupt).toMatchObject({ appealDepth: 2, appealPlayers: [target.id, actor.id] });

    // At depth 2 the first appealer is the one countered by the actor's APPEAL.
    const target2 = playerView(depth2.state, target.id);
    const actor2 = playerView(depth2.state, actor.id);
    if (target2.role !== 'player' || actor2.role !== 'player') throw new Error('Expected player views');
    expect(target2.data.you.interruptCard).toEqual({
      cardId: actorAppeal.id,
      card: actorAppeal,
      revealed: false
    });
    expect(actor2.data.you.interruptCard).toBeNull();
    expect(playerView(depth2.state, uninvolved.id).data.you.interruptCard).toBeNull();

    // Chain internals (who may still respond, who passed) are never public.
    for (const view of [spectator1, spectator2, actor1, target1, target2, actor2]) {
      const serialized = JSON.stringify(view);
      expect(serialized).not.toContain('"responderIds"');
      expect(serialized).not.toContain('"passedIds"');
    }
  });

  it('marks a stolen-to-Hand result only in the actor private view', () => {
    const room = startedRoom();
    const active = room.players.find((player) => player.id === room.activePlayerId);
    const target = room.players.find((player) => player.id !== room.activePlayerId);
    if (!active || !target) throw new Error('Expected two players');
    active.table = Array.from({ length: 9 }, (_, index) => ({
      card: {
        id: `full-${index}`,
        kind: 'normal' as const,
        color: 'periwinkle' as const,
        number: 1 as const,
        shape: 'circle' as const
      },
      revealed: true
    }));
    target.hand = target.hand.filter((card) => !(card.kind === 'action' && card.action === 'APPEAL'));
    active.hand.push({ id: 'hand-steal', kind: 'action', action: 'STEAL' });
    const result = reduceRoom(room, active.id, {
      t: 'action',
      cardId: 'hand-steal',
      kind: 'STEAL',
      targetId: target.id,
      slot: 0
    }, 10_000);
    if ('error' in result) throw new Error(result.error);

    const actorView = playerView(result.state, active.id);
    if (actorView.role !== 'player') throw new Error('Expected a player view');
    expect(actorView.data.you.stolenToHandAt).toBe(10_000);

    const targetView = playerView(result.state, target.id);
    if (targetView.role !== 'player') throw new Error('Expected a player view');
    expect(targetView.data.you.stolenToHandAt).toBeNull();

    const spectator = spectatorView(result.state, '20000000-0000-4000-8000-000000000001');
    expect(spectator.data.lastInterruptResult).toEqual({
      kind: 'STEAL',
      outcome: 'resolved',
      resolvedAt: 10_000,
      appealDepth: 0,
      appealedBy: null
    });
    expect(JSON.stringify(spectator)).not.toContain('stolenToHandBy');
    expect(JSON.stringify(actorView)).not.toContain('stolenToHandBy');
  });
});

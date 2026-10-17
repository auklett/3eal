import { describe, expect, it } from 'vitest';
import { addParticipant, createRoom, reduceRoom, type RoomState } from '@3eal/engine';
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
    const spectatorSnapshot = spectatorView(room);
    if (playerSnapshot.role !== 'player' || spectatorSnapshot.role !== 'spectator') {
      throw new Error('Expected filtered player and spectator views');
    }
    const { you: _private, ...playerPublic } = playerSnapshot.data;
    expect(spectatorSnapshot.data).toEqual(playerPublic);
    expect(JSON.stringify(spectatorSnapshot)).not.toContain('"hand":');
    expect(JSON.stringify(spectatorSnapshot)).not.toContain('secret-seed');
    expect(JSON.stringify(spectatorSnapshot)).not.toContain('10000000-0000-4000-8000-000000000001');
    expect(JSON.stringify(playerSnapshot)).not.toContain('10000000-0000-4000-8000-000000000002');
  });

  it('never serializes the identity of another player’s concealed cards', () => {
    const room = startedRoom();
    const owner = room.players[0];
    const spectator = spectatorView(room);
    if (spectator.role !== 'spectator') throw new Error('Expected spectator view');
    const publicOwner = spectator.data.players.find((player) => player.id === owner.id);
    expect(publicOwner?.table.every((slot) => slot.state === 'concealed')).toBe(true);
    expect(JSON.stringify(publicOwner?.table)).not.toContain('"color"');
    expect(JSON.stringify(publicOwner?.table)).not.toContain('"number"');
    expect(JSON.stringify(publicOwner?.table)).not.toContain('"shape"');

    const privateOwner = playerView(room, owner.id);
    if (privateOwner.role !== 'player') throw new Error('Expected player view');
    expect(Object.keys(privateOwner.data.you.concealedOwn)).toHaveLength(3);
    expect(Object.keys(spectator.data)).not.toContain('you');
  });

  it('reveals all cards to spectators only after the game has ended', () => {
    const room = startedRoom();
    room.phase = 'finished';
    room.winnerId = room.players[0].id;
    const view = spectatorView(room);
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

    const spectator = spectatorView(room);
    expect(spectator.data.interrupt?.endsAt).toBeNull();

    // A client must never see a stale numeric deadline (e.g. 0 = "expired").
    const serialized = JSON.parse(JSON.stringify(snapshot)) as { data: { interrupt: { endsAt: unknown } } };
    expect(serialized.data.interrupt.endsAt).toBeNull();
    expect(JSON.stringify(snapshot)).not.toContain('"endsAt":0');
  });
});

import { describe, expect, it } from 'vitest';
import {
  addParticipant,
  createRoom,
  nextRoomDeadline,
  processDeadlines,
  reduceRoom,
  type RoomState
} from '@3eal/engine';
import { persistedRoomSchema } from './persistedRoomSchema';
import { playerView, spectatorView } from './views';

const hostId = '00000000-0000-4000-8000-000000000001';
const guestId = '00000000-0000-4000-8000-000000000002';

function pausedRoom(): RoomState {
  const room = createRoom('ABCD', hostId, '10000000-0000-4000-8000-000000000001', 'Host', 'seed');
  const joined = addParticipant(room, guestId, 'Guest', 'player', '10000000-0000-4000-8000-000000000002');
  if ('error' in joined) throw new Error(joined.error);
  const started = reduceRoom(joined.state, hostId, { t: 'start' }, 1000);
  if ('error' in started) throw new Error(started.error);
  const paused = reduceRoom(started.state, hostId, { t: 'pause' }, 21_000);
  if ('error' in paused) throw new Error(paused.error);
  return paused.state;
}

function pausedInterruptRoom(): RoomState {
  const room = createRoom('ABCD', hostId, '10000000-0000-4000-8000-000000000001', 'Host', 'seed');
  const joined = addParticipant(room, guestId, 'Guest', 'player', '10000000-0000-4000-8000-000000000002');
  if ('error' in joined) throw new Error(joined.error);
  const started = reduceRoom(joined.state, hostId, { t: 'start' }, 1000);
  if ('error' in started) throw new Error(started.error);
  const active = started.state.players.find((player) => player.id === started.state.activePlayerId);
  const opponent = started.state.players.find((player) => player.id !== started.state.activePlayerId);
  if (!active || !opponent) throw new Error('Expected two players');
  active.hand.push({ id: 'conceal-action', kind: 'action', action: 'CONCEAL' });
  active.table[0].revealed = true;
  opponent.hand.push({ id: 'appeal', kind: 'action', action: 'APPEAL' });
  const action = reduceRoom(started.state, active.id, {
    t: 'action',
    cardId: 'conceal-action',
    kind: 'CONCEAL',
    targetId: active.id,
    slot: 0
  }, 10_000);
  if ('error' in action) throw new Error(action.error);
  const paused = reduceRoom(action.state, hostId, { t: 'pause' }, 20_000);
  if ('error' in paused) throw new Error(paused.error);
  return paused.state;
}

describe('paused room persistence', () => {
  it('survives a Durable Object restart and keeps its frozen deadlines', () => {
    const room = pausedRoom();
    const serialized = JSON.parse(JSON.stringify(room)) as unknown;
    const parsed = persistedRoomSchema.safeParse(serialized);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    // Only the persisted row survives eviction; the state must still be paused.
    const restored = parsed.data;
    expect(restored.paused).toBe(true);
    expect(restored.pauseRemaining).not.toBeNull();
    expect(nextRoomDeadline(restored)).toBeNull();

    const frozen = processDeadlines(restored, 10_000_000);
    expect(frozen.state.phase).toBe('playing');
    expect(frozen.state.paused).toBe(true);
  });

  it('exposes the public pause state without leaking private fields', () => {
    const room = pausedRoom();
    const player = playerView(room, hostId);
    expect(player.data.paused).toBe(true);
    expect(player.data.pauseRemaining).toEqual({ turn: 40_000, interrupt: null });
    expect(player.data.players.every((entry) => !('handCount' in entry))).toBe(true);

    const spectator = spectatorView(room);
    const serialized = JSON.stringify(spectator);
    expect(spectator.data.paused).toBe(true);
    expect(serialized).not.toContain('sessionIds');
    expect(serialized).not.toContain('"handCount"');
  });

  it('backfills defaults for rows saved before the pause and winning-set fields existed', () => {
    const legacy = JSON.parse(JSON.stringify(pausedRoom())) as Record<string, unknown>;
    delete legacy['paused'];
    delete legacy['pauseRemaining'];
    delete legacy['winningSets'];

    const parsed = persistedRoomSchema.safeParse(legacy);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.paused).toBe(false);
    expect(parsed.data.pauseRemaining).toBeNull();
    expect(parsed.data.winningSets).toBeNull();
  });

  it('round-trips a paused interrupt without a numeric deadline', () => {
    const room = pausedInterruptRoom();
    expect(room.pendingAction?.interrupt.endsAt).toBeNull();

    const parsed = persistedRoomSchema.safeParse(JSON.parse(JSON.stringify(room)));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.pendingAction?.interrupt.endsAt).toBeNull();
    expect(parsed.data.pauseRemaining?.interrupt).toBe(20_000);
    expect(nextRoomDeadline(parsed.data)).toBeNull();
  });
});

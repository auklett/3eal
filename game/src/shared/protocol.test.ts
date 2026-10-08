import { describe, expect, it } from 'vitest';
import { ClientMsgSchema, ViewSchema } from './protocol';

describe('validated room protocol', () => {
  it('defaults new join requests to player role and trims names', () => {
    expect(ClientMsgSchema.parse({
      t: 'join',
      name: '  Alice  ',
      sessionId: '00000000-0000-4000-8000-000000000001'
    })).toEqual({
      t: 'join',
      name: 'Alice',
      role: 'player',
      sessionId: '00000000-0000-4000-8000-000000000001'
    });
  });

  it('rejects unknown fields and out-of-range table slots', () => {
    expect(ClientMsgSchema.safeParse({ t: 'start', isHost: true }).success).toBe(false);
    expect(ClientMsgSchema.safeParse({ t: 'place', cardId: 'opaque', slot: 218 }).success).toBe(false);
    expect(ClientMsgSchema.safeParse({
      t: 'action',
      cardId: 'opaque',
      kind: 'APPEAL',
      targetId: '00000000-0000-4000-8000-000000000001',
      slot: 0
    }).success).toBe(false);
  });

  it('does not allow spectators to receive player-only private fields', () => {
    const publicData = {
      roomCode: 'ABCD',
      phase: 'playing',
      hostId: '00000000-0000-4000-8000-000000000001',
      players: [{
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Alice',
        connected: true,
        away: false,
        table: [{ state: 'concealed', cardId: 'opaque-random-card-id' }],
        handCount: 2
      }],
      spectators: [],
      spectatorCount: 0,
      activePlayerId: null,
      turnEndsAt: null,
      turnRemainingMs: null,
      turnDurationSeconds: 60,
      turnNumber: 0,
      interrupt: null,
      lastInterruptResult: null,
      deckCount: 0,
      discardCount: 0,
      winnerId: null
    };
    expect(ViewSchema.safeParse({
      role: 'spectator',
      data: { ...publicData, you: { id: publicData.hostId, hand: [], concealedOwn: {} } }
    }).success).toBe(false);
    expect(ViewSchema.safeParse({
      role: 'spectator',
      data: {
        ...publicData,
        players: [{
          ...publicData.players[0],
          table: [{ state: 'concealed', cardId: 'opaque-random-card-id', card: { id: 'leak', kind: 'teal' } }]
        }]
      }
    }).success).toBe(false);
  });
});

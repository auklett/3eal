import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoom } from '@3eal/engine';
import { GameRoom } from './gameRoom';
import { persistedRoomSchema } from './persistedRoomSchema';

// Mock the storage
const mockStorage = {
  sql: {
    exec: vi.fn().mockReturnValue({ toArray: () => [] })
  },
  setAlarm: vi.fn().mockResolvedValue(undefined),
  deleteAlarm: vi.fn().mockResolvedValue(undefined)
};

// Mock the DurableObjectState
const mockCtx = {
  blockConcurrencyWhile: vi.fn((fn) => fn()),
  storage: mockStorage,
  setWebSocketAutoResponse: vi.fn(),
  acceptWebSocket: vi.fn(),
  getWebSockets: vi.fn(() => [])
};

describe('handleSocketClose', () => {
  let room: GameRoom;

  function makeSocket(attachment: {
    role: 'unjoined' | 'pending' | 'player' | 'spectator';
    playerId: string | null;
    sessionId: string | null;
    name: string;
  }, readyState = WebSocket.OPEN): WebSocket {
    const socket = {
      deserializeAttachment: vi.fn(() => attachment),
      serializeAttachment: vi.fn(),
      close: vi.fn(),
      send: vi.fn(),
      readyState
    } as unknown as WebSocket;
    return socket;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    room = new GameRoom(mockCtx as any, {} as any);
    
    // Initialize a room state
    const testRoom = {
      roomCode: 'ABCD',
      phase: 'playing' as const,
      hostId: 'host-1',
      players: [
        { id: 'host-1', name: 'Host', connected: true, away: false, table: [], hand: [], left: false, kicked: false, awayAt: null, sessionIds: ['session-host'] },
        { id: 'guest-1', name: 'Guest', connected: true, away: false, table: [], hand: [], left: false, kicked: false, awayAt: null, sessionIds: ['session-guest'] }
      ],
      spectators: [],
      deck: [],
      activePlayerId: null,
      turnNumber: 0,
      turnEndsAt: null,
      turnRemainingMs: null,
      turnDurationSeconds: 60,
      paused: false,
      pauseRemaining: null,
      interrupt: null,
      lastInterruptResult: null,
      winnerId: null,
      winningSets: null,
      randomSeed: 'seed',
      randomCounter: 0,
      rejoinRequests: [],
      skipAfterInterrupt: false
    };
    
    // Set the room state directly
    (room as any).room = testRoom;
    (room as any).ready = Promise.resolve();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not mark member disconnected when another tagged socket owns the same member', async () => {
    const socket1 = makeSocket({
      role: 'player',
      playerId: 'guest-1',
      sessionId: 'session-guest',
      name: 'Guest'
    });
    const socket2 = makeSocket({
      role: 'player',
      playerId: 'guest-1',
      sessionId: 'session-guest',
      name: 'Guest'
    });

    mockCtx.getWebSockets.mockReturnValue([socket1, socket2]);

    await (room as any).handleSocketClose(socket1);

    // The room should not be modified - guest should still be connected
    expect((room as any).room.players.find((p: any) => p.id === 'guest-1')?.connected).toBe(true);
  });

  it('marks member disconnected when the last tagged socket for that member closes', async () => {
    const socket1 = makeSocket({
      role: 'player',
      playerId: 'guest-1',
      sessionId: 'session-guest',
      name: 'Guest'
    });

    mockCtx.getWebSockets.mockReturnValue([socket1]);

    await (room as any).handleSocketClose(socket1);

    // The guest should be marked as disconnected (connected = false)
    expect((room as any).room.players.find((p: any) => p.id === 'guest-1')?.connected).toBe(false);
  });

  it('does not mark disconnected when socket has no member ID', async () => {
    const socket = makeSocket({
      role: 'unjoined',
      playerId: null,
      sessionId: null,
      name: ''
    });

    mockCtx.getWebSockets.mockReturnValue([socket]);

    await (room as any).handleSocketClose(socket);

    // Room should not be modified
    expect((room as any).room.players.find((p: any) => p.id === 'guest-1')?.connected).toBe(true);
  });

  it('does not mark disconnected for pending role sockets', async () => {
    const socket = makeSocket({
      role: 'pending',
      playerId: null,
      sessionId: 'session-guest',
      name: 'Guest',
      requestId: 'req-1'
    });

    mockCtx.getWebSockets.mockReturnValue([socket]);

    await (room as any).handleSocketClose(socket);

    // Room should not be modified since pending sockets don't have playerId
    expect((room as any).room.players.find((p: any) => p.id === 'guest-1')?.connected).toBe(true);
  });

  it('keeps a member connected when another session has a live socket for that member', async () => {
    const socket1 = makeSocket({
      role: 'player',
      playerId: 'guest-1',
      sessionId: 'session-guest',
      name: 'Guest'
    });
    const socket2 = makeSocket({
      role: 'player',
      playerId: 'guest-1',
      sessionId: 'approved-rejoin-session',
      name: 'Guest'
    });

    mockCtx.getWebSockets.mockReturnValue([socket1, socket2]);

    await (room as any).handleSocketClose(socket1);

    // The participant ID, not the session ID, identifies this member's seat.
    expect((room as any).room.players.find((p: any) => p.id === 'guest-1')?.connected).toBe(true);
  });

  it('does not count a closed tagged socket as a live connection', async () => {
    const socket1 = makeSocket({
      role: 'player',
      playerId: 'guest-1',
      sessionId: 'session-guest',
      name: 'Guest'
    }, WebSocket.CLOSED);
    const socket2 = makeSocket({
      role: 'player',
      playerId: 'guest-1',
      sessionId: 'old-session',
      name: 'Guest'
    }, WebSocket.CLOSED);

    mockCtx.getWebSockets.mockReturnValue([socket1, socket2]);

    await (room as any).handleSocketClose(socket1);

    expect((room as any).room.players.find((p: any) => p.id === 'guest-1')?.connected).toBe(false);
  });

  it('broadcasts to open sockets when the socket list also contains a closed socket', () => {
    const closedSocket = makeSocket({
      role: 'player',
      playerId: 'guest-1',
      sessionId: 'old-session',
      name: 'Guest'
    }, WebSocket.CLOSED);
    const openGuestSocket = makeSocket({
      role: 'player',
      playerId: 'guest-1',
      sessionId: 'session-guest',
      name: 'Guest'
    });
    const openHostSocket = makeSocket({
      role: 'player',
      playerId: 'host-1',
      sessionId: 'session-host',
      name: 'Host'
    });
    mockCtx.getWebSockets.mockReturnValue([closedSocket, openGuestSocket, openHostSocket]);

    (room as any).broadcast();

    expect(closedSocket.send).not.toHaveBeenCalled();
    expect(openGuestSocket.send).toHaveBeenCalledOnce();
    expect(openHostSocket.send).toHaveBeenCalledOnce();
    expect(openGuestSocket.send).toHaveBeenCalledWith(expect.stringContaining('"t":"view"'));
    expect(openHostSocket.send).toHaveBeenCalledWith(expect.stringContaining('"t":"view"'));
  });

  it('persists a return-to-lobby snapshot without transient fields', async () => {
    const hostId = '00000000-0000-4000-8000-000000000001';
    const hostSessionId = '00000000-0000-4000-8000-000000000002';
    const state = createRoom('ABCD', hostId, hostSessionId, 'Host', 'seed');
    state.phase = 'finished';
    (room as any).room = state;
    const hostSocket = makeSocket({
      role: 'player',
      playerId: hostId,
      sessionId: hostSessionId,
      name: 'Host'
    });
    mockCtx.getWebSockets.mockReturnValue([hostSocket]);

    await (room as any).handleReturnToLobby(hostSocket, {
      role: 'player',
      playerId: hostId,
      sessionId: hostSessionId,
      name: 'Host'
    });

    const persistedJson = mockStorage.sql.exec.mock.calls.at(-1)?.[1];
    expect(typeof persistedJson).toBe('string');
    const parsed = persistedRoomSchema.safeParse(JSON.parse(String(persistedJson)) as unknown);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.phase).toBe('lobby');
  });
});

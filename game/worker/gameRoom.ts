import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';
import {
  addParticipant,
  createRoom,
  kickParticipant,
  nextRoomDeadline,
  processDeadlines,
  reduceRoom,
  requestRejoin,
  resolveRejoinRequest,
  setParticipantConnected,
  type RoomIntent,
  type RoomState
} from '@3eal/engine';
import { ClientMsgSchema, type ClientMsg, type ServerMsg } from '../src/shared/protocol';
import { persistedRoomSchema } from './persistedRoomSchema';
import { playerView, spectatorView } from './views';

type Attachment = {
  role: 'unjoined' | 'pending' | 'player' | 'spectator';
  playerId: string | null;
  sessionId: string | null;
  name: string;
  requestId?: string;
};

export class GameRoom extends DurableObject<Env> {
  private room: RoomState | null = null;
  private readonly ready: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS room_state (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL)');
      const row = ctx.storage.sql.exec<{ json: string }>('SELECT json FROM room_state WHERE id = 1').toArray()[0];
      if (row) {
        const parsed = persistedRoomSchema.safeParse(JSON.parse(row.json) as unknown);
        if (!parsed.success) throw new Error('Persisted GameRoom state failed validation');
        this.room = parsed.data;
      }
    });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/internal/initialize') {
      if (this.room) return Response.json({ error: 'Room already exists' }, { status: 409 });
      const body = await readJson(request);
      const parsed = initializeRoomSchema.safeParse(body);
      if (!parsed.success) return Response.json({ error: 'Invalid room initialization' }, { status: 400 });
      this.room = createRoom(
        parsed.data.roomCode,
        parsed.data.hostId,
        parsed.data.hostSessionId,
        parsed.data.hostName,
        parsed.data.seed
      );
      await this.commit();
      return Response.json({ ok: true });
    }

    if (request.method !== 'GET' || !url.pathname.endsWith('/ws') || request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }
    if (!this.room) return new Response('Room not found', { status: 404 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.serializeAttachment({
      role: 'unjoined',
      playerId: null,
      sessionId: null,
      name: ''
    } satisfies Attachment);
    this.ctx.acceptWebSocket(server, ['room']);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(webSocket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    await this.ready;
    if (!this.room) return this.sendError(webSocket, 'room_missing', 'Room is not initialized');
    if (typeof raw !== 'string' || raw.length > 4096) {
      return this.sendError(webSocket, 'invalid_message', 'Message is invalid or too large');
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return this.sendError(webSocket, 'invalid_json', 'Message must be valid JSON');
    }
    const parsed = ClientMsgSchema.safeParse(json);
    if (!parsed.success) return this.sendError(webSocket, 'invalid_message', 'Message does not match the protocol');

    const message = parsed.data;
    const attachment = webSocket.deserializeAttachment() as Attachment;
    if (message.t === 'join') return this.handleJoin(webSocket, attachment, message);
    if (message.t === 'rejoin') return this.handleRejoin(webSocket, attachment, message);
    if (attachment.role === 'unjoined') return this.sendError(webSocket, 'join_required', 'Join the room before sending actions');
    if (attachment.role === 'pending') return this.sendError(webSocket, 'approval_pending', 'Wait for the host to decide your rejoin request');

    if (message.t === 'rejoinDecision') return this.handleRejoinDecision(webSocket, message);
    if (message.t === 'kick') return this.handleKick(webSocket, attachment, message);

    if (!attachment.playerId) return this.sendError(webSocket, 'spectator_read_only', 'Spectators cannot send game actions');
    const intent = toRoomIntent(message);
    if (!intent) return this.sendError(webSocket, 'unsupported_action', 'This message is not a room action');
    const result = reduceRoom(this.room, attachment.playerId, intent, Date.now());
    if ('error' in result) return this.sendError(webSocket, 'rejected', result.error);
    this.room = result.state;
    if (message.t === 'setRole') {
      webSocket.serializeAttachment({
        ...attachment,
        role: message.role
      } satisfies Attachment);
    }
    if (message.t === 'rematch') this.closeKickedSockets();
    await this.commit();
  }

  async webSocketClose(webSocket: WebSocket): Promise<void> {
    await this.handleSocketClose(webSocket);
  }

  async webSocketError(webSocket: WebSocket): Promise<void> {
    await this.handleSocketClose(webSocket);
  }

  async alarm(): Promise<void> {
    await this.ready;
    if (!this.room) return;
    const now = Date.now();
    const result = processDeadlines(this.room, now);
    this.room = result.state;
    for (const requestId of result.expiredRejoinIds) {
      this.finishExpiredRejoin(requestId);
    }
    await this.commit();
  }

  private async handleJoin(webSocket: WebSocket, attachment: Attachment, message: Extract<ClientMsg, { t: 'join' }>): Promise<void> {
    if (!this.room) return this.sendError(webSocket, 'room_missing', 'Room is not initialized');
    if (attachment.role !== 'unjoined') return this.sendError(webSocket, 'already_joined', 'This connection has already joined');

    const existingPlayer = this.room.players.find((player) =>
      player.sessionIds.includes(message.sessionId) && !player.kicked
    );
    const existingSpectator = this.room.spectators.find((spectator) => spectator.sessionIds.includes(message.sessionId));
    if (existingPlayer || existingSpectator) {
      const participant = existingPlayer ?? existingSpectator;
      if (!participant) return this.sendError(webSocket, 'session_missing', 'Session could not be restored');
      const role = existingPlayer ? 'player' : 'spectator';
      webSocket.serializeAttachment({
        role,
        playerId: participant.id,
        sessionId: message.sessionId,
        name: participant.name
      } satisfies Attachment);
      this.room = setParticipantConnected(this.room, participant.id, true, Date.now());
      this.closeDuplicateSockets(participant.id, webSocket);
      await this.commit();
      return;
    }

    const matchingPlayer = this.room.players.find((player) =>
      player.name.trim().toLowerCase() === message.name.trim().toLowerCase() && !player.kicked
    );
    if (matchingPlayer && this.room.phase !== 'lobby' && message.role === 'player') {
      return this.createRejoinRequest(webSocket, message.sessionId, message.name);
    }

    const participantId = crypto.randomUUID();
    const added = addParticipant(this.room, participantId, message.name, message.role, message.sessionId);
    if ('error' in added) return this.sendError(webSocket, 'join_rejected', added.error);
    this.room = added.state;
    const participant = this.room.players.find((player) => player.sessionIds.includes(message.sessionId))
      ?? this.room.spectators.find((spectator) => spectator.sessionIds.includes(message.sessionId));
    if (!participant) return this.sendError(webSocket, 'join_failed', 'Could not add participant to the room');
    const role = 'table' in participant ? 'player' : 'spectator';
    webSocket.serializeAttachment({
      role,
      playerId: participant.id,
      sessionId: message.sessionId,
      name: participant.name
    } satisfies Attachment);
    await this.commit();
  }

  private async handleRejoin(webSocket: WebSocket, attachment: Attachment, message: Extract<ClientMsg, { t: 'rejoin' }>): Promise<void> {
    if (!this.room) return this.sendError(webSocket, 'room_missing', 'Room is not initialized');
    if (attachment.role !== 'unjoined') {
      return this.sendError(webSocket, 'join_required', 'Join the room before requesting rejoin');
    }
    return this.createRejoinRequest(webSocket, message.sessionId, message.name);
  }

  private async createRejoinRequest(webSocket: WebSocket, sessionId: string, name: string): Promise<void> {
    if (!this.room) return this.sendError(webSocket, 'room_missing', 'Room is not initialized');
    const requestId = crypto.randomUUID();
    const spectatorId = crypto.randomUUID();
    const result = requestRejoin(this.room, requestId, sessionId, spectatorId, name, Date.now());
    if ('error' in result) return this.sendError(webSocket, 'rejoin_rejected', result.error);
    this.room = result.state;
    const request = this.room.rejoinRequests.find((item) => item.id === requestId);
    const hostSocket = this.socketForPlayer(this.room.hostId);
    if (!request) return this.sendError(webSocket, 'rejoin_failed', 'Could not create rejoin request');
    webSocket.serializeAttachment({
      role: 'pending',
      playerId: null,
      sessionId,
      name: request.name,
      requestId
    } satisfies Attachment);
    this.send(webSocket, { t: 'rejoinPending' });
    if (hostSocket) this.send(hostSocket, { t: 'rejoinRequest', requestId, name: request.name });
    await this.commit();
  }

  private async handleRejoinDecision(
    hostSocket: WebSocket,
    message: Extract<ClientMsg, { t: 'rejoinDecision' }>
  ): Promise<void> {
    if (!this.room) return;
    const requesterSocket = this.ctx.getWebSockets('room').find((socket) => {
      const attachment = socket.deserializeAttachment() as Attachment;
      return attachment.requestId === message.requestId && attachment.role === 'pending';
    });
    if (!requesterSocket) return this.sendError(hostSocket, 'rejoin_rejected', 'Requester is no longer connected');
    const result = resolveRejoinRequest(this.room, this.socketPlayerId(hostSocket), message.requestId, message.accept, Date.now());
    if ('error' in result.result) return this.sendError(hostSocket, 'rejoin_rejected', result.result.error);
    this.room = result.result.state;

    const attachment = requesterSocket.deserializeAttachment() as Attachment;
    const accepted = message.accept && result.acceptedPlayerId !== undefined;
    if (!attachment.sessionId) return this.sendError(hostSocket, 'rejoin_rejected', 'Requester session is no longer available');
    const participant = accepted
      ? this.room.players.find((player) => player.id === result.acceptedPlayerId)
      : this.room.spectators.find((spectator) => spectator.sessionIds.includes(attachment.sessionId ?? ''));
    if (!participant) return this.sendError(hostSocket, 'rejoin_rejected', 'Requester could not be assigned a seat');
    requesterSocket.serializeAttachment({
      role: accepted ? 'player' : 'spectator',
      playerId: participant.id,
      sessionId: attachment.sessionId,
      name: participant.name
    } satisfies Attachment);
    if (accepted) this.closeDuplicateSockets(participant.id, requesterSocket);
    this.send(requesterSocket, { t: 'rejoinResult', accepted, role: accepted ? 'player' : 'spectator' });
    await this.commit();
  }

  private async handleKick(
    hostSocket: WebSocket,
    attachment: Attachment,
    message: Extract<ClientMsg, { t: 'kick' }>
  ): Promise<void> {
    if (!this.room || !attachment.playerId) return this.sendError(hostSocket, 'host_only', 'Only a host player can kick participants');
    const result = kickParticipant(this.room, attachment.playerId, message.targetId, Date.now());
    if ('error' in result) return this.sendError(hostSocket, 'kick_rejected', result.error);
    this.room = result.state;
    for (const socket of this.ctx.getWebSockets('room')) {
      const target = socket.deserializeAttachment() as Attachment;
      if (target.playerId === message.targetId) {
        this.sendError(socket, 'kicked', 'The host removed you from the room');
        socket.close(4003, 'kicked');
      }
    }
    await this.commit();
  }

  private async handleSocketClose(webSocket: WebSocket): Promise<void> {
    await this.ready;
    if (!this.room) return;
    const attachment = webSocket.deserializeAttachment() as Attachment;
    if (!attachment.playerId) return;
    const hasOtherConnection = this.ctx.getWebSockets('room').some((socket) => {
      if (socket === webSocket) return false;
      const other = socket.deserializeAttachment() as Attachment;
      return other.playerId === attachment.playerId && (other.role === 'player' || other.role === 'spectator');
    });
    if (hasOtherConnection) return;
    this.room = setParticipantConnected(this.room, attachment.playerId, false, Date.now());
    await this.commit();
  }

  private finishExpiredRejoin(requestId: string): void {
    const socket = this.ctx.getWebSockets('room').find((candidate) => {
      const attachment = candidate.deserializeAttachment() as Attachment;
      return attachment.role === 'pending' && attachment.requestId === requestId;
    });
    if (!socket || !this.room) return;
    const attachment = socket.deserializeAttachment() as Attachment;
    if (!attachment.sessionId) return this.sendError(socket, 'rejoin_expired', 'Rejoin request expired');
    const spectator = this.room.spectators.find((candidate) => candidate.sessionIds.includes(attachment.sessionId ?? ''));
    if (!spectator) return this.sendError(socket, 'rejoin_expired', 'Rejoin request expired');
    socket.serializeAttachment({
      role: 'spectator',
      playerId: spectator.id,
      sessionId: attachment.sessionId,
      name: spectator.name
    } satisfies Attachment);
    this.send(socket, { t: 'rejoinResult', accepted: false, role: 'spectator' });
  }

  private closeDuplicateSockets(playerId: string, keep: WebSocket): void {
    for (const socket of this.ctx.getWebSockets('room')) {
      if (socket === keep) continue;
      const attachment = socket.deserializeAttachment() as Attachment;
      if (attachment.playerId === playerId && (attachment.role === 'player' || attachment.role === 'spectator')) {
        socket.close(4001, 'reconnected');
      }
    }
  }

  private closeKickedSockets(): void {
    if (!this.room) return;
    const kickedIds = new Set(this.room.players.filter((player) => player.kicked).map((player) => player.id));
    for (const socket of this.ctx.getWebSockets('room')) {
      const attachment = socket.deserializeAttachment() as Attachment;
      if (attachment.playerId && kickedIds.has(attachment.playerId)) socket.close(4003, 'kicked');
    }
  }

  private socketForPlayer(playerId: string): WebSocket | undefined {
    return this.ctx.getWebSockets('room').find((socket) => {
      const attachment = socket.deserializeAttachment() as Attachment;
      return attachment.role === 'player' && attachment.playerId === playerId;
    });
  }

  private socketPlayerId(webSocket: WebSocket): string {
    const attachment = webSocket.deserializeAttachment() as Attachment;
    return attachment.role === 'player' ? attachment.playerId ?? '' : '';
  }

  private sendError(webSocket: WebSocket, code: string, message: string): void {
    this.send(webSocket, { t: 'error', code, message });
  }

  private send(webSocket: WebSocket, message: ServerMsg): void {
    webSocket.send(JSON.stringify(message));
  }

  private async commit(): Promise<void> {
    if (!this.room) return;
    this.ctx.storage.sql.exec(
      'INSERT INTO room_state (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json',
      JSON.stringify(this.room)
    );
    const deadline = nextRoomDeadline(this.room);
    if (deadline === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(deadline);
    this.broadcast();
  }

  private broadcast(): void {
    if (!this.room) return;
    for (const webSocket of this.ctx.getWebSockets('room')) {
      const attachment = webSocket.deserializeAttachment() as Attachment;
      if (attachment.role === 'unjoined' || attachment.role === 'pending' || !attachment.playerId) continue;
      const player = this.room.players.find((candidate) => candidate.id === attachment.playerId);
      const spectator = this.room.spectators.find((candidate) => candidate.id === attachment.playerId);
      if (attachment.role === 'player' && player) this.send(webSocket, { t: 'view', view: playerView(this.room, player.id) });
      else if (attachment.role === 'spectator' && spectator) this.send(webSocket, { t: 'view', view: spectatorView(this.room) });
    }
  }
}

function toRoomIntent(message: ClientMsg): RoomIntent | null {
  switch (message.t) {
    case 'setRole':
    case 'setTurnTimer':
    case 'start':
    case 'place':
    case 'toHand':
    case 'action':
    case 'appeal':
    case 'pass':
    case 'endTurn':
    case 'rematch':
      return message;
    default:
      return null;
  }
}

async function readJson(request: Request | Response): Promise<unknown> {
  try {
    return await request.json() as unknown;
  } catch {
    return null;
  }
}

const initializeRoomSchema = z.object({
  roomCode: z.string().regex(/^[A-Z0-9]{4,6}$/),
  hostId: z.string().uuid(),
  hostSessionId: z.string().uuid(),
  hostName: z.string().trim().min(1).max(24),
  seed: z.string().min(1).max(128)
}).strict().refine((room) => room.hostId !== room.hostSessionId);

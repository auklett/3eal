import {
  collection,
  doc,
  onSnapshot,
  type Unsubscribe
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { auth, db } from './firebase';
import type { ActionType, Card, TurnPhase } from '../types';

export interface RoomPlayer {
  id: string;
  name: string;
  joinedAt: number;
  role?: 'PLAYER' | 'SPECTATOR';
  seatIndex?: number;
}

export interface LobbyRoom {
  roomCode: string;
  status: 'LOBBY' | 'IN_GAME' | 'FINISHED';
  hostId: string;
  turnDurationMs?: number;
  players: Record<string, RoomPlayer>;
}

export interface RejoinRequest {
  requesterId: string;
  name: string;
  createdAt: number;
  expiresAt: number;
}

export interface GameViewPlayer {
  id: string;
  name: string;
  isHost: boolean;
  table: Card[];
  hand: Card[];
  handCount?: number;
  sets: Array<{ cards: Card[] }>;
  isOnline: boolean;
  role: 'PLAYER' | 'SPECTATOR';
  seatIndex?: number;
  privateVersion?: number;
}

export interface PlayerGameView {
  roomCode: string;
  selfId: string;
  viewerRole: 'PLAYER' | 'SPECTATOR';
  players: Record<string, GameViewPlayer>;
  deckCount: number;
  activePlayerId: string;
  turnNumber: number;
  turnEndsAt?: number;
  version: number;
  turnPhase: TurnPhase;
  pendingAction?: {
    actionType: Exclude<ActionType, 'APPEAL'>;
    sourcePlayerId: string;
    targetPlayerId: string;
    resolveAt: number;
  };
  winnerId: string | null;
  canAppeal: boolean;
}

interface PublicGameView extends Omit<PlayerGameView, 'selfId' | 'viewerRole' | 'canAppeal'> {}

interface PrivatePlayerDocument {
  ownerId: string;
  seatIndex: number;
  version: number;
  player: {
    table: Card[];
    hand: Card[];
    sets: Array<{ cards: Card[] }>;
  };
}

let identityRequest: Promise<string> | undefined;

export function ensurePlayerId(): Promise<string> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
  identityRequest ??= signInAnonymously(auth)
    .then(({ user }) => user.uid)
    .catch((error: unknown) => {
      identityRequest = undefined;
      throw error;
    });
  return identityRequest;
}

async function apiRequest<T>(payload: Record<string, unknown>): Promise<T> {
  await ensurePlayerId();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Sign in to continue.');
  const startedAt = performance.now();
  const result = await fetch('/api/rooms', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await result.json() as { error?: string } & T;
  performance.measure('3eal:room-api-request', { start: startedAt, end: performance.now() });
  if (!result.ok) throw new Error(data.error ?? 'The request could not be completed.');
  return data;
}

function roomRef(roomCode: string) {
  return doc(db, 'rooms', roomCode);
}

export async function createRoom(name: string, roomCode?: string): Promise<string> {
  const result = await apiRequest<{ roomCode: string }>({
    action: 'create',
    name,
    ...(roomCode ? { roomCode } : {})
  });
  return result.roomCode;
}

export async function joinRoom(roomCode: string, name: string): Promise<string> {
  await apiRequest({ action: 'join', roomCode, name });
  return ensurePlayerId();
}

export async function setLobbyRole(roomCode: string, role: 'PLAYER' | 'SPECTATOR'): Promise<void> {
  await apiRequest({ action: 'setRole', roomCode, role });
}

export async function setLobbyTurnDuration(roomCode: string, turnDurationMs: number): Promise<void> {
  await apiRequest({ action: 'setTurnDuration', roomCode, turnDurationMs });
}

export async function rejoinRoom(roomCode: string, name: string): Promise<{ status: string; expiresAt?: number }> {
  return apiRequest({ action: 'rejoin', roomCode, name });
}

export async function checkRejoinStatus(roomCode: string): Promise<{ status: string; expiresAt?: number }> {
  return apiRequest({ action: 'rejoinStatus', roomCode });
}

export async function cancelRejoinRequest(roomCode: string): Promise<void> {
  await apiRequest({ action: 'cancelRejoin', roomCode });
}

export async function respondToRejoinRequest(
  roomCode: string,
  requesterId: string,
  approve: boolean
): Promise<void> {
  await apiRequest({ action: approve ? 'approveRejoin' : 'declineRejoin', roomCode, requestId: requesterId });
}

export function subscribeToRejoinRequests(
  roomCode: string,
  onRequests: (requests: RejoinRequest[]) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'rooms', roomCode, 'rejoinRequests'),
    (snapshot) => onRequests(snapshot.docs.map((item) => item.data() as RejoinRequest)),
    onError
  );
}

export function subscribeToRoom(
  roomCode: string,
  onRoom: (room: LobbyRoom | null) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    roomRef(roomCode),
    (snapshot) => onRoom(snapshot.exists() ? snapshot.data() as LobbyRoom : null),
    onError
  );
}

export async function renamePlayer(roomCode: string, name: string): Promise<void> {
  await apiRequest({ action: 'renamePlayer', roomCode, name });
}

export async function kickPlayer(roomCode: string, playerId: string): Promise<void> {
  await apiRequest({ action: 'kick', roomCode, playerId });
}

export async function leaveRoom(roomCode: string): Promise<void> {
  await apiRequest({ action: 'leave', roomCode });
}

export async function isRoomMember(roomCode: string): Promise<boolean> {
  const result = await apiRequest<{ member: boolean }>({ action: 'checkMembership', roomCode });
  return result.member;
}

export async function renameRoom(roomCode: string, newRoomCode: string): Promise<void> {
  await apiRequest({ action: 'renameRoom', roomCode, newRoomCode });
}

export async function startRoom(roomCode: string): Promise<void> {
  await apiRequest({ action: 'start', roomCode });
}

export function sendGameCommand(
  roomCode: string,
  action: 'draw' | 'play' | 'appeal' | 'discard' | 'moveToTable' | 'moveToHand' | 'endTurn' | 'resolve' | 'heartbeat',
  payload: Record<string, unknown> = {}
): Promise<void> {
  return apiRequest({ action, roomCode, ...payload });
}

export async function subscribeToPlayerView(
  roomCode: string,
  playerId: string,
  onView: (view: PlayerGameView | null) => void,
  onError: (error: Error) => void
): Promise<Unsubscribe> {
  await ensurePlayerId();
  let publicView: PublicGameView | null = null;
  let privatePlayer: PrivatePlayerDocument['player'] | null = null;
  let privateVersion = -1;
  let privateSeatIndex: number | undefined;
  let privateUnsubscribe: Unsubscribe | undefined;
  const subscriptionStartedAt = performance.now();
  let firstSnapshotMeasured = false;
  const publish = () => {
    if (!publicView) {
      onView(null);
      return;
    }
    const member = publicView.players[playerId];
    const viewerRole = member?.role ?? 'SPECTATOR';
    if (viewerRole === 'PLAYER' && privateVersion !== (member?.privateVersion ?? 0)) return;
    const players = Object.fromEntries(Object.entries(publicView.players).map(([id, player]) => {
      const isSelf = id === playerId;
      return [id, {
        ...player,
        hand: isSelf && privatePlayer ? privatePlayer.hand : [],
        table: isSelf && privatePlayer ? privatePlayer.table : player.table,
        sets: isSelf && privatePlayer ? privatePlayer.sets : [],
        handCount: isSelf && privatePlayer ? privatePlayer.hand.length : undefined
      }];
    }));
    const pending = publicView.pendingAction;
    const canAppeal = Boolean(viewerRole === 'PLAYER' && pending &&
      (pending.actionType === 'CONCEAL'
        ? playerId !== pending.sourcePlayerId
        : playerId === pending.targetPlayerId) &&
      privatePlayer?.hand.some((card) => card.actionType === 'APPEAL'));
    onView({ ...publicView, selfId: playerId, viewerRole, players, canAppeal });
  };
  const stopPublic = onSnapshot(
    doc(db, 'rooms', roomCode, 'public', 'state'),
    (snapshot) => {
      if (!firstSnapshotMeasured) {
        performance.measure('3eal:firestore-first-snapshot', {
          start: subscriptionStartedAt,
          end: performance.now()
        });
        firstSnapshotMeasured = true;
      }
      publicView = snapshot.exists() ? snapshot.data() as PublicGameView : null;
      const member = publicView?.players[playerId];
      const seatIndex = member?.role === 'PLAYER' ? member.seatIndex : undefined;
      if (seatIndex !== privateSeatIndex) {
        privateUnsubscribe?.();
        privateUnsubscribe = undefined;
        privatePlayer = null;
        privateVersion = -1;
        privateSeatIndex = seatIndex;
        if (seatIndex !== undefined) {
          privateUnsubscribe = onSnapshot(
            doc(db, 'rooms', roomCode, 'playerPrivate', `seat-${seatIndex}`),
            (privateSnapshot) => {
              const data = privateSnapshot.exists() ? privateSnapshot.data() as PrivatePlayerDocument : null;
              if (data?.ownerId !== playerId) {
                onError(new Error('The private game seat is not assigned to this player.'));
                return;
              }
              privatePlayer = data.player;
              privateVersion = data.version;
              publish();
            },
            onError
          );
        }
      }
      publish();
    },
    onError
  );
  return () => {
    stopPublic();
    privateUnsubscribe?.();
  };
}

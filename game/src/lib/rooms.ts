import {
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
}

export interface LobbyRoom {
  roomCode: string;
  status: 'LOBBY' | 'IN_GAME' | 'FINISHED';
  hostId: string;
  players: Record<string, RoomPlayer>;
}

export interface GameViewPlayer {
  id: string;
  name: string;
  isHost: boolean;
  table: Card[];
  hand: Card[];
  handCount: number;
  sets: Card[][];
}

export interface PlayerGameView {
  roomCode: string;
  selfId: string;
  players: Record<string, GameViewPlayer>;
  deckCount: number;
  discardPile: Card[];
  activePlayerId: string;
  turnPhase: TurnPhase;
  pendingAction?: {
    actionType: Exclude<ActionType, 'APPEAL'>;
    sourcePlayerId: string;
    targetPlayerId: string;
    appealWindowEndsAt: number;
  };
  winnerId: string | null;
  canAppeal: boolean;
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
  const result = await fetch('/api/rooms', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await result.json() as { error?: string } & T;
  if (!result.ok) throw new Error(data.error ?? 'The request could not be completed.');
  return data;
}

function roomRef(roomCode: string) {
  return doc(db, 'rooms', roomCode);
}

export async function createRoom(name: string): Promise<string> {
  const result = await apiRequest<{ roomCode: string }>({ action: 'create', name });
  return result.roomCode;
}

export async function joinRoom(roomCode: string, name: string): Promise<string> {
  await apiRequest({ action: 'join', roomCode, name });
  return ensurePlayerId();
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

export async function renameRoom(roomCode: string, newRoomCode: string): Promise<void> {
  await apiRequest({ action: 'renameRoom', roomCode, newRoomCode });
}

export async function startRoom(roomCode: string): Promise<void> {
  await apiRequest({ action: 'start', roomCode });
}

export function sendGameCommand(
  roomCode: string,
  action: 'draw' | 'play' | 'appeal' | 'discard' | 'endTurn' | 'resolve',
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
  return onSnapshot(
    doc(db, 'rooms', roomCode, 'views', playerId),
    (snapshot) => onView(snapshot.exists() ? snapshot.data() as PlayerGameView : null),
    onError
  );
}

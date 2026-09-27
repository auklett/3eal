import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Unsubscribe
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { auth, db } from './firebase';

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

function roomRef(roomCode: string) {
  return doc(collection(db, 'rooms'), roomCode);
}

function normalizeName(name: string): string {
  const normalized = name.trim().slice(0, 24);
  if (!normalized) throw new Error('Enter a player name first.');
  return normalized;
}

function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

export async function createRoom(name: string): Promise<string> {
  const playerId = await ensurePlayerId();
  const playerName = normalizeName(name);

  for (let attempt = 0; attempt < 5; attempt++) {
    const roomCode = generateRoomCode();
    const reference = roomRef(roomCode);
    const created = await runTransaction(db, async (transaction) => {
      const existing = await transaction.get(reference);
      if (existing.exists()) return false;

      const player: RoomPlayer = { id: playerId, name: playerName, joinedAt: Date.now() };
      transaction.set(reference, {
        roomCode,
        status: 'LOBBY',
        hostId: playerId,
        players: { [playerId]: player },
        createdAt: serverTimestamp()
      });
      return true;
    });
    if (created) return roomCode;
  }

  throw new Error('Could not create a unique room code. Please try again.');
}

export async function joinRoom(roomCode: string, name: string): Promise<string> {
  const playerId = await ensurePlayerId();
  const playerName = normalizeName(name);
  const reference = roomRef(roomCode);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error('That room code was not found.');

    const room = snapshot.data() as LobbyRoom;
    if (room.status !== 'LOBBY' && !room.players[playerId]) {
      throw new Error('This game has already started.');
    }
    if (room.players[playerId]) return;

    transaction.update(reference, {
      [`players.${playerId}`]: { id: playerId, name: playerName, joinedAt: Date.now() }
    });
  });

  return playerId;
}

export function subscribeToRoom(
  roomCode: string,
  onRoom: (room: LobbyRoom | null) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    roomRef(roomCode),
    (snapshot) => onRoom(snapshot.exists() ? snapshot.data() as LobbyRoom : null),
    (error) => onError(error)
  );
}

export async function renamePlayer(roomCode: string, name: string): Promise<void> {
  const playerId = await ensurePlayerId();
  const playerName = normalizeName(name);
  await runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error('This room no longer exists.');
    const room = snapshot.data() as LobbyRoom;
    if (!room.players[playerId]) throw new Error('You are no longer a member of this room.');
    transaction.update(reference, { [`players.${playerId}.name`]: playerName });
  });
}

export async function kickPlayer(roomCode: string, playerIdToKick: string): Promise<void> {
  const playerId = await ensurePlayerId();
  await runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error('This room no longer exists.');
    const room = snapshot.data() as LobbyRoom;
    if (room.hostId !== playerId) throw new Error('Only the host can remove a player.');
    if (playerIdToKick === room.hostId || !room.players[playerIdToKick]) {
      throw new Error('That player cannot be removed.');
    }
    transaction.update(reference, { players: Object.fromEntries(
      Object.entries(room.players).filter(([id]) => id !== playerIdToKick)
    ) });
  });
}

export async function leaveRoom(roomCode: string): Promise<void> {
  const playerId = await ensurePlayerId();
  await runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) return;
    const room = snapshot.data() as LobbyRoom;
    if (!room.players[playerId]) return;

    const remainingPlayers = Object.values(room.players).filter((player) => player.id !== playerId);
    if (remainingPlayers.length === 0) {
      transaction.delete(reference);
      return;
    }

    const nextHost = room.hostId === playerId
      ? [...remainingPlayers].sort((a, b) => a.joinedAt - b.joinedAt)[0]
      : undefined;
    transaction.update(reference, {
      players: Object.fromEntries(remainingPlayers.map((player) => [player.id, player])),
      ...(nextHost ? { hostId: nextHost.id } : {})
    });
  });
}

export async function renameRoom(roomCode: string, newRoomCode: string): Promise<void> {
  const playerId = await ensurePlayerId();
  if (!/^[A-Z0-9]{4,6}$/.test(newRoomCode)) {
    throw new Error('Room codes must contain 4–6 letters or numbers.');
  }
  if (roomCode === newRoomCode) return;

  const oldReference = roomRef(roomCode);
  const newReference = roomRef(newRoomCode);
  await runTransaction(db, async (transaction) => {
    const oldSnapshot = await transaction.get(oldReference);
    const newSnapshot = await transaction.get(newReference);
    if (!oldSnapshot.exists()) throw new Error('This room no longer exists.');
    if (newSnapshot.exists()) throw new Error('That room code is already in use.');

    const room = oldSnapshot.data() as LobbyRoom;
    if (room.hostId !== playerId) throw new Error('Only the host can rename the room.');
    transaction.set(newReference, { ...room, roomCode: newRoomCode });
    transaction.delete(oldReference);
  });
}

export async function startRoom(roomCode: string): Promise<void> {
  const playerId = await ensurePlayerId();
  await runTransaction(db, async (transaction) => {
    const reference = roomRef(roomCode);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error('This room no longer exists.');
    const room = snapshot.data() as LobbyRoom;
    if (room.hostId !== playerId) throw new Error('Only the host can start the game.');
    if (Object.keys(room.players).length < 2) throw new Error('At least two players are required to start.');
    transaction.update(reference, { status: 'IN_GAME' });
  });
}

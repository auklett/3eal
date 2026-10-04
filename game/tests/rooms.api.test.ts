import { afterAll, describe, expect, it } from 'vitest';
import { onRequest } from '../functions/api/rooms';

const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const describeWithEmulators = authHost && firestoreHost ? describe : describe.skip;
const projectId = 'demo-3eal-rules';
const createdRooms: string[] = [];

interface EmulatorUser {
  id: string;
  token: string;
}

async function createUser(): Promise<EmulatorUser> {
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true })
  });
  if (!response.ok) throw new Error(`Auth emulator sign-up failed: ${response.status}`);
  const result = await response.json() as { localId: string; idToken: string };
  return { id: result.localId, token: result.idToken };
}

async function send(user: EmulatorUser, body: Record<string, unknown>): Promise<Response> {
  return onRequest({
    request: new Request('http://localhost/api/rooms', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }),
    env: {
      FIREBASE_PROJECT_ID: projectId,
      FIREBASE_AUTH_EMULATOR_HOST: authHost,
      FIRESTORE_EMULATOR_HOST: firestoreHost
    }
  });
}

async function expectSuccess(response: Response): Promise<void> {
  expect(response.status, await response.text()).toBe(200);
}

async function readDocument(path: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${path}`,
    { headers: { Authorization: 'Bearer owner' } }
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore emulator read failed: ${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
}

async function deleteDocument(path: string): Promise<void> {
  const response = await fetch(`http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${path}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer owner' }
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Firestore emulator cleanup failed: ${response.status}`);
  }
}

function randomRoomCode(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (value) => alphabet[value % alphabet.length]).join('');
}

describeWithEmulators('authoritative room API', () => {
  afterAll(async () => {
    for (const roomCode of createdRooms) {
      await Promise.all([
        `rooms/${roomCode}`,
        `rooms/${roomCode}/public/state`,
        `rooms/${roomCode}/private/state`,
        `rooms/${roomCode}/private/meta`,
        `rooms/${roomCode}/private/deck`,
        ...Array.from({ length: 59 }, (_, index) => `rooms/${roomCode}/playerPrivate/seat-${index}`)
      ].map(deleteDocument));
    }
  });

  it('starts games with more than five players, writes split state, and admits spectators without leaking hands', async () => {
    const players = await Promise.all(Array.from({ length: 6 }, createUser));
    const [host] = players;
    const spectator = await createUser();
    const roomCode = randomRoomCode();
    createdRooms.push(roomCode);

    const createResponse = await send(host, { action: 'create', roomCode, name: 'Host' });
    await expectSuccess(createResponse);

    for (const [index, player] of players.slice(1).entries()) {
      await expectSuccess(await send(player, { action: 'join', roomCode, name: `Player ${index + 2}` }));
    }
    const durationResponse = await send(host, { action: 'setTurnDuration', roomCode, turnDurationMs: 45_000 });
    await expectSuccess(durationResponse);
    const startResponse = await send(host, { action: 'start', roomCode });
    await expectSuccess(startResponse);

    const [room, publicState, metadata, deck, seat0, seat5, legacyView] = await Promise.all([
      readDocument(`rooms/${roomCode}`),
      readDocument(`rooms/${roomCode}/public/state`),
      readDocument(`rooms/${roomCode}/private/meta`),
      readDocument(`rooms/${roomCode}/private/deck`),
      readDocument(`rooms/${roomCode}/playerPrivate/seat-0`),
      readDocument(`rooms/${roomCode}/playerPrivate/seat-5`),
      readDocument(`rooms/${roomCode}/views/${host.id}`)
    ]);

    expect(room).not.toBeNull();
    expect(publicState).not.toBeNull();
    expect(metadata).not.toBeNull();
    expect(deck).not.toBeNull();
    expect(seat0).not.toBeNull();
    expect(seat5).not.toBeNull();
    expect(legacyView).toBeNull();

    const publicPlayers = (publicState!.fields as Record<string, { mapValue: { fields: Record<string, unknown> } }>)
      .players.mapValue.fields;
    expect(Object.values(publicPlayers).every((player) =>
      !('hand' in (player as { mapValue: { fields: Record<string, unknown> } }).mapValue.fields)
    )).toBe(true);
    const metadataFields = (metadata!.fields as Record<string, { mapValue?: { fields: Record<string, unknown> } }>);
    const gameFields = metadataFields.game.mapValue!.fields;
    expect(gameFields.turnDurationMs).toMatchObject({ integerValue: '45000' });
    expect(gameFields).not.toHaveProperty('deck');
    expect(((deck!.fields as Record<string, { arrayValue: { values: unknown[] } }>).deck.arrayValue.values)).toHaveLength(200);

    const spectatorResponse = await send(spectator, { action: 'join', roomCode, name: 'Watcher' });
    await expectSuccess(spectatorResponse);
    const updatedPublicState = await readDocument(`rooms/${roomCode}/public/state`);
    const updatedPublicPlayers = (updatedPublicState!.fields as Record<string, { mapValue: { fields: Record<string, unknown> } }>)
      .players.mapValue.fields;
    expect((updatedPublicPlayers[spectator.id] as { mapValue: { fields: Record<string, { stringValue?: string }> } })
      .mapValue.fields.role.stringValue).toBe('SPECTATOR');
  });
});

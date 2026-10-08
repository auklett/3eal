import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const describeWithEmulator = emulatorHost ? describe : describe.skip;

describeWithEmulator('Firestore game-state access rules', () => {
  let environment: RulesTestEnvironment;

  beforeAll(async () => {
    const [host, port] = emulatorHost!.split(':');
    environment = await initializeTestEnvironment({
      projectId: 'demo-3eal-rules',
      firestore: {
        host,
        port: Number(port),
        rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
      }
    });
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'rooms/ABCD'), {
        hostId: 'player-a',
        players: {
          'player-a': { role: 'PLAYER', seatIndex: 0 },
          'player-b': { role: 'PLAYER', seatIndex: 1 },
          spectator: { role: 'SPECTATOR' }
        }
      });
      await setDoc(doc(db, 'rooms/ABCD/public/state'), { deckCount: 10 });
      await setDoc(doc(db, 'rooms/ABCD/playerPrivate/seat-0'), {
        ownerId: 'player-a', seatIndex: 0, player: { hand: ['secret-a'] }
      });
      await setDoc(doc(db, 'rooms/ABCD/playerPrivate/seat-1'), {
        ownerId: 'player-b', seatIndex: 1, player: { hand: ['secret-b'] }
      });
      await setDoc(doc(db, 'rooms/ABCD/private/deck'), { deck: ['secret-deck'] });
      await setDoc(doc(db, 'rooms/ABCD/rejoinRequests/requester'), {
        requesterId: 'requester', name: 'Player 3', expiresAt: Date.now() + 60_000
      });
    });
  });

  afterAll(async () => {
    await environment.cleanup();
  });

  it('allows members and spectators to read only public game state', async () => {
    await assertSucceeds(getDoc(doc(environment.authenticatedContext('player-a').firestore(), 'rooms/ABCD/public/state')));
    await assertSucceeds(getDoc(doc(environment.authenticatedContext('spectator').firestore(), 'rooms/ABCD/public/state')));
    await assertFails(getDoc(doc(environment.authenticatedContext('outsider').firestore(), 'rooms/ABCD/public/state')));
  });

  it('allows a player to read only their assigned private seat', async () => {
    await assertSucceeds(getDoc(doc(environment.authenticatedContext('player-a').firestore(), 'rooms/ABCD/playerPrivate/seat-0')));
    await assertFails(getDoc(doc(environment.authenticatedContext('player-a').firestore(), 'rooms/ABCD/playerPrivate/seat-1')));
    await assertFails(getDoc(doc(environment.authenticatedContext('spectator').firestore(), 'rooms/ABCD/playerPrivate/seat-0')));
    await assertFails(getDoc(doc(environment.authenticatedContext('outsider').firestore(), 'rooms/ABCD/playerPrivate/seat-0')));
  });

  it('keeps deck and server metadata private and all client writes denied', async () => {
    const playerDb = environment.authenticatedContext('player-a').firestore();
    await assertFails(getDoc(doc(playerDb, 'rooms/ABCD/private/deck')));
    await assertFails(setDoc(doc(playerDb, 'rooms/ABCD/public/state'), { deckCount: 0 }));
    await assertFails(setDoc(doc(playerDb, 'rooms/ABCD/playerPrivate/seat-0'), { ownerId: 'player-a' }));
  });

  it('limits rejoin requests to the requester and host', async () => {
    const hostDb = environment.authenticatedContext('player-a').firestore();
    const requesterDb = environment.authenticatedContext('requester').firestore();
    const otherPlayerDb = environment.authenticatedContext('player-b').firestore();
    await assertSucceeds(getDocs(collection(hostDb, 'rooms/ABCD/rejoinRequests')));
    await assertSucceeds(getDoc(doc(requesterDb, 'rooms/ABCD/rejoinRequests/requester')));
    await assertFails(getDoc(doc(otherPlayerDb, 'rooms/ABCD/rejoinRequests/requester')));
    await assertFails(getDocs(collection(otherPlayerDb, 'rooms/ABCD/rejoinRequests')));
  });
});

import type { ActionType, Card, GameState, Player, RoomState } from '../../src/types';
import { drawCard, endTurn, initializeGame, moveCardToHand, moveCardToTable, playAppeal, playCard, resolveAction } from '../../src/logic/gameEngine';

interface Env {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_SERVICE_ACCOUNT?: string;
  FIRESTORE_EMULATOR_HOST?: string;
  FIREBASE_AUTH_EMULATOR_HOST?: string;
}

function normalizedPlayerName(name: string): string {
  return name.trim().toLowerCase();
}

function isPlayerNameTaken(players: Record<string, RoomPlayer>, name: string, exceptId?: string): boolean {
  const key = normalizedPlayerName(name);
  return Object.values(players).some((player) =>
    player.id !== exceptId && normalizedPlayerName(player.name) === key
  );
}

function nextDefaultPlayerName(players: Record<string, RoomPlayer>): string {
  for (let number = 1; ; number++) {
    const name = `Player ${number}`;
    if (!isPlayerNameTaken(players, name)) return name;
  }
}

function uniqueJoinName(players: Record<string, RoomPlayer>, requestedName: string): string {
  if (!isPlayerNameTaken(players, requestedName)) return requestedName;
  if (/^Player\s+\d+$/i.test(requestedName)) return nextDefaultPlayerName(players);
  throw new ApiError('That player name is already in use. Choose a different name.', 409);
}

interface PagesContext {
  request: Request;
  env: Env;
}

interface FirestoreDocument {
  name?: string;
  fields?: Record<string, unknown>;
}

interface PendingView {
  actionType: Exclude<ActionType, 'APPEAL'>;
  sourcePlayerId: string;
  targetPlayerId: string;
  appealWindowEndsAt: number;
}

interface PlayerView extends Omit<Player, 'hand'> {
  hand: Card[];
  handCount: number;
}

interface GameView {
  roomCode: string;
  selfId: string;
  players: Record<string, PlayerView>;
  deckCount: number;
  discardPile: Card[];
  activePlayerId: string;
  turnPhase: GameState['turnPhase'];
  pendingAction?: PendingView;
  winnerId: string | null;
  canAppeal: boolean;
}

interface PrivateState extends RoomState {
  playerOrder: string[];
  targetRefs: Record<string, Record<string, string>>;
}

interface Write {
  update?: { name: string; fields: Record<string, unknown> };
  updateMask?: { fieldPaths: string[] };
  delete?: string;
  currentDocument?: { exists: boolean };
}

class ApiError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const INTERRUPT_WINDOW_MS = 30_000;
const MAX_PLAYERS = 8;
const CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let serviceToken: { value: string; expiresAt: number } | undefined;
let firebaseCertificates: { value: Record<string, string>; expiresAt: number } | undefined;

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

async function readLimitedBody(request: Request, limit: number): Promise<string> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > limit) {
      await reader.cancel();
      throw new ApiError('Request is too large.', 413);
    }
    chunks.push(value);
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function base64UrlBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64Url(value: Uint8Array | string): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function readPem(pem: string): Uint8Array {
  const encoded = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
}

function emulatorBase(value: string): string {
  const host = value.replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host)) {
    throw new ApiError('Emulator endpoints must use loopback addresses.', 503);
  }
  return `http://${host}`;
}

function readDerElement(data: Uint8Array, offset: number): { tag: number; offset: number; start: number; end: number; next: number } {
  const tag = data[offset];
  let length = data[offset + 1];
  let cursor = offset + 2;
  if (length & 0x80) {
    const lengthBytes = length & 0x7f;
    length = 0;
    for (let index = 0; index < lengthBytes; index++) length = length * 256 + data[cursor++];
  }
  return { tag, offset, start: cursor, end: cursor + length, next: cursor + length };
}

async function verifyIdToken(token: string, env: Env): Promise<string> {
  const pieces = token.split('.');
  if (pieces.length !== 3) throw new ApiError('Sign in again to continue.', 401);
  let header: { alg?: string; kid?: string };
  let claims: { aud?: string; iss?: string; sub?: string; exp?: number; iat?: number; auth_time?: number };
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlBytes(pieces[0]))) as typeof header;
    claims = JSON.parse(new TextDecoder().decode(base64UrlBytes(pieces[1]))) as typeof claims;
  } catch {
    throw new ApiError('Invalid sign-in token.', 401);
  }

  const now = Math.floor(Date.now() / 1000);
  const projectId = env.FIREBASE_PROJECT_ID;
  if (!projectId || claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}` ||
      !claims.sub || claims.sub.length > 128 || !claims.exp || claims.exp <= now ||
      !claims.iat || claims.iat > now + 60 || !claims.auth_time || claims.auth_time > now + 60) {
    throw new ApiError('Invalid or expired sign-in token.', 401);
  }

  if (env.FIREBASE_AUTH_EMULATOR_HOST) {
    const lookup = await fetch(`${emulatorBase(env.FIREBASE_AUTH_EMULATOR_HOST)}/identitytoolkit.googleapis.com/v1/accounts:lookup?key=emulator`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    });
    if (!lookup.ok) throw new ApiError('Invalid emulator sign-in token.', 401);
    const result = await lookup.json() as { users?: Array<{ localId?: string }> };
    if (result.users?.[0]?.localId !== claims.sub) throw new ApiError('Invalid emulator sign-in token.', 401);
    return claims.sub;
  }

  if (header.alg !== 'RS256' || !header.kid) throw new ApiError('Invalid sign-in token.', 401);
  if (!firebaseCertificates || firebaseCertificates.expiresAt <= Date.now()) {
    const fetched = await fetch(CERT_URL);
    if (!fetched.ok) throw new ApiError('Unable to verify sign-in right now.', 503);
    const cacheControl = fetched.headers.get('Cache-Control') ?? '';
    const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] ?? 3600);
    firebaseCertificates = {
      value: await fetched.json() as Record<string, string>,
      expiresAt: Date.now() + maxAge * 1000
    };
  }
  const certificate = firebaseCertificates.value[header.kid];
  if (!certificate) throw new ApiError('Invalid sign-in token.', 401);
  const cert = readPem(certificate);
  const certSequence = readDerElement(cert, 0);
  const tbs = readDerElement(cert, certSequence.start);
  let cursor = tbs.start;
  const children: ReturnType<typeof readDerElement>[] = [];
  while (cursor < tbs.end) {
    const child = readDerElement(cert, cursor);
    children.push(child);
    cursor = child.next;
  }
  const spki = children[children[0]?.tag === 0xa0 ? 6 : 5];
  const spkiStart = spki.offset;
  const key = await crypto.subtle.importKey(
    'spki',
    asArrayBuffer(cert.slice(spkiStart, spki.next)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    asArrayBuffer(base64UrlBytes(pieces[2])),
    new TextEncoder().encode(`${pieces[0]}.${pieces[1]}`)
  );
  if (!valid) throw new ApiError('Invalid sign-in token.', 401);
  return claims.sub;
}

function encodeValue(value: unknown): Record<string, unknown> {
  if (value === undefined) return { nullValue: null };
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') {
    const fields = Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, encodeValue(item)]));
    return { mapValue: { fields } };
  }
  throw new ApiError('Unsupported stored value.', 500);
}

function decodeValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') return undefined;
  const entry = value as Record<string, unknown>;
  if ('stringValue' in entry) return entry.stringValue;
  if ('integerValue' in entry) return Number(entry.integerValue);
  if ('doubleValue' in entry) return entry.doubleValue;
  if ('booleanValue' in entry) return entry.booleanValue;
  if ('nullValue' in entry) return null;
  if ('timestampValue' in entry) return Date.parse(String(entry.timestampValue));
  if ('arrayValue' in entry) {
    const values = (entry.arrayValue as { values?: unknown[] }).values ?? [];
    return values.map(decodeValue);
  }
  if ('mapValue' in entry) {
    const fields = (entry.mapValue as { fields?: Record<string, unknown> }).fields ?? {};
    return Object.fromEntries(Object.entries(fields).map(([key, item]) => [key, decodeValue(item)]));
  }
  return undefined;
}

function decodeDocument(document?: FirestoreDocument): Record<string, unknown> | null {
  if (!document?.fields) return null;
  return Object.fromEntries(Object.entries(document.fields).map(([key, value]) => [key, decodeValue(value)]));
}

function docName(projectId: string, path: string): string {
  return `projects/${projectId}/databases/(default)/documents/${path}`;
}

function restBase(env: Env): string {
  if (env.FIRESTORE_EMULATOR_HOST) {
    return `${emulatorBase(env.FIRESTORE_EMULATOR_HOST)}/v1`;
  }
  return `https://firestore.googleapis.com/v1`;
}

async function getServiceToken(env: Env): Promise<string> {
  if (serviceToken && serviceToken.expiresAt > Date.now() + 60_000) return serviceToken.value;
  if (!env.FIREBASE_SERVICE_ACCOUNT) throw new ApiError('Server Firestore credentials are not configured.', 503);
  let account: { client_email: string; private_key: string; token_uri?: string };
  try {
    account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) as typeof account;
  } catch {
    throw new ApiError('Server Firestore credentials are invalid.', 503);
  }
  if (!account.client_email || !account.private_key) throw new ApiError('Server Firestore credentials are invalid.', 503);
  const now = Math.floor(Date.now() / 1000);
  const assertionHeader = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const assertionClaims = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: account.token_uri ?? 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${assertionHeader}.${assertionClaims}`;
  const pem = readPem(account.private_key);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    asArrayBuffer(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const grant = await fetch(account.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${base64Url(new Uint8Array(signature))}`
    })
  });
  if (!grant.ok) throw new ApiError('Unable to authorize server Firestore access.', 503);
  const result = await grant.json() as { access_token?: string; expires_in?: number };
  if (!result.access_token) throw new ApiError('Unable to authorize server Firestore access.', 503);
  serviceToken = { value: result.access_token, expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000 };
  return serviceToken.value;
}

async function firestoreRequest(
  env: Env,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = env.FIRESTORE_EMULATOR_HOST ? 'owner' : await getServiceToken(env);
  return fetch(`${restBase(env)}/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
}

async function transact<T>(
  env: Env,
  paths: string[],
  operation: (documents: Array<Record<string, unknown> | null>) => { writes: Write[]; result: T }
): Promise<T> {
  const names = paths.map((path) => docName(env.FIREBASE_PROJECT_ID, path));
  for (let attempt = 0; attempt < 3; attempt++) {
    const begin = await firestoreRequest(env, ':beginTransaction', {
      method: 'POST',
      body: JSON.stringify({ options: { readWrite: {} } })
    });
    if (!begin.ok) throw new ApiError('Could not start a Firestore transaction.', 503);
    const { transaction } = await begin.json() as { transaction: string };
    let finished = false;
    const rollback = async () => {
      if (finished) return;
      finished = true;
      try {
        await firestoreRequest(env, ':rollback', { method: 'POST', body: JSON.stringify({ transaction }) });
      } catch {
        // Preserve the original transaction error.
      }
    };
    try {
      const batch = await firestoreRequest(env, ':batchGet', {
        method: 'POST',
        body: JSON.stringify({ documents: names, transaction })
      });
      if (!batch.ok) throw new ApiError('Could not read room state.', 503);
      const responseText = await batch.text();
      let snapshots: Array<{ found?: FirestoreDocument; missing?: string | { name?: string } }>;
      try {
        const parsed: unknown = JSON.parse(responseText);
        snapshots = Array.isArray(parsed) ? parsed as typeof snapshots : [parsed as typeof snapshots[number]];
      } catch {
        snapshots = responseText.trim().split('\n').filter(Boolean).map((line) =>
          JSON.parse(line) as typeof snapshots[number]
        );
      }
      const byName = new Map(snapshots.map((snapshot) => [
        snapshot.found?.name ?? (typeof snapshot.missing === 'string' ? snapshot.missing : snapshot.missing?.name) ?? '',
        snapshot.found ? decodeDocument(snapshot.found) : null
      ]));
      const { writes, result } = operation(names.map((name) => byName.get(name) ?? null));
      if (writes.length === 0) {
        await rollback();
        return result;
      }
      const commit = await firestoreRequest(env, ':commit', {
        method: 'POST',
        body: JSON.stringify({
          transaction,
          writes: writes.map((write) => ({
            ...write,
            ...(write.update ? { update: { name: write.update.name, fields: Object.fromEntries(
              Object.entries(write.update.fields)
                .filter(([, value]) => value !== undefined)
                .map(([key, value]) => [key, encodeValue(value)])
            ) } } : {})
          }))
        })
      });
      if (commit.ok) {
        finished = true;
        return result;
      }
      const errorText = await commit.text();
      await rollback();
      if ((commit.status === 409 || commit.status === 400) && /ABORTED|transaction/i.test(errorText) && attempt < 2) continue;
      throw new ApiError(commit.status === 409 ? 'The room changed. Please try again.' : 'Could not save room state.', commit.status === 409 ? 409 : 503);
    } catch (error) {
      await rollback();
      throw error;
    }
  }
  throw new ApiError('The room changed repeatedly. Please try again.', 409);
}

function roomPath(code: string): string {
  return `rooms/${code}`;
}

function privatePath(code: string): string {
  return `rooms/${code}/private/state`;
}

function viewPath(code: string, id: string): string {
  return `rooms/${code}/views/${id}`;
}

function idPath(projectId: string, path: string): string {
  return `projects/${projectId}/databases/(default)/documents/${path}`;
}

function setWrite(env: Env, path: string, fields: Record<string, unknown>, mask?: string[]): Write {
  return {
    update: { name: idPath(env.FIREBASE_PROJECT_ID, path), fields },
    ...(mask ? { updateMask: { fieldPaths: mask } } : {})
  };
}

function deleteWrite(env: Env, path: string): Write {
  return { delete: idPath(env.FIREBASE_PROJECT_ID, path) };
}

function validRoomCode(code: unknown): code is string {
  return typeof code === 'string' && /^[A-Z0-9]{4,6}$/.test(code);
}

function cleanName(value: unknown): string {
  if (typeof value !== 'string') throw new ApiError('Enter a player name first.');
  const name = value.trim().slice(0, 24);
  if (!name) throw new ApiError('Enter a player name first.');
  return name;
}

function newRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function membership(room: Record<string, unknown> | null, id: string): asserts room is Record<string, unknown> {
  if (!room) throw new ApiError('That room code was not found.', 404);
  const players = room.players as Record<string, RoomPlayer> | undefined;
  if (!players?.[id]) throw new ApiError('You are not a member of this room.', 403);
}

interface RoomPlayer {
  id: string;
  name: string;
  joinedAt: number;
}

function playerRecords(room: Record<string, unknown>): Record<string, RoomPlayer> {
  return room.players as Record<string, RoomPlayer>;
}

function createState(roomCode: string, room: Record<string, unknown>): PrivateState {
  const members = Object.values(playerRecords(room)).sort((a, b) => a.joinedAt - b.joinedAt);
  if (members.length < 2) throw new ApiError('At least two players are required to start.');
  if (members.length > MAX_PLAYERS) throw new ApiError(`Games support at most ${MAX_PLAYERS} players.`);
  const players: Record<string, Player> = Object.fromEntries(members.map((member) => [
    member.id,
    {
      id: member.id,
      name: member.name,
      isHost: member.id === room.hostId,
      table: [],
      hand: [],
      sets: []
    }
  ]));
  const game = initializeGame(Object.values(players));
  return { roomCode, status: 'IN_GAME', hostId: String(room.hostId), players, game, playerOrder: members.map((player) => player.id), targetRefs: {} };
}

function projectView(state: PrivateState, selfId: string): GameView {
  const targetRefs: Record<string, string> = {};
  const players: Record<string, PlayerView> = {};
  for (const player of Object.values(state.players)) {
    const cardViewIds = new Map<string, string>();
    const table = player.table.map((card) => {
      const publiclyRevealedForWinner = state.game?.winnerId === player.id;
      if (player.id === selfId || publiclyRevealedForWinner || card.isRevealed) {
        cardViewIds.set(card.id, card.id);
        return { ...card };
      }
      const ref = crypto.randomUUID();
      targetRefs[ref] = card.id;
      cardViewIds.set(card.id, ref);
      return { id: ref, category: 'NORMAL', isRevealed: false } as Card;
    });
    const isSelf = player.id === selfId;
    players[player.id] = {
      id: player.id,
      name: player.name,
      isHost: player.isHost,
      table,
      hand: isSelf ? player.hand.map((card) => ({ ...card })) : [],
      handCount: player.hand.length,
      sets: isSelf || state.game?.winnerId === player.id
        ? player.sets.map((set) => ({ cards: set.cards.map((card) => ({ ...card })) }))
        : []
    };
  }
  state.targetRefs[selfId] = targetRefs;
  const pending = state.game?.pendingAction;
  const eligible = Boolean(pending && appealEligible(selfId, pending, state.players));
  return {
    roomCode: state.roomCode,
    selfId,
    players,
    deckCount: state.game?.deck.length ?? 0,
    discardPile: state.game?.discardPile.map((card) => ({ ...card })) ?? [],
    activePlayerId: state.game?.activePlayerId ?? '',
    turnNumber: state.game?.turnNumber ?? 0,
    turnPhase: state.game?.turnPhase ?? 'DRAW',
    pendingAction: pending ? {
      actionType: pending.actionType,
      sourcePlayerId: pending.sourcePlayerId,
      targetPlayerId: pending.targetPlayerId,
      appealWindowEndsAt: pending.appealWindowEndsAt
    } : undefined,
    winnerId: state.game?.winnerId ?? null,
    canAppeal: eligible
  };
}

function appealEligible(
  id: string,
  pending: NonNullable<GameState['pendingAction']>,
  players: Record<string, Player>
): boolean {
  const eligible = pending.actionType === 'CONCEAL'
    ? Object.values(players).filter((player) => player.id !== pending.sourcePlayerId)
    : [players[pending.targetPlayerId]].filter((player): player is Player => Boolean(player));
  return eligible.some((player) => player.id === id && player.hand.some((card) => card.actionType === 'APPEAL'));
}

function viewWrites(env: Env, state: PrivateState): Write[] {
  return Object.keys(state.players).map((id) => {
    const view = projectView(state, id);
    return setWrite(env, viewPath(state.roomCode, id), { ...view, updatedAt: new Date().toISOString() });
  });
}

function stateWrites(env: Env, state: PrivateState): Write[] {
  return [setWrite(env, privatePath(state.roomCode), { ...state }), ...viewWrites(env, state)];
}

function assertActive(state: PrivateState, actorId: string, phase: GameState['turnPhase']): Player {
  if (!state.game) throw new ApiError('The game has not started.', 409);
  if (state.game.winnerId) throw new ApiError('This game has ended.', 409);
  if (state.game.activePlayerId !== actorId) throw new ApiError('It is not your turn.', 403);
  if (state.game.turnPhase !== phase) throw new ApiError(`This action is not available during ${state.game.turnPhase}.`, 409);
  return state.players[actorId];
}

function resolveExpired(state: PrivateState, now: number): boolean {
  const pending = state.game?.pendingAction;
  if (!state.game || !pending || now < pending.appealWindowEndsAt) return false;
  resolveAction(state.game, state.players);
  return true;
}

function resolveOpaqueTarget(state: PrivateState, actorId: string, supplied: unknown): string {
  if (typeof supplied !== 'string') throw new ApiError('Choose a target card.');
  const knownPlayerCards = Object.values(state.players).flatMap((player) => player.table);
  if (knownPlayerCards.some((card) => card.id === supplied)) return supplied;
  const cardId = state.targetRefs[actorId]?.[supplied];
  if (!cardId) throw new ApiError('That card is no longer available. Refresh and try again.', 409);
  return cardId;
}

async function mutateGame(env: Env, code: string, actorId: string, body: Record<string, unknown>): Promise<void> {
  const expiredOnly = await transact(env, [roomPath(code), privatePath(code)], ([room, rawState]) => {
    membership(room, actorId);
    if (room.status !== 'IN_GAME' || !rawState) throw new ApiError('This game is not active.', 409);
    const state = rawState as unknown as PrivateState;
    const game = state.game;
    if (!game) throw new ApiError('This game is not active.', 409);
    const now = Date.now();
    const expired = resolveExpired(state, now);
    const action = body.action;

    if (action === 'resolve') {
      if (!game.pendingAction) return { writes: [], result: false };
      if (!expired) throw new ApiError('The interrupt window is still open.', 409);
    } else if (expired) {
      return { writes: stateWrites(env, state), result: true };
    } else if (action === 'draw') {
      const player = assertActive(state, actorId, 'DRAW');
      drawCard(game, player);
    } else if (action === 'moveToTable') {
      const player = assertActive(state, actorId, 'MAIN');
      if (typeof body.cardId !== 'string') throw new ApiError('Choose a Normal or TEAL card from your Hand.');
      const replaceCardId = body.replaceCardId;
      if (replaceCardId !== undefined && typeof replaceCardId !== 'string') {
        throw new ApiError('Choose a valid Table card to swap.');
      }
      moveCardToTable(game, player, body.cardId, replaceCardId);
    } else if (action === 'moveToHand') {
      const player = assertActive(state, actorId, 'MAIN');
      if (typeof body.cardId !== 'string') throw new ApiError('Choose a card from your Table.');
      moveCardToHand(game, player, body.cardId);
    } else if (action === 'discard') {
      const player = assertActive(state, actorId, 'MAIN');
      const cardId = body.cardId;
      if (typeof cardId !== 'string' || !player.table.some((card) => card.id === cardId)) {
        throw new ApiError('That card is not on your Table.');
      }
      playCard(game, player, cardId, undefined, undefined, state.players);
    } else if (action === 'play') {
      const player = assertActive(state, actorId, 'MAIN');
      const cardId = body.cardId;
      if (typeof cardId !== 'string') throw new ApiError('Choose an Action card.');
      const card = player.hand.find((handCard) => handCard.id === cardId);
      if (!card || card.category !== 'ACTION' || !card.actionType || card.actionType === 'APPEAL') {
        throw new ApiError('That Action card is not in your Hand.');
      }
      const targetPlayerId = body.targetPlayerId;
      if (typeof targetPlayerId !== 'string' || !state.players[targetPlayerId]) throw new ApiError('Choose a target player.');
      const targetCardId = resolveOpaqueTarget(state, actorId, body.targetCardId);
      const target = state.players[targetPlayerId];
      const targetCard = target.table.find((tableCard) => tableCard.id === targetCardId);
      if (!targetCard) throw new ApiError('That card is no longer on the target Table.', 409);
      if (card.actionType === 'STEAL' && targetCard.category === 'ACTION') {
        throw new ApiError('STEAL can only target a Normal or TEAL card.');
      }
      playCard(game, player, cardId, targetPlayerId, targetCardId, state.players);
      if (game.pendingAction) {
        game.pendingAction.appealWindowEndsAt = now + INTERRUPT_WINDOW_MS;
        if (!Object.values(state.players).some((eligible) => appealEligible(eligible.id, game.pendingAction!, state.players))) {
          resolveAction(game, state.players);
        }
      }
    } else if (action === 'appeal') {
      const pending = game.pendingAction;
      if (game.turnPhase !== 'INTERRUPT' || !pending || now >= pending.appealWindowEndsAt) {
        throw new ApiError('The interrupt window has ended.', 409);
      }
      const player = state.players[actorId];
      const appealCardId = body.cardId;
      if (typeof appealCardId !== 'string' || !appealEligible(actorId, pending, state.players)) {
        throw new ApiError('You are not eligible to appeal this action.');
      }
      playAppeal(game, player, appealCardId, state.players);
    } else if (action === 'endTurn') {
      const player = assertActive(state, actorId, 'MAIN');
      if (player.table.length > 9) throw new ApiError('Discard Table cards until you have no more than 9.');
      const result = endTurn(game, player);
      if (result.winnerId) {
        room.status = 'FINISHED';
      } else {
        const index = state.playerOrder.indexOf(actorId);
        game.activePlayerId = state.playerOrder[(index + 1) % state.playerOrder.length];
        game.turnNumber = (game.turnNumber ?? 0) + 1;
        game.turnPhase = 'DRAW';
      }
    } else {
      throw new ApiError('Unknown game action.');
    }

    const writes: Write[] = [
      setWrite(env, roomPath(code), { status: room.status }, ['status']),
      ...stateWrites(env, state)
    ];
    return { writes, result: false };
  });
  if (expiredOnly) throw new ApiError('The interrupt expired. The action was resolved; retry your move.', 409);
}

async function route(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);
  const length = Number(request.headers.get('Content-Length') ?? 0);
  if (length > 8_192) return response({ error: 'Request is too large.' }, 413);
  const authorization = request.headers.get('Authorization') ?? '';
  const tokenMatch = authorization.match(/^Bearer (.+)$/);
  if (!tokenMatch) throw new ApiError('Sign in to continue.', 401);
  const actorId = await verifyIdToken(tokenMatch[1], env);
  let body: Record<string, unknown>;
  const text = await readLimitedBody(request, 8_192);
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ApiError('Invalid request body.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError('Invalid request body.');

  if (body.action === 'create') {
    const name = cleanName(body.name);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newRoomCode();
      const created = await transact(env, [roomPath(code)], ([existing]) => {
        if (existing) return { writes: [], result: false };
        const player = { id: actorId, name, joinedAt: Date.now() };
        return {
          writes: [{
            ...setWrite(env, roomPath(code), {
              roomCode: code,
              status: 'LOBBY',
              hostId: actorId,
              players: { [actorId]: player },
              createdAt: new Date().toISOString()
            }),
            currentDocument: { exists: false }
          }],
          result: true
        };
      });
      if (created) return response({ roomCode: code });
    }
    throw new ApiError('Could not create a unique room code. Please try again.', 503);
  }

  const roomCode = body.roomCode;
  if (!validRoomCode(roomCode)) throw new ApiError('Invalid room code.');
  const code = roomCode;

  if (body.action === 'checkMembership') {
    const isMember = await transact(env, [roomPath(code)], ([room]) => ({
      writes: [],
      result: Boolean(room && (room.players as Record<string, RoomPlayer> | undefined)?.[actorId])
    }));
    return response({ member: isMember });
  }

  if (body.action === 'join') {
    const requestedName = cleanName(body.name);
    await transact(env, [roomPath(code)], ([room]) => {
      if (!room) throw new ApiError('That room code was not found.', 404);
      const players = playerRecords(room);
      if (players[actorId]) return { writes: [], result: undefined };
      if (room.status !== 'LOBBY') throw new ApiError('This game has already started.', 409);
      if (Object.keys(players).length >= MAX_PLAYERS) throw new ApiError(`Rooms support at most ${MAX_PLAYERS} players.`);
      const name = uniqueJoinName(players, requestedName);
      return {
        writes: [setWrite(env, roomPath(code), {
          players: { ...players, [actorId]: { id: actorId, name, joinedAt: Date.now() } }
        }, ['players'])],
        result: undefined
      };
    });
    return response({ ok: true });
  }

  if (body.action === 'renameRoom') {
    const newCode = body.newRoomCode;
    if (!validRoomCode(newCode)) throw new ApiError('Room codes must contain 4–6 letters or numbers.');
    if (newCode === code) return response({ ok: true });
    const renamed = await transact(env, [roomPath(code), roomPath(newCode)], ([room, destination]) => {
      membership(room, actorId);
      if (room.hostId !== actorId) throw new ApiError('Only the host can rename the room.', 403);
      if (room.status !== 'LOBBY') throw new ApiError('Rooms can only be renamed before the game starts.', 409);
      if (destination) throw new ApiError('That room code is already in use.', 409);
      const next = { ...room, roomCode: newCode };
      return {
        writes: [
          { ...setWrite(env, roomPath(newCode), next), currentDocument: { exists: false } },
          deleteWrite(env, roomPath(code))
        ],
        result: undefined
      };
    });
    void renamed;
    return response({ ok: true, roomCode: newCode });
  }

  if (body.action === 'start') {
    await transact(env, [roomPath(code), privatePath(code)], ([room, privateData]) => {
      membership(room, actorId);
      if (room.hostId !== actorId) throw new ApiError('Only the host can start the game.', 403);
      if (room.status !== 'LOBBY') throw new ApiError('This game has already started.', 409);
      if (privateData) throw new ApiError('Game state already exists.', 409);
      const state = createState(code, room);
      return {
        writes: [setWrite(env, roomPath(code), { status: 'IN_GAME' }, ['status']), ...stateWrites(env, state)],
        result: undefined
      };
    });
    return response({ ok: true });
  }

  if (body.action === 'renamePlayer' || body.action === 'kick' || body.action === 'leave') {
    const isRemoval = body.action === 'kick' || body.action === 'leave';
    await transact(env, isRemoval ? [roomPath(code), privatePath(code)] : [roomPath(code)], ([room, privateData]) => {
      membership(room, actorId);
      const players = playerRecords(room);
      if ((room.status === 'IN_GAME' || room.status === 'FINISHED') && isRemoval) {
        const state = privateData as unknown as PrivateState | null;
        if (!state?.game) throw new ApiError('The active game state is unavailable.', 409);
        let targetId = actorId;
        if (body.action === 'kick') {
          targetId = typeof body.playerId === 'string' ? body.playerId : '';
          if (room.hostId !== actorId) throw new ApiError('Only the host can remove a player.', 403);
          if (!targetId || targetId === actorId || !players[targetId]) {
            throw new ApiError('That player cannot be removed.');
          }
        }

        const removed = state.players[targetId];
        const playerOrderIndex = state.playerOrder.indexOf(targetId);
        if (!removed || playerOrderIndex < 0) throw new ApiError('That player is not part of the active game.', 409);
        state.game.discardPile.push(...removed.table, ...removed.hand);
        const pending = state.game.pendingAction;
        if (pending && (pending.sourcePlayerId === targetId || pending.targetPlayerId === targetId)) {
          state.game.discardPile.push(pending.actionCard);
          state.game.pendingAction = undefined;
          state.game.turnPhase = 'MAIN';
        }

        const previousActivePlayerId = state.game.activePlayerId;
        delete state.players[targetId];
        delete state.targetRefs[targetId];
        state.playerOrder = state.playerOrder.filter((id) => id !== targetId);
        const remaining = Object.fromEntries(Object.entries(players).filter(([id]) => id !== targetId));
        if (state.playerOrder.length === 0) {
          return {
            writes: [
              deleteWrite(env, roomPath(code)),
              deleteWrite(env, privatePath(code)),
              ...Object.keys(players).map((id) => deleteWrite(env, viewPath(code, id)))
            ],
            result: undefined
          };
        }

        const nextHost = room.hostId === targetId
          ? Object.values(remaining).sort((a, b) => a.joinedAt - b.joinedAt)[0].id
          : room.hostId;
        for (const player of Object.values(state.players)) {
          player.isHost = player.id === nextHost;
        }
        if (room.status === 'IN_GAME' && previousActivePlayerId === targetId) {
          state.game.activePlayerId = state.playerOrder[Math.min(playerOrderIndex, state.playerOrder.length - 1)];
          if (!state.game.winnerId) state.game.turnPhase = 'DRAW';
        }
        return {
          writes: [
            setWrite(env, roomPath(code), { players: remaining, hostId: nextHost }, ['players', 'hostId']),
            ...stateWrites(env, state),
            deleteWrite(env, viewPath(code, targetId))
          ],
          result: undefined
        };
      }
      if (room.status !== 'LOBBY') throw new ApiError('Lobby changes are disabled after the game starts.', 409);
      if (body.action === 'renamePlayer') {
        const name = cleanName(body.name);
        if (isPlayerNameTaken(players, name, actorId)) {
          throw new ApiError('That player name is already in use. Choose a different name.', 409);
        }
        return {
          writes: [setWrite(env, roomPath(code), {
            players: { ...players, [actorId]: { ...players[actorId], name } }
          }, ['players'])],
          result: undefined
        };
      }
      if (body.action === 'kick') {
        const targetId = body.playerId;
        if (room.hostId !== actorId) throw new ApiError('Only the host can remove a player.', 403);
        if (typeof targetId !== 'string' || targetId === actorId || !players[targetId]) {
          throw new ApiError('That player cannot be removed.');
        }
        const remaining = Object.fromEntries(Object.entries(players).filter(([id]) => id !== targetId));
        return { writes: [setWrite(env, roomPath(code), { players: remaining }, ['players'])], result: undefined };
      }
      const remaining = Object.fromEntries(Object.entries(players).filter(([id]) => id !== actorId));
      if (Object.keys(remaining).length === 0) {
        return { writes: [deleteWrite(env, roomPath(code))], result: undefined };
      }
      const nextHost = room.hostId === actorId
        ? Object.values(remaining).sort((a, b) => a.joinedAt - b.joinedAt)[0].id
        : room.hostId;
      return {
        writes: [setWrite(env, roomPath(code), { players: remaining, hostId: nextHost }, ['players', 'hostId'])],
        result: undefined
      };
    });
    return response({ ok: true });
  }

  if (['draw', 'play', 'appeal', 'discard', 'moveToTable', 'moveToHand', 'endTurn', 'resolve'].includes(String(body.action))) {
    await mutateGame(env, code, actorId, body);
    return response({ ok: true });
  }

  throw new ApiError('Unknown room action.');
}

export const onRequest: PagesFunction<Env> = async ({ request, env }: PagesContext) => {
  try {
    return await route(request, env);
  } catch (error) {
    if (error instanceof ApiError) return response({ error: error.message }, error.status);
    return response({ error: 'The request could not be completed.' }, 500);
  }
};

type PagesFunction<E> = (context: PagesContext & { env: E }) => Promise<Response>;

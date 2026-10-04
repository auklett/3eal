import type { ActionType, Card, GameState, Player, RoomState } from '../../src/types';
import { GAME_CONFIG, MAX_STARTABLE_PLAYERS } from '../../src/logic/config';
import { drawCard, endTurn, getInterruptDurationMs, initializeGame, moveCardToHand, moveCardToTable, playAppeal, playCard, recycleCardsToDeck, resolveAction, skipTurn } from '../../src/logic/gameEngine';

interface Env {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_SERVICE_ACCOUNT?: string;
  FIRESTORE_EMULATOR_HOST?: string;
  FIREBASE_AUTH_EMULATOR_HOST?: string;
}

function normalizedPlayerName(name: string): string {
  const confusables: Record<string, string> = {
    а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', і: 'i', ј: 'j',
    к: 'k', м: 'm', т: 't', в: 'b', н: 'h', ѕ: 's', ԁ: 'd', ԛ: 'q',
    Α: 'a', Β: 'b', Ε: 'e', Ζ: 'z', Η: 'h', Ι: 'i', Κ: 'k', Μ: 'm',
    Ν: 'n', Ο: 'o', Ρ: 'p', Τ: 't', Υ: 'y', Χ: 'x',
    ο: 'o', ρ: 'p', τ: 't', υ: 'y', χ: 'x', ι: 'i', κ: 'k', ν: 'v'
  };
  return name.normalize('NFKC').trim().toLowerCase()
    .replace(/[аерсхуіјкмтвнѕԁԛΑΒΕΖΗΙΚΜΝΟΡΤΥΧορηυχικν]/gu, (character) => confusables[character] ?? character)
    .replace(/ß/g, 'ss')
    .replace(/ς/g, 'σ');
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
  updateTime?: string;
}

interface PendingView {
  actionType: Exclude<ActionType, 'APPEAL'>;
  sourcePlayerId: string;
  targetPlayerId: string;
  resolveAt: number;
}

interface PublicPlayerView {
  id: string;
  name: string;
  isHost: boolean;
  handCount?: number;
  role: 'PLAYER' | 'SPECTATOR';
  table: Card[];
  seatIndex?: number;
  privateVersion?: number;
  isOnline: boolean;
}

interface PublicGameView {
  roomCode: string;
  players: Record<string, PublicPlayerView>;
  deckCount: number;
  activePlayerId: string;
  turnNumber: number;
  turnPhase: GameState['turnPhase'];
  turnEndsAt?: number;
  pendingAction?: PendingView;
  winnerId: string | null;
  version: number;
}

interface PrivateState extends RoomState {
  playerOrder: string[];
  targetRefs: Record<string, Record<string, string>>;
  lastSeenAt?: Record<string, number>;
  seatByPlayerId: Record<string, number>;
  privateVersions: Record<string, number>;
  spectators: RoomPlayer[];
  privateStateMigrationPending?: boolean;
  migrationRoomPlayers?: Record<string, RoomPlayer>;
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

const PLAYER_OFFLINE_AFTER_MS = GAME_CONFIG.awayAfterMs;
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
  const readPaths = [...new Set(paths.flatMap((path) =>
    path.endsWith('/private/state') ? privateStatePaths(path.split('/')[1] ?? '') : [path]
  ))];
  const names = readPaths.map((path) => docName(env.FIREBASE_PROJECT_ID, path));
  for (let attempt = 0; attempt < 2; attempt++) {
    const read = await firestoreRequest(env, ':batchGet', {
      method: 'POST',
      body: JSON.stringify({ documents: names })
    });
    if (!read.ok) throw new ApiError('Could not read room state.', 503);
    const responseText = await read.text();
    let snapshots: Array<{ found?: FirestoreDocument; missing?: string | { name?: string } }>;
    try {
      const parsed: unknown = JSON.parse(responseText);
      snapshots = Array.isArray(parsed) ? parsed as typeof snapshots : [parsed as typeof snapshots[number]];
    } catch {
      snapshots = responseText.trim().split('\n').filter(Boolean).map((line) =>
        JSON.parse(line) as typeof snapshots[number]
      );
    }
    const documents = new Map(snapshots.map((snapshot) => {
      const name = snapshot.found?.name ??
        (typeof snapshot.missing === 'string' ? snapshot.missing : snapshot.missing?.name) ?? '';
      return [name, {
        data: snapshot.found ? decodeDocument(snapshot.found) : null,
        updateTime: snapshot.found?.updateTime
      }];
    }));
    const byPath = new Map(readPaths.map((path) => [
      path,
      documents.get(docName(env.FIREBASE_PROJECT_ID, path)) ?? { data: null, updateTime: undefined }
    ]));
    const roomCode = paths.find((path) => path.startsWith('rooms/'))?.split('/')[1] ?? '';
    const values = paths.map((path) => path.endsWith('/private/state')
      ? assemblePrivateState(roomCode, byPath)
      : byPath.get(path)?.data ?? null
    );
    const { writes, result } = operation(values);
    if (writes.length === 0) return result;

    const commitWrites = collapseWrites(writes).flatMap((write) => {
      const path = write.update?.name
        ? readPaths.find((candidate) => docName(env.FIREBASE_PROJECT_ID, candidate) === write.update?.name)
        : write.delete
          ? readPaths.find((candidate) => docName(env.FIREBASE_PROJECT_ID, candidate) === write.delete)
          : undefined;
      const snapshot = path ? byPath.get(path) : undefined;
      if (write.delete && !snapshot?.data) return [];
      const currentDocument = write.currentDocument ?? (snapshot?.updateTime
        ? { updateTime: snapshot.updateTime }
        : { exists: false });
      return [{
        ...write,
        currentDocument,
        ...(write.update ? { update: { name: write.update.name, fields: Object.fromEntries(
          Object.entries(write.update.fields)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, encodeValue(value)])
        ) } } : {})
      }];
    });
    if (commitWrites.length === 0) return result;
    const commit = await firestoreRequest(env, ':commit', {
      method: 'POST',
      body: JSON.stringify({ writes: commitWrites })
    });
    if (commit.ok) return result;
    const errorText = await commit.text();
    if (attempt === 0 && (commit.status === 409 || commit.status === 400) && /ABORTED|FAILED_PRECONDITION|updateTime|precondition/i.test(errorText)) {
      continue;
    }
    throw new ApiError(commit.status === 409 || commit.status === 400
      ? 'The room changed. Please try again.'
      : 'Could not save room state.', commit.status === 409 || commit.status === 400 ? 409 : 503);
  }
  throw new ApiError('The room changed repeatedly. Please try again.', 409);
}

function roomPath(code: string): string {
  return `rooms/${code}`;
}

function privatePath(code: string): string {
  return `rooms/${code}/private/state`;
}

function publicPath(code: string): string {
  return `rooms/${code}/public/state`;
}

function metaPath(code: string): string {
  return `rooms/${code}/private/meta`;
}

function deckPath(code: string): string {
  return `rooms/${code}/private/deck`;
}

function seatPath(code: string, seatIndex: number): string {
  return `rooms/${code}/playerPrivate/seat-${seatIndex}`;
}

function rejoinPath(code: string, playerId: string): string {
  return `rooms/${code}/rejoinRequests/${playerId}`;
}

function privateStatePaths(code: string): string[] {
  return [
    publicPath(code),
    metaPath(code),
    deckPath(code),
    privatePath(code),
    ...Array.from({ length: MAX_STARTABLE_PLAYERS }, (_, index) => seatPath(code, index))
  ];
}

function idPath(projectId: string, path: string): string {
  return `projects/${projectId}/databases/(default)/documents/${path}`;
}

function collapseWrites(writes: Write[]): Write[] {
  const byDocument = new Map<string, Write>();
  for (const write of writes) {
    const name = write.update?.name ?? write.delete;
    if (!name) continue;
    const previous = byDocument.get(name);
    if (!previous || !previous.update || !write.update) {
      byDocument.set(name, write);
      continue;
    }
    const previousMask = previous.updateMask?.fieldPaths ?? Object.keys(previous.update.fields);
    const nextMask = write.updateMask?.fieldPaths ?? Object.keys(write.update.fields);
    byDocument.set(name, {
      ...previous,
      ...write,
      update: {
        name,
        fields: { ...previous.update.fields, ...write.update.fields }
      },
      updateMask: { fieldPaths: [...new Set([...previousMask, ...nextMask])] },
      currentDocument: previous.currentDocument ?? write.currentDocument
    });
  }
  return [...byDocument.values()];
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

function createRoomWrite(env: Env, code: string, actorId: string, name: string): Write {
  return {
    ...setWrite(env, roomPath(code), {
      roomCode: code,
      status: 'LOBBY',
      hostId: actorId,
      players: { [actorId]: { id: actorId, name, joinedAt: Date.now(), role: 'PLAYER' } },
      createdAt: new Date().toISOString()
    }),
    currentDocument: { exists: false }
  };
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
  role?: 'PLAYER' | 'SPECTATOR';
  seatIndex?: number;
}

function playerRecords(room: Record<string, unknown>): Record<string, RoomPlayer> {
  return room.players as Record<string, RoomPlayer>;
}

function createState(roomCode: string, room: Record<string, unknown>): PrivateState {
  const allMembers = Object.values(playerRecords(room)).sort((a, b) => a.joinedAt - b.joinedAt);
  const members = allMembers.filter((member) => (member.role ?? 'PLAYER') === 'PLAYER');
  if (members.length < GAME_CONFIG.minPlayers) throw new ApiError(`At least ${GAME_CONFIG.minPlayers} players are required to start.`);
  if (members.length > MAX_STARTABLE_PLAYERS) {
    throw new ApiError(`The deck can deal starting cards to at most ${MAX_STARTABLE_PLAYERS} players.`);
  }
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
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const configuredDuration = room.turnDurationMs;
  const turnDurationMs = typeof configuredDuration === 'number' &&
    GAME_CONFIG.turnDurationOptionsMs.some((option) => option === configuredDuration)
    ? configuredDuration
    : GAME_CONFIG.defaultTurnDurationMs;
  const game = initializeGame(Object.values(players), seed, turnDurationMs);
  const now = Date.now();
  const seatByPlayerId = Object.fromEntries(members.map((member, index) => [member.id, index]));
  members.forEach((member, index) => { member.seatIndex = index; });
  allMembers.filter((member) => !members.includes(member)).forEach((member) => { delete member.seatIndex; });
  return {
    roomCode,
    status: 'IN_GAME',
    hostId: String(room.hostId),
    players,
    game,
    playerOrder: members.map((player) => player.id),
    targetRefs: {},
    lastSeenAt: Object.fromEntries(allMembers.map((player) => [player.id, now])),
    seatByPlayerId,
    privateVersions: Object.fromEntries(members.map((member) => [member.id, 0])),
    spectators: allMembers.filter((member) => (member.role ?? 'PLAYER') === 'SPECTATOR')
  };
}

function assemblePrivateState(
  roomCode: string,
  documents: Map<string, { data: Record<string, unknown> | null; updateTime?: string }>
): Record<string, unknown> | null {
  const legacyState = documents.get(privatePath(roomCode))?.data;
  const metadata = documents.get(metaPath(roomCode))?.data;
  if (!metadata) {
    if (!legacyState) return null;
    const oldState = legacyState as unknown as PrivateState;
    const players = oldState.players ?? {};
    const playerOrder = oldState.playerOrder ?? Object.keys(players);
    const seatByPlayerId = oldState.seatByPlayerId ?? Object.fromEntries(playerOrder.map((id, index) => [id, index]));
    const roomData = documents.get(roomPath(roomCode))?.data;
    const roomPlayers = roomData?.players as Record<string, RoomPlayer> | undefined;
    const migrationRoomPlayers = roomPlayers
      ? Object.fromEntries(Object.entries(roomPlayers).map(([id, member]) => [id, { ...member }]))
      : undefined;
    for (const [id, seatIndex] of Object.entries(seatByPlayerId)) {
      if (migrationRoomPlayers?.[id]) {
        migrationRoomPlayers[id].role = 'PLAYER';
        migrationRoomPlayers[id].seatIndex = seatIndex;
      }
    }
    const game = oldState.game;
    if (game) {
      game.randomSeed ??= 1;
      game.turnDurationMs ??= GAME_CONFIG.defaultTurnDurationMs;
      game.turnEndsAt ??= Date.now() + game.turnDurationMs;
      game.version ??= 0;
      game.turnNumber ??= 0;
      if (game.pendingAction && !game.pendingAction.resolveAt) {
        const legacyPending = game.pendingAction as typeof game.pendingAction & { appealWindowEndsAt?: number };
        game.pendingAction.resolveAt = legacyPending.appealWindowEndsAt ?? Date.now();
      }
    }
    return {
      ...oldState,
      players,
      playerOrder,
      seatByPlayerId,
      privateVersions: Object.fromEntries(playerOrder.map((id) => [id, 0])),
      targetRefs: oldState.targetRefs ?? {},
      lastSeenAt: oldState.lastSeenAt ?? Object.fromEntries(playerOrder.map((id) => [id, Date.now()])),
      spectators: oldState.spectators ?? [],
      ...(migrationRoomPlayers ? { migrationRoomPlayers } : {}),
      privateStateMigrationPending: true
    };
  }
  const deckData = documents.get(deckPath(roomCode))?.data;
  const players: Record<string, Player> = {};
  const seatByPlayerId = metadata.seatByPlayerId as Record<string, number>;
  const privateVersions = { ...((metadata.privateVersions as Record<string, number> | undefined) ?? {}) };
  for (const seatIndex of Object.values(seatByPlayerId)) {
    const seat = documents.get(seatPath(roomCode, seatIndex))?.data;
    const player = seat?.player as Player | undefined;
    if (player && typeof seat?.ownerId === 'string') {
      players[seat.ownerId] = player;
      privateVersions[seat.ownerId] ??= Number(seat.version ?? 0);
    }
  }
  const gameMetadata = metadata.game as Omit<GameState, 'deck'> | undefined;
  const game = gameMetadata && {
    ...gameMetadata,
    deck: (deckData?.deck as Card[] | undefined) ?? [],
    randomSeed: Number(gameMetadata.randomSeed ?? 0),
    turnDurationMs: Number(gameMetadata.turnDurationMs ?? GAME_CONFIG.defaultTurnDurationMs),
    version: Number(gameMetadata.version ?? 0)
  };
  return { ...metadata, players, privateVersions, game };
}

function projectPublicState(state: PrivateState): PublicGameView {
  const players: Record<string, PublicPlayerView> = {};
  const now = Date.now();
  const targetRefs: Record<string, Record<string, string>> = Object.fromEntries(
    state.playerOrder.map((id) => [id, {}])
  );
  for (const player of Object.values(state.players)) {
    const table = player.table.map((card) => {
      if (card.isRevealed) return { ...card };
      const opaqueId = crypto.randomUUID();
      for (const id of state.playerOrder) targetRefs[id][opaqueId] = card.id;
      return { id: opaqueId, category: 'NORMAL', isRevealed: false } as Card;
    });
    players[player.id] = {
      id: player.id,
      name: player.name,
      isHost: player.isHost,
      handCount: GAME_CONFIG.hideOpponentHandCounts ? undefined : player.hand.length,
      role: 'PLAYER',
      table,
      seatIndex: state.seatByPlayerId[player.id],
      privateVersion: state.privateVersions?.[player.id] ?? 0,
      isOnline: now - (state.lastSeenAt?.[player.id] ?? now) < PLAYER_OFFLINE_AFTER_MS
    };
  }
  for (const spectator of state.spectators) {
    players[spectator.id] = {
      id: spectator.id,
      name: spectator.name,
      isHost: spectator.id === state.hostId,
      handCount: undefined,
      role: 'SPECTATOR',
      table: [],
      isOnline: now - (state.lastSeenAt?.[spectator.id] ?? now) < PLAYER_OFFLINE_AFTER_MS
    };
  }
  state.targetRefs = targetRefs;
  const pending = state.game?.pendingAction;
  return {
    roomCode: state.roomCode,
    players,
    deckCount: state.game?.deck.length ?? 0,
    activePlayerId: state.game?.activePlayerId ?? '',
    turnNumber: state.game?.turnNumber ?? 0,
    turnPhase: state.game?.turnPhase ?? 'DRAW',
    turnEndsAt: state.game?.turnEndsAt,
    pendingAction: pending ? {
      actionType: pending.actionType,
      sourcePlayerId: pending.sourcePlayerId,
      targetPlayerId: pending.targetPlayerId,
      resolveAt: pending.resolveAt
    } : undefined,
    winnerId: state.game?.winnerId ?? null,
    version: state.game?.version ?? 0
  };
}

function skipDisconnectedActivePlayer(state: PrivateState, now: number): boolean {
  const game = state.game;
  if (!game || game.winnerId || state.playerOrder.length === 0) return false;
  const activeId = game.activePlayerId;
  const lastSeenAt = state.lastSeenAt?.[activeId];
  const turnExpired = game.turnEndsAt !== undefined && now >= game.turnEndsAt;
  const playerOffline = lastSeenAt === undefined || now - lastSeenAt >= PLAYER_OFFLINE_AFTER_MS;
  if (!turnExpired && !playerOffline) return false;
  if (game.pendingAction && now < game.pendingAction.resolveAt) return false;
  if (game.pendingAction) resolveAction(game, state.players);

  const player = state.players[activeId];
  if (!player) return false;
  game.consecutiveMissedTurns ??= {};
  game.consecutiveMissedTurns[activeId] = (game.consecutiveMissedTurns[activeId] ?? 0) + 1;
  skipTurn(game, player);
  if (game.consecutiveMissedTurns[activeId] >= GAME_CONFIG.maxConsecutiveMissedTurns) {
    game.forfeitedPlayerIds ??= [];
    game.forfeitedPlayerIds.push(activeId);
    recycleCardsToDeck(game, [...player.hand, ...player.table]);
    delete state.seatByPlayerId[activeId];
    delete state.privateVersions?.[activeId];
    delete state.players[activeId];
    delete state.targetRefs[activeId];
    const index = state.playerOrder.indexOf(activeId);
    state.playerOrder = state.playerOrder.filter((id) => id !== activeId);
    const oldRoomPlayer = { id: player.id, name: player.name, joinedAt: now, role: 'SPECTATOR' as const };
    if (!state.spectators.some((spectator) => spectator.id === activeId)) state.spectators.push(oldRoomPlayer);
    if (state.hostId === activeId) {
      const nextHost = state.playerOrder.find((id) =>
        now - (state.lastSeenAt?.[id] ?? 0) < PLAYER_OFFLINE_AFTER_MS
      ) ?? state.playerOrder[0];
      if (nextHost) state.hostId = nextHost;
    }
    for (const remaining of Object.values(state.players)) remaining.isHost = remaining.id === state.hostId;
    if (state.playerOrder.length === 1) game.winnerId = state.playerOrder[0];
    if (state.playerOrder.length > 1) game.activePlayerId = state.playerOrder[index % state.playerOrder.length];
  } else {
    const index = state.playerOrder.indexOf(activeId);
    game.activePlayerId = state.playerOrder[(index + 1) % state.playerOrder.length];
  }
  game.turnEndsAt = now + game.turnDurationMs;
  game.turnNumber = (game.turnNumber ?? 0) + 1;
  game.turnPhase = 'DRAW';
  return true;
}

async function heartbeatGame(env: Env, code: string, actorId: string): Promise<void> {
  await transact(env, [roomPath(code), privatePath(code)], ([room, rawState]) => {
    membership(room, actorId);
    if (room.status !== 'IN_GAME' || !rawState) return { writes: [], result: undefined };
    const state = rawState as unknown as PrivateState;
    const previousState = structuredClone(state);
    const now = Date.now();
    const lastSeenAt = state.lastSeenAt ??= {};
    const allPlayerIds = [...Object.keys(state.players), ...state.spectators.map(({ id }) => id)];
    for (const id of allPlayerIds) lastSeenAt[id] ??= now;
    const wasOnline = Object.fromEntries(allPlayerIds.map((id) => [
      id,
      now - lastSeenAt[id] < PLAYER_OFFLINE_AFTER_MS
    ]));
    lastSeenAt[actorId] = now;
    const wasForfeited = new Set(state.game?.forfeitedPlayerIds ?? []);
    const previousStatus = room.status;
    const skipped = skipDisconnectedActivePlayer(state, now);
    const presenceChanged = allPlayerIds.some((id) =>
      wasOnline[id] !== (now - (state.lastSeenAt?.[id] ?? now) < PLAYER_OFFLINE_AFTER_MS)
    );
    const expired = resolveExpired(state, now);
    const roomPlayers = playerRecords(room);
    for (const id of state.game?.forfeitedPlayerIds ?? []) {
      if (wasForfeited.has(id)) continue;
      const member = roomPlayers[id];
      if (member) {
        member.role = 'SPECTATOR';
        delete member.seatIndex;
      }
    }
    const oldHostId = String(room.hostId);
    if (state.players[oldHostId] &&
        now - (state.lastSeenAt?.[oldHostId] ?? 0) >= PLAYER_OFFLINE_AFTER_MS &&
        state.playerOrder.length > 0) {
      state.hostId = state.playerOrder.find((id) =>
        now - (state.lastSeenAt?.[id] ?? 0) < PLAYER_OFFLINE_AFTER_MS
      ) ?? state.playerOrder[0];
    }
    const hostChanged = state.hostId !== oldHostId;
    if (hostChanged) {
      for (const player of Object.values(state.players)) player.isHost = player.id === state.hostId;
      room.hostId = state.hostId;
    }
    if (state.game?.winnerId) {
      room.status = 'FINISHED';
      state.status = 'FINISHED';
    }
    const roomChanged = hostChanged || room.status !== previousStatus ||
      (state.game?.forfeitedPlayerIds ?? []).some((id) => !wasForfeited.has(id));
    const writes = skipped || presenceChanged || expired
      ? [
          ...(roomChanged ? [setWrite(env, roomPath(code), { status: room.status, hostId: room.hostId, players: roomPlayers }, ['status', 'hostId', 'players'])] : []),
          ...stateWrites(env, state, previousState)
        ]
      : [setWrite(env, metaPath(code), { lastSeenAt: state.lastSeenAt }, ['lastSeenAt'])];
    return { writes, result: undefined };
  });
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

function stateWrites(env: Env, state: PrivateState, previous?: PrivateState): Write[] {
  if (!state.game) throw new ApiError('Cannot persist missing game state.', 500);
  state.game.version = (state.game.version ?? 0) + 1;
  const { deck, ...game } = state.game;
  state.privateVersions ??= {};
  const changedPlayerIds = Object.entries(state.players)
    .filter(([id, player]) => !previous || state.privateStateMigrationPending ||
      JSON.stringify(player) !== JSON.stringify(previous.players[id]) ||
      state.seatByPlayerId[id] !== previous.seatByPlayerId[id])
    .map(([id]) => id);
  for (const id of changedPlayerIds) {
    state.privateVersions[id] = (previous?.privateVersions?.[id] ?? state.privateVersions[id] ?? 0) + 1;
  }
  const publicView = projectPublicState(state);
  const removedSeatIndices = previous
    ? Object.entries(previous.seatByPlayerId)
        .filter(([id, seatIndex]) =>
          state.seatByPlayerId[id] === undefined &&
          !Object.values(state.seatByPlayerId).includes(seatIndex)
        )
        .map(([, seatIndex]) => seatIndex)
    : Array.from({ length: MAX_STARTABLE_PLAYERS }, (_, index) => index)
        .filter((index) => !Object.values(state.seatByPlayerId).includes(index));
  const writes = [
    ...(state.privateStateMigrationPending && state.migrationRoomPlayers
      ? [setWrite(env, roomPath(state.roomCode), { players: state.migrationRoomPlayers }, ['players'])]
      : []),
    setWrite(env, metaPath(state.roomCode), {
      roomCode: state.roomCode,
      status: state.status,
      hostId: state.hostId,
      playerOrder: state.playerOrder,
      targetRefs: state.targetRefs,
      lastSeenAt: state.lastSeenAt ?? {},
      seatByPlayerId: state.seatByPlayerId,
      privateVersions: state.privateVersions,
      spectators: state.spectators,
      game
    }),
    ...(!previous || JSON.stringify(deck) !== JSON.stringify(previous.game?.deck)
      ? [setWrite(env, deckPath(state.roomCode), { deck })]
      : []),
    ...changedPlayerIds.map((id) => {
      const player = state.players[id];
      const seatIndex = state.seatByPlayerId[id];
      if (seatIndex === undefined) throw new ApiError('Game player is missing a private seat.', 500);
      return setWrite(env, seatPath(state.roomCode, seatIndex), {
        ownerId: id,
        seatIndex,
        version: state.privateVersions[id],
        player
      });
    }),
    ...removedSeatIndices.map((seatIndex) => deleteWrite(env, seatPath(state.roomCode, seatIndex))),
    setWrite(env, publicPath(state.roomCode), { ...publicView }),
    deleteWrite(env, privatePath(state.roomCode))
  ];
  return writes;
}

function assertActive(state: PrivateState, actorId: string, phase: GameState['turnPhase']): Player {
  if (!state.game) throw new ApiError('The game has not started.', 409);
  if (state.game.winnerId) throw new ApiError('This game has ended.', 409);
  if (state.game.turnEndsAt !== undefined && Date.now() >= state.game.turnEndsAt) {
    throw new ApiError('The turn deadline has passed. The server will skip this turn.', 409);
  }
  if (state.game.activePlayerId !== actorId) throw new ApiError('It is not your turn.', 403);
  if (state.game.turnPhase !== phase) throw new ApiError(`This action is not available during ${state.game.turnPhase}.`, 409);
  return state.players[actorId];
}

function resolveExpired(state: PrivateState, now: number): boolean {
  const pending = state.game?.pendingAction;
  if (!state.game || !pending || now < pending.resolveAt) return false;
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
    const previousState = structuredClone(state);
    const game = state.game;
    if (!game) throw new ApiError('This game is not active.', 409);
    const now = Date.now();
    const expired = resolveExpired(state, now);
    const action = body.action;

    if (action === 'resolve') {
      if (!game.pendingAction) return { writes: [], result: false };
      if (!expired) throw new ApiError('The interrupt window is still open.', 409);
    } else if (expired) {
      return { writes: stateWrites(env, state, previousState), result: true };
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
        const duration = getInterruptDurationMs();
        game.pendingAction.resolveAt = now + duration;
        game.pendingAction.turnTimeRemainingMs = Math.max(0, (game.turnEndsAt ?? now) - now);
        game.turnEndsAt = now + duration + game.pendingAction.turnTimeRemainingMs;
      }
    } else if (action === 'appeal') {
      const pending = game.pendingAction;
      if (game.turnPhase !== 'INTERRUPT' || !pending || now >= pending.resolveAt) {
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
      if (game.consecutiveMissedTurns) delete game.consecutiveMissedTurns[actorId];
      if (result.winnerId) {
        room.status = 'FINISHED';
        state.status = 'FINISHED';
      } else {
        const index = state.playerOrder.indexOf(actorId);
        game.activePlayerId = state.playerOrder[(index + 1) % state.playerOrder.length];
        game.turnNumber = (game.turnNumber ?? 0) + 1;
        game.turnPhase = 'DRAW';
      }
    } else {
      throw new ApiError('Unknown game action.');
    }

    state.lastSeenAt ??= {};
    state.lastSeenAt[actorId] = now;
    const writes: Write[] = [
      setWrite(env, roomPath(code), { status: room.status }, ['status']),
      ...stateWrites(env, state, previousState)
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
    if (body.roomCode !== undefined) {
      if (!validRoomCode(body.roomCode)) throw new ApiError('Room codes must contain 4–6 letters or numbers.');
      const code = body.roomCode;
      const created = await transact(env, [roomPath(code)], ([existing]) => {
        if (existing) throw new ApiError('That room code is already in use. Join it instead.', 409);
        return {
          writes: [createRoomWrite(env, code, actorId, name)],
          result: true
        };
      });
      if (created) return response({ roomCode: code });
      throw new ApiError('Could not create the room. Please try again.', 503);
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newRoomCode();
      const created = await transact(env, [roomPath(code)], ([existing]) => {
        if (existing) return { writes: [], result: false };
        return {
          writes: [createRoomWrite(env, code, actorId, name)],
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

  if (body.action === 'heartbeat') {
    await heartbeatGame(env, code, actorId);
    return response({ ok: true });
  }

  if (body.action === 'rejoinStatus') {
    const result = await transact<{ status: string; expiresAt?: number }>(env, [roomPath(code), privatePath(code), rejoinPath(code, actorId)], ([room, rawState, rawRequest]) => {
      if (!room) throw new ApiError('That room code was not found.', 404);
      const member = playerRecords(room)[actorId];
      if (member) return {
        writes: rawRequest ? [deleteWrite(env, rejoinPath(code, actorId))] : [],
        result: { status: member.role ?? 'PLAYER' }
      };
      if (!rawRequest) return { writes: [], result: { status: 'NOT_FOUND' } };
      const requestData = rawRequest as { name: string; expiresAt: number };
      if (Date.now() < requestData.expiresAt) {
        return { writes: [], result: { status: 'PENDING', expiresAt: requestData.expiresAt } };
      }
      if (!rawState || room.status !== 'IN_GAME') {
        return { writes: [deleteWrite(env, rejoinPath(code, actorId))], result: { status: 'EXPIRED' } };
      }
      const roomPlayers = playerRecords(room);
      const spectators = Object.values(roomPlayers).filter((player) => player.role === 'SPECTATOR').length;
      if (spectators >= GAME_CONFIG.spectatorCap) {
        return { writes: [deleteWrite(env, rejoinPath(code, actorId))], result: { status: 'EXPIRED' } };
      }
      const state = rawState as unknown as PrivateState;
      const previousState = structuredClone(state);
      const name = uniqueJoinName(roomPlayers, `${requestData.name} (spectator)`);
      roomPlayers[actorId] = { id: actorId, name, joinedAt: Date.now(), role: 'SPECTATOR' };
      state.spectators.push(roomPlayers[actorId]);
      state.lastSeenAt ??= {};
      state.lastSeenAt[actorId] = Date.now();
      return {
        writes: [
          setWrite(env, roomPath(code), { players: roomPlayers }, ['players']),
          ...stateWrites(env, state, previousState),
          deleteWrite(env, rejoinPath(code, actorId))
        ],
        result: { status: 'SPECTATOR' }
      };
    });
    return response(result);
  }

  if (body.action === 'cancelRejoin') {
    await transact(env, [rejoinPath(code, actorId)], ([rawRequest]) => ({
      writes: rawRequest ? [deleteWrite(env, rejoinPath(code, actorId))] : [],
      result: undefined
    }));
    return response({ ok: true });
  }

  if (body.action === 'rejoin') {
    const name = cleanName(body.name);
    const result = await transact<{ status: string; expiresAt?: number }>(env, [roomPath(code), privatePath(code), rejoinPath(code, actorId)], ([room, rawState, rawRequest]) => {
      if (!room) throw new ApiError('That room code was not found.', 404);
      if (room.status !== 'IN_GAME' || !rawState) {
        throw new ApiError('This room does not have an active game to rejoin.', 409);
      }
      const roomPlayers = playerRecords(room);
      if (roomPlayers[actorId]) return {
        writes: rawRequest ? [deleteWrite(env, rejoinPath(code, actorId))] : [],
        result: { status: roomPlayers[actorId].role ?? 'PLAYER' }
      };
      if (rawRequest) {
        const request = rawRequest as { expiresAt?: number };
        return { writes: [], result: { status: 'PENDING', expiresAt: request.expiresAt } };
      }
      const state = rawState as unknown as PrivateState;
      const matchingPlayer = Object.values(roomPlayers).find((player) =>
        normalizedPlayerName(player.name) === normalizedPlayerName(name)
      );
      if (!matchingPlayer || !state.players[matchingPlayer.id]) {
        throw new ApiError('No player with that unique name was found in this game.', 404);
      }
      const lastSeenAt = state.lastSeenAt?.[matchingPlayer.id];
      if (lastSeenAt === undefined || Date.now() - lastSeenAt < PLAYER_OFFLINE_AFTER_MS) {
        throw new ApiError(`That player is still connected. Try again after they have been away for ${PLAYER_OFFLINE_AFTER_MS / 1_000} seconds.`, 409);
      }
      return {
        writes: [setWrite(env, rejoinPath(code, actorId), {
          requesterId: actorId,
          matchedPlayerId: matchingPlayer.id,
          name: matchingPlayer.name,
          createdAt: Date.now(),
          expiresAt: Date.now() + GAME_CONFIG.pendingRejoinExpiryMs,
          status: 'PENDING'
        }, undefined)],
        result: { status: 'PENDING', expiresAt: Date.now() + GAME_CONFIG.pendingRejoinExpiryMs }
      };
    });
    return response(result);
  }

  if (body.action === 'approveRejoin' || body.action === 'declineRejoin') {
    const requestId = body.requestId;
    if (typeof requestId !== 'string' || requestId.length > 128) throw new ApiError('Choose a valid rejoin request.');
    const result = await transact(env, [roomPath(code), privatePath(code), rejoinPath(code, requestId)], ([room, rawState, rawRequest]) => {
      membership(room, actorId);
      if (room.hostId !== actorId) throw new ApiError('Only the host can respond to rejoin requests.', 403);
      if (room.status !== 'IN_GAME' || !rawState || !rawRequest) throw new ApiError('That rejoin request is no longer available.', 409);
      const requestData = rawRequest as { requesterId: string; matchedPlayerId: string; name: string; expiresAt: number };
      if (requestData.requesterId !== requestId) throw new ApiError('That rejoin request is invalid.', 409);
      if (Date.now() >= requestData.expiresAt && body.action === 'approveRejoin') {
        throw new ApiError('That rejoin request has expired. It can only be admitted as a spectator.', 409);
      }
      const state = rawState as unknown as PrivateState;
      const previousState = structuredClone(state);
      const players = playerRecords(room);
      if (players[requestId]) throw new ApiError('The requester is already a room member.', 409);
      const oldPlayer = players[requestData.matchedPlayerId];
      const player = state.players[requestData.matchedPlayerId];
      if (!oldPlayer || !player || !state.seatByPlayerId[oldPlayer.id] && state.seatByPlayerId[oldPlayer.id] !== 0) {
        throw new ApiError('The original player seat is no longer available.', 409);
      }
      if (body.action === 'approveRejoin' &&
          Date.now() - (state.lastSeenAt?.[oldPlayer.id] ?? 0) < PLAYER_OFFLINE_AFTER_MS) {
        throw new ApiError('The original player has reconnected. Refresh the room before approving.', 409);
      }
      const nextPlayers = { ...players };
      if (body.action === 'declineRejoin') {
        const spectatorCount = Object.values(nextPlayers).filter((member) => member.role === 'SPECTATOR').length;
        if (spectatorCount >= GAME_CONFIG.spectatorCap) throw new ApiError('The spectator limit has been reached.', 409);
        const name = uniqueJoinName(nextPlayers, `${requestData.name} (spectator)`);
        const spectator: RoomPlayer = { id: requestId, name, joinedAt: Date.now(), role: 'SPECTATOR' };
        nextPlayers[requestId] = spectator;
        state.spectators.push(spectator);
        state.lastSeenAt ??= {};
        state.lastSeenAt[requestId] = Date.now();
        return {
          writes: [
            setWrite(env, roomPath(code), { players: nextPlayers }, ['players']),
            ...stateWrites(env, state, previousState),
            deleteWrite(env, rejoinPath(code, requestId))
          ],
          result: { status: 'SPECTATOR' }
        };
      }

      const oldId = oldPlayer.id;
      delete nextPlayers[oldId];
      const seatIndex = state.seatByPlayerId[oldId];
      delete state.players[oldId];
      state.privateVersions ??= {};
      const oldPrivateVersion = state.privateVersions[oldId] ?? 0;
      delete state.privateVersions[oldId];
      state.privateVersions[requestId] = oldPrivateVersion;
      player.id = requestId;
      state.players[requestId] = player;
      state.playerOrder = state.playerOrder.map((id) => id === oldId ? requestId : id);
      state.seatByPlayerId[requestId] = seatIndex;
      delete state.seatByPlayerId[oldId];
      if (state.game?.activePlayerId === oldId) state.game.activePlayerId = requestId;
      if (state.game?.pendingAction) {
        if (state.game.pendingAction.sourcePlayerId === oldId) state.game.pendingAction.sourcePlayerId = requestId;
        if (state.game.pendingAction.targetPlayerId === oldId) state.game.pendingAction.targetPlayerId = requestId;
      }
      if (state.game?.consecutiveMissedTurns) {
        state.game.consecutiveMissedTurns[requestId] = state.game.consecutiveMissedTurns[oldId] ?? 0;
        delete state.game.consecutiveMissedTurns[oldId];
      }
      if (state.hostId === oldId) state.hostId = requestId;
      for (const currentPlayer of Object.values(state.players)) currentPlayer.isHost = currentPlayer.id === state.hostId;
      state.lastSeenAt ??= {};
      delete state.lastSeenAt[oldId];
      state.lastSeenAt[requestId] = Date.now();
      state.targetRefs[requestId] = state.targetRefs[oldId] ?? {};
      delete state.targetRefs[oldId];
      nextPlayers[requestId] = { ...oldPlayer, id: requestId, role: 'PLAYER', seatIndex };
      return {
        writes: [
          setWrite(env, roomPath(code), {
            players: nextPlayers,
            ...(room.hostId === oldId ? { hostId: requestId } : {})
          }, room.hostId === oldId ? ['players', 'hostId'] : ['players']),
          ...stateWrites(env, state, previousState),
          deleteWrite(env, rejoinPath(code, requestId))
        ],
        result: { status: 'PLAYER' }
      };
    });
    return response(result);
  }

  if (body.action === 'join') {
    const requestedName = cleanName(body.name);
    await transact(env, [roomPath(code), privatePath(code)], ([room, rawState]) => {
      if (!room) throw new ApiError('That room code was not found.', 404);
      const players = playerRecords(room);
      if (players[actorId]) return { writes: [], result: undefined };
      if (room.status === 'FINISHED') throw new ApiError('This game has already finished.', 409);
      if (room.status === 'IN_GAME') {
        if (!rawState) throw new ApiError('The active game state is unavailable.', 409);
        const spectators = Object.values(players).filter((player) => player.role === 'SPECTATOR').length;
        if (spectators >= GAME_CONFIG.spectatorCap) throw new ApiError('This room has reached its spectator limit.', 409);
        const name = uniqueJoinName(players, requestedName);
        const spectator: RoomPlayer = { id: actorId, name, joinedAt: Date.now(), role: 'SPECTATOR' };
        const state = rawState as unknown as PrivateState;
        const previousState = structuredClone(state);
        state.spectators.push(spectator);
        state.lastSeenAt ??= {};
        state.lastSeenAt[actorId] = Date.now();
        return {
          writes: [
            setWrite(env, roomPath(code), {
              players: { ...players, [actorId]: spectator }
            }, ['players']),
            ...stateWrites(env, state, previousState)
          ],
          result: undefined
        };
      }
      const currentRole = Object.values(players).filter((player) => (player.role ?? 'PLAYER') === 'PLAYER').length >= MAX_STARTABLE_PLAYERS
        ? 'SPECTATOR'
        : 'PLAYER';
      const spectatorCount = Object.values(players).filter((player) => player.role === 'SPECTATOR').length;
      if (currentRole === 'SPECTATOR' && spectatorCount >= GAME_CONFIG.spectatorCap) {
        throw new ApiError(`This room supports at most ${GAME_CONFIG.spectatorCap} spectators.`, 409);
      }
      const name = uniqueJoinName(players, requestedName);
      return {
        writes: [setWrite(env, roomPath(code), {
          players: { ...players, [actorId]: { id: actorId, name, joinedAt: Date.now(), role: currentRole } }
        }, ['players'])],
        result: undefined
      };
    });
    return response({ ok: true });
  }

  if (body.action === 'setRole') {
    const role = body.role;
    if (role !== 'PLAYER' && role !== 'SPECTATOR') throw new ApiError('Choose Player or Spectator.');
    await transact(env, [roomPath(code)], ([room]) => {
      membership(room, actorId);
      if (room.status !== 'LOBBY') throw new ApiError('Roles cannot be changed after the game starts.', 409);
      const players = playerRecords(room);
      const member = players[actorId];
      if (room.hostId === actorId && role === 'SPECTATOR') {
        throw new ApiError('The host must stay a player to start and manage the game.', 409);
      }
      if ((member.role ?? 'PLAYER') === role) return { writes: [], result: undefined };
      const roleCount = Object.values(players).filter((player) => (player.role ?? 'PLAYER') === role).length;
      const roleLimit = role === 'PLAYER' ? MAX_STARTABLE_PLAYERS : GAME_CONFIG.spectatorCap;
      if (roleCount >= roleLimit) throw new ApiError(`This room supports at most ${roleLimit} ${role === 'PLAYER' ? 'players' : 'spectators'}.`, 409);
      return {
        writes: [setWrite(env, roomPath(code), {
          players: { ...players, [actorId]: { ...member, role, seatIndex: undefined } }
        }, ['players'])],
        result: undefined
      };
    });
    return response({ ok: true });
  }

  if (body.action === 'setTurnDuration') {
    const turnDurationMs = body.turnDurationMs;
    if (typeof turnDurationMs !== 'number' ||
        !GAME_CONFIG.turnDurationOptionsMs.some((option) => option === turnDurationMs)) {
      throw new ApiError('Choose one of the available turn limits.');
    }
    await transact(env, [roomPath(code)], ([room]) => {
      membership(room, actorId);
      if (room.hostId !== actorId) throw new ApiError('Only the host can change the turn limit.', 403);
      if (room.status !== 'LOBBY') throw new ApiError('The turn limit cannot be changed after the game starts.', 409);
      return {
        writes: [setWrite(env, roomPath(code), { turnDurationMs }, ['turnDurationMs'])],
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
        writes: [setWrite(env, roomPath(code), { status: 'IN_GAME', players: playerRecords(room) }, ['status', 'players']), ...stateWrites(env, state)],
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
        const previousState = structuredClone(state);
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
        if (!removed) {
          const spectatorIndex = state.spectators.findIndex((spectator) => spectator.id === targetId);
          if (spectatorIndex < 0) throw new ApiError('That player is not part of the active game.', 409);
          const remaining = Object.fromEntries(Object.entries(players).filter(([id]) => id !== targetId));
          state.spectators.splice(spectatorIndex, 1);
          delete state.lastSeenAt?.[targetId];
          let nextHost = String(room.hostId);
          if (nextHost === targetId) {
            nextHost = state.playerOrder.find((id) =>
              Date.now() - (state.lastSeenAt?.[id] ?? 0) < PLAYER_OFFLINE_AFTER_MS
            ) ?? state.playerOrder[0] ?? Object.values(remaining).sort((a, b) => a.joinedAt - b.joinedAt)[0]?.id ?? '';
            state.hostId = nextHost;
            for (const player of Object.values(state.players)) player.isHost = player.id === nextHost;
          }
          if (Object.keys(remaining).length === 0) {
            return {
              writes: [
                deleteWrite(env, roomPath(code)),
                ...privateStatePaths(code).map((path) => deleteWrite(env, path))
              ],
              result: undefined
            };
          }
          const writes: Write[] = [
            setWrite(env, roomPath(code), { players: remaining, hostId: nextHost }, ['players', 'hostId'])
          ];
          if (state.playerOrder.length > 0) writes.push(...stateWrites(env, state, previousState));
          else writes.push(
            ...privateStatePaths(code).map((path) => deleteWrite(env, path))
          );
          return { writes, result: undefined };
        }
        if (playerOrderIndex < 0) throw new ApiError('That player is not part of the active game.', 409);
        recycleCardsToDeck(state.game, [...removed.table, ...removed.hand]);
        const pending = state.game.pendingAction;
        if (pending && (pending.sourcePlayerId === targetId || pending.targetPlayerId === targetId)) {
          recycleCardsToDeck(state.game, [pending.actionCard]);
          if (pending.turnTimeRemainingMs !== undefined) {
            state.game.turnEndsAt = Date.now() + pending.turnTimeRemainingMs;
          }
          state.game.pendingAction = undefined;
          state.game.turnPhase = 'MAIN';
        }

        const previousActivePlayerId = state.game.activePlayerId;
        delete state.players[targetId];
        delete state.privateVersions?.[targetId];
        delete state.targetRefs[targetId];
        delete state.seatByPlayerId[targetId];
        delete state.lastSeenAt?.[targetId];
        delete state.game.consecutiveMissedTurns?.[targetId];
        state.playerOrder = state.playerOrder.filter((id) => id !== targetId);
        const remaining = Object.fromEntries(Object.entries(players).filter(([id]) => id !== targetId));
        if (state.playerOrder.length === 0) {
          state.status = 'FINISHED';
          room.status = 'FINISHED';
        }

        const nextHost = room.hostId === targetId
          ? state.playerOrder.find((id) =>
              Date.now() - (state.lastSeenAt?.[id] ?? 0) < PLAYER_OFFLINE_AFTER_MS
            ) ?? state.playerOrder[0] ?? Object.values(remaining).sort((a, b) => a.joinedAt - b.joinedAt)[0]?.id ?? ''
          : String(room.hostId);
        for (const player of Object.values(state.players)) {
          player.isHost = player.id === nextHost;
        }
        if (room.status === 'IN_GAME' && previousActivePlayerId === targetId) {
          if (state.playerOrder.length > 0) {
            state.game.activePlayerId = state.playerOrder[Math.min(playerOrderIndex, state.playerOrder.length - 1)];
            state.game.turnEndsAt = Date.now() + state.game.turnDurationMs;
            state.game.turnNumber = (state.game.turnNumber ?? 0) + 1;
          }
          if (!state.game.winnerId) state.game.turnPhase = 'DRAW';
        }
        if (state.game.consecutiveMissedTurns) delete state.game.consecutiveMissedTurns[targetId];
        state.hostId = nextHost;
        if (Object.keys(remaining).length === 0) {
          return {
            writes: [
              deleteWrite(env, roomPath(code)),
              ...privateStatePaths(code).map((path) => deleteWrite(env, path))
            ],
            result: undefined
          };
        }
        const writes: Write[] = [
          setWrite(env, roomPath(code), { status: room.status, players: remaining, hostId: nextHost }, ['status', 'players', 'hostId']),
          ...stateWrites(env, state, previousState)
        ];
        return {
          writes,
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
        ? Object.values(remaining)
            .filter((member) => (member.role ?? 'PLAYER') === 'PLAYER')
            .sort((a, b) => a.joinedAt - b.joinedAt)[0]?.id ??
          Object.values(remaining).sort((a, b) => a.joinedAt - b.joinedAt)[0].id
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
  const startedAt = performance.now();
  let result: Response;
  try {
    result = await route(request, env);
  } catch (error) {
    if (error instanceof ApiError) result = response({ error: error.message }, error.status);
    else result = response({ error: 'The request could not be completed.' }, 500);
  }
  const headers = new Headers(result.headers);
  headers.set('Server-Timing', `api;dur=${(performance.now() - startedAt).toFixed(1)}`);
  return new Response(result.body, { status: result.status, statusText: result.statusText, headers });
};

type PagesFunction<E> = (context: PagesContext & { env: E }) => Promise<Response>;

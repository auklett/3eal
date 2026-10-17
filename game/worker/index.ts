import { CreateRoomSchema } from '../src/shared/protocol';
import { z } from 'zod';
import { GameRoom } from './gameRoom';

declare global {
  interface Env {
    TURNSTILE_SECRET?: string;
    TURNSTILE_SECRET_KEY?: string;
    TURNSTILE_SITE_KEY?: string;
    WEB_ANALYTICS_TOKEN?: string;
    GAME_ROOM: DurableObjectNamespace;
    ASSETS: Fetcher;
  }
}

export { GameRoom };

const roomAlphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    console.log('=== WORKER FETCH CALLED ===');
    console.log('Method:', request.method);
    console.log('Path:', request.url);
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/config') {
      console.log('Handling /api/config request');
      return Response.json({
        turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? '',
        webAnalyticsToken: env.WEB_ANALYTICS_TOKEN ?? ''
      });
    }

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      console.log('Handling /api/rooms POST request');
      return createRoom(request, env);
    }

    // Lightweight existence probe. This addresses the Durable Object (which
    // instantiates it) but never writes a room row or leaves half-created
    // state behind.
    const existsMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,6})\/exists$/i);
    if (existsMatch && request.method === 'GET') {
      const roomCode = existsMatch[1].toUpperCase();
      const id = env.GAME_ROOM.idFromName(roomCode);
      const response = await env.GAME_ROOM.get(id).fetch('https://game-room/internal/exists');
      if (!response.ok) return Response.json({ error: 'Room lookup failed' }, { status: 502 });
      const payload = await readJson(response) as { exists?: boolean } | null;
      return Response.json({ roomCode, exists: payload?.exists === true });
    }

    const match = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,6})\/ws$/i);
    if (match && request.method === 'GET') {
      const roomCode = match[1].toUpperCase();
      const id = env.GAME_ROOM.idFromName(roomCode);
      return env.GAME_ROOM.get(id).fetch(request);
    }

    return env.ASSETS.fetch(request);
  }
};

async function createRoom(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const parsed = CreateRoomSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'A player name is required' }, { status: 400 });
  }

  // Turnstile is always enforced server-side when a secret is configured. The
  // client only relaxes its own token requirement when no site key is present,
  // which must never weaken this gate.
  const turnstileSecret = env.TURNSTILE_SECRET ?? env.TURNSTILE_SECRET_KEY;
  if (turnstileSecret) {
    const token = parsed.data.turnstileToken;
    if (!token || !(await verifyTurnstile(token, turnstileSecret))) {
      return Response.json({ error: 'Turnstile verification failed' }, { status: 403 });
    }
  }

  if (parsed.data.roomCode) {
    const result = await initializeRoom(env, parsed.data.roomCode, parsed.data.name);
    if (result.status === 409) {
      return Response.json({ error: 'That room code is already in use. Choose another.' }, { status: 409 });
    }
    if (!result.ok) return Response.json({ error: 'The room could not be initialized' }, { status: 500 });
    const payload = await result.json() as { hostSessionId: string };
    return Response.json({ roomCode: parsed.data.roomCode, sessionId: payload.hostSessionId }, { status: 201 });
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomCode = generateRoomCode();
    const result = await initializeRoom(env, roomCode, parsed.data.name);
    if (result.status === 409) continue;
    if (!result.ok) return Response.json({ error: 'The room could not be initialized' }, { status: 500 });
    const payload = await result.json() as { hostSessionId: string };
    return Response.json({ roomCode, sessionId: payload.hostSessionId }, { status: 201 });
  }
  return Response.json({ error: 'Could not allocate a unique room code; try again' }, { status: 503 });
}

/** Creates a room atomically for a specific code; returns the DO response. */
async function initializeRoom(env: Env, roomCode: string, hostName: string): Promise<Response> {
  const hostId = crypto.randomUUID();
  const hostSessionId = crypto.randomUUID();
  const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(roomCode));
  const result = await stub.fetch('https://game-room/internal/initialize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomCode,
      hostId,
      hostSessionId,
      hostName,
      seed: crypto.randomUUID()
    })
  });
  if (result.status === 409) return new Response(null, { status: 409 });
  if (!result.ok) return new Response(null, { status: 500 });
  return Response.json({ hostSessionId });
}

async function verifyTurnstile(token: string, secret: string): Promise<boolean> {
  console.log('=== VERIFY TURNSTILE START ===');
  console.log('Verifying Turnstile token length:', token.length);
  console.log('Using secret length:', secret.length);
  console.log('Secret starts with:', secret.substring(0, 5) + '...');
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token })
    });
    console.log('Turnstile verification response status:', response.status);
    console.log('Turnstile verification response headers:', Object.fromEntries(response.headers));
    if (!response.ok) {
      const errorText = await response.text();
      console.log('Turnstile verification failed with status:', response.status, 'body:', errorText);
      console.log('=== VERIFY TURNSTILE END (false - not ok) ===');
      return false;
    }
    const result = await readJson(response);
    console.log('Turnstile verification result:', JSON.stringify(result, null, 2));
    const verification = z.object({
      success: z.boolean(),
      action: z.string().optional()
    }).safeParse(result);
    if (!verification.success) {
      console.log('Turnstile verification schema failed:', verification.error);
      console.log('=== VERIFY TURNSTILE END (false - schema failed) ===');
      return false;
    }
    const isValid = verification.success && verification.data.success && verification.data.action === 'create_room';
    console.log('Turnstile verification final result:', isValid);
    console.log('=== VERIFY TURNSTILE END (returning:', isValid, ') ===');
    return isValid;
  } catch (error) {
    console.error('Turnstile verification exception:', error);
    console.log('=== VERIFY TURNSTILE END (false - exception) ===');
    return false;
  }
}

function generateRoomCode(): string {
  const random = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(random, (value) => roomAlphabet[value % roomAlphabet.length]).join('');
}

async function readJson(request: Request | Response): Promise<unknown> {
  try {
    return await request.json() as unknown;
  } catch {
    return null;
  }
}

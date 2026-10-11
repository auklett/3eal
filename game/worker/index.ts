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
  console.log('=== CREATE ROOM START ===');
  console.log('Environment TURNSTILE_SITE_KEY:', env.TURNSTILE_SITE_KEY ? 'present' : 'missing');
  console.log('Environment TURNSTILE_SECRET_KEY:', env.TURNSTILE_SECRET_KEY ? 'present' : 'missing');
  console.log('Environment TURNSTILE_SECRET:', env.TURNSTILE_SECRET ? 'present' : 'missing');
  const turnstileSecret = env.TURNSTILE_SECRET ?? env.TURNSTILE_SECRET_KEY;
  if (!turnstileSecret || !env.TURNSTILE_SITE_KEY) {
    console.log('Missing Turnstile configuration - secret:', !!turnstileSecret, 'siteKey:', !!env.TURNSTILE_SITE_KEY);
    return Response.json({ error: 'Room creation is not configured with Turnstile yet' }, { status: 503 });
  }
  const body = await readJson(request);
  // Debug: log what we received
  console.log('CreateRoom request body:', body);
  const parsed = CreateRoomSchema.safeParse(body);
  if (!parsed.success) {
    // Log detailed Zod error information - force output
    console.log('=== CREATE ROOM VALIDATION FAILED ===');
    console.log('Request body:', JSON.stringify(body, null, 2));
    console.log('Zod error:', parsed.error);
    console.log('Zod error issues:', JSON.stringify(parsed.error.issues, null, 2));
    for (const issue of parsed.error.issues) {
      console.log(`  - Path: ${issue.path?.join(' -> ') || 'root'}, Message: ${issue.message}, Code: ${issue.code}`);
    }
    console.log('=== END VALIDATION ERROR ===');
    return Response.json({ error: 'A name and valid Turnstile token are required' }, { status: 400 });
  }
  console.log('Parsed data:', parsed.data);
  const verified = await verifyTurnstile(parsed.data.turnstileToken, turnstileSecret);
  if (!verified) return Response.json({ error: 'Turnstile verification failed' }, { status: 403 });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const roomCode = generateRoomCode();
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
        hostName: parsed.data.name,
        seed: crypto.randomUUID()
      })
    });
    if (result.status === 409) continue;
    if (!result.ok) return Response.json({ error: 'The room could not be initialized' }, { status: 500 });
    return Response.json({ roomCode, sessionId: hostSessionId }, { status: 201 });
  }
  return Response.json({ error: 'Could not allocate a unique room code; try again' }, { status: 503 });
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

import { CreateRoomSchema } from '../src/shared/protocol';
import { z } from 'zod';
import { GameRoom } from './gameRoom';

declare global {
  interface Env {
    TURNSTILE_SECRET?: string;
    TURNSTILE_SECRET_KEY?: string;
  }
}

export { GameRoom };

const roomAlphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/config') {
      return Response.json({
        turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? '',
        webAnalyticsToken: env.WEB_ANALYTICS_TOKEN ?? ''
      });
    }

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
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
  const turnstileSecret = env.TURNSTILE_SECRET ?? env.TURNSTILE_SECRET_KEY;
  if (!turnstileSecret || !env.TURNSTILE_SITE_KEY) {
    return Response.json({ error: 'Room creation is not configured with Turnstile yet' }, { status: 503 });
  }
  const body = await readJson(request);
  const parsed = CreateRoomSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'A name and valid Turnstile token are required' }, { status: 400 });
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
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: token })
  });
  if (!response.ok) return false;
  const result = await readJson(response);
  const verification = z.object({
    success: z.boolean(),
    action: z.string().optional()
  }).safeParse(result);
  return verification.success && verification.data.success && verification.data.action === 'create_room';
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

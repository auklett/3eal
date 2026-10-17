import { afterEach, describe, expect, it, vi } from 'vitest';

// `worker/index.ts` pulls in the Durable Object base class from this virtual
// module, which only exists inside the Workers runtime.
vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }));

import worker from './index';

type WorkerEnv = Parameters<typeof worker.fetch>[1];

function makeEnv(options: { secret?: string; siteKey?: string } = {}): WorkerEnv {
  return {
    TURNSTILE_SITE_KEY: options.siteKey,
    TURNSTILE_SECRET_KEY: options.secret,
    GAME_ROOM: {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async () => Response.json({ hostSessionId: 'host-session' })
      })
    },
    ASSETS: { fetch: async () => new Response('assets') }
  } as unknown as WorkerEnv;
}

function postRoom(body: Record<string, unknown>, env: WorkerEnv): Promise<Response> {
  return worker.fetch(
    new Request('https://example.com/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
    env
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('server-side Turnstile enforcement on room creation', () => {
  it('rejects a missing token when a secret is configured — random and chosen codes', async () => {
    const env = makeEnv({ secret: 'secret', siteKey: 'site-key' });

    const random = await postRoom({ name: 'Host' }, env);
    expect(random.ok).toBe(false);
    expect(random.status).toBe(403);

    const chosen = await postRoom({ name: 'Host', roomCode: 'ABCD' }, env);
    expect(chosen.ok).toBe(false);
    expect(chosen.status).toBe(403);
  });

  it('rejects an invalid token when a secret is configured', async () => {
    const siteverify = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ success: false }));
    const env = makeEnv({ secret: 'secret', siteKey: 'site-key' });

    const response = await postRoom({ name: 'Host', turnstileToken: 'not-a-real-token' }, env);
    expect(response.ok).toBe(false);
    expect(response.status).toBe(403);
    expect(siteverify).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.anything()
    );
  });

  it('allows creation without a token when no secret is configured — random and chosen codes', async () => {
    const env = makeEnv();

    const random = await postRoom({ name: 'Host' }, env);
    expect(random.status).toBe(201);
    const randomPayload = await random.json() as { roomCode?: string; sessionId?: string };
    expect(typeof randomPayload.roomCode).toBe('string');
    expect(typeof randomPayload.sessionId).toBe('string');
    expect(randomPayload.sessionId).not.toBe('');

    const chosen = await postRoom({ name: 'Host', roomCode: 'ABCD' }, env);
    expect(chosen.status).toBe(201);
    await expect(chosen.json()).resolves.toMatchObject({ roomCode: 'ABCD' });
  });
});

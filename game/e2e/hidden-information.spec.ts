import { expect, test, type Page } from '@playwright/test';
import type { ServerMsg, View } from '../src/shared/protocol';

const aliceId = '00000000-0000-4000-8000-000000000001';
const bobId = '00000000-0000-4000-8000-000000000002';
const viewerId = '00000000-0000-4000-8000-000000000003';
const aliceSessionId = '10000000-0000-4000-8000-000000000001';
const bobSessionId = '10000000-0000-4000-8000-000000000002';
const viewerSessionId = '10000000-0000-4000-8000-000000000003';

function tableSlots(prefix: string) {
  return [1, 2, 3].map((number) => ({
    id: `${prefix}-concealed-${number}`,
    kind: 'normal' as const,
    color: number === 1 ? 'periwinkle' as const : 'rose' as const,
    number: number as 1 | 2 | 3,
    shape: number === 1 ? 'circle' as const : 'triangle' as const
  }));
}

function makeViews(): { alice: View; bob: View; spectator: View } {
  const aliceTable = tableSlots('alice');
  const bobTable = tableSlots('bob');
  const publicData = {
    roomCode: 'ABCD',
    phase: 'playing' as const,
    hostId: aliceId,
    players: [
      {
        id: aliceId,
        name: 'Alice',
        connected: true,
        away: false,
        table: aliceTable.map((card) => ({ state: 'concealed' as const, cardId: card.id })),
        handCount: 1
      },
      {
        id: bobId,
        name: 'Bob',
        connected: true,
        away: false,
        table: bobTable.map((card) => ({ state: 'concealed' as const, cardId: card.id })),
        handCount: 1
      }
    ],
    spectators: [{ id: viewerId, name: 'Viewer', connected: true }],
    spectatorCount: 1,
    activePlayerId: aliceId,
    turnEndsAt: Date.now() + 60_000,
    turnRemainingMs: null,
    turnDurationSeconds: 60,
    turnNumber: 1,
    interrupt: null,
    lastInterruptResult: null,
    deckCount: 200,
    discardCount: 0,
    winnerId: null
  };

  const aliceHand = { id: 'alice-private-hand-card', kind: 'normal' as const, color: 'grape' as const, number: 7 as const, shape: 'hexagon' as const };
  const bobHand = { id: 'bob-private-hand-card', kind: 'normal' as const, color: 'frenchBlue' as const, number: 6 as const, shape: 'pentagon' as const };

  return {
    alice: {
      role: 'player',
      data: {
        ...publicData,
        you: {
          id: aliceId,
          hand: [aliceHand],
          concealedOwn: Object.fromEntries(aliceTable.map((card) => [card.id, card]))
        }
      }
    },
    bob: {
      role: 'player',
      data: {
        ...publicData,
        you: {
          id: bobId,
          hand: [bobHand],
          concealedOwn: Object.fromEntries(bobTable.map((card) => [card.id, card]))
        }
      }
    },
    spectator: { role: 'spectator', data: publicData }
  };
}

async function mockRoom(page: Page, view: View, observed: string[]): Promise<void> {
  await page.route('**/api/config', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ turnstileSiteKey: '', webAnalyticsToken: '' })
  }));
  await page.routeWebSocket(/\/api\/rooms\/ABCD\/ws$/, (webSocket) => {
    webSocket.onMessage((message) => {
      if (typeof message !== 'string') return;
      const parsed: unknown = JSON.parse(message);
      if (typeof parsed !== 'object' || parsed === null || !('t' in parsed) || parsed.t !== 'join') return;
      const response: ServerMsg = { t: 'view', view };
      const serialized = JSON.stringify(response);
      observed.push(serialized);
      webSocket.send(serialized);
    });
  });
}

test('two players and a spectator receive only the information permitted for their view', async ({ browser }) => {
  const views = makeViews();
  const context = await browser.newContext();
  const alicePage = await context.newPage();
  const bobPage = await context.newPage();
  const spectatorPage = await context.newPage();
  const aliceFrames: string[] = [];
  const bobFrames: string[] = [];
  const spectatorFrames: string[] = [];

  await Promise.all([
    mockRoom(alicePage, views.alice, aliceFrames),
    mockRoom(bobPage, views.bob, bobFrames),
    mockRoom(spectatorPage, views.spectator, spectatorFrames)
  ]);

  await Promise.all([
    alicePage.addInitScript(({ name, sessionId }) => {
      sessionStorage.setItem('3eal-player-name', name);
      sessionStorage.setItem('3eal-session:ABCD', sessionId);
    }, { name: 'Alice', sessionId: aliceSessionId }),
    bobPage.addInitScript(({ name, sessionId }) => {
      sessionStorage.setItem('3eal-player-name', name);
      sessionStorage.setItem('3eal-session:ABCD', sessionId);
    }, { name: 'Bob', sessionId: bobSessionId }),
    spectatorPage.addInitScript(({ name, sessionId }) => {
      sessionStorage.setItem('3eal-player-name', name);
      sessionStorage.setItem('3eal-session:ABCD', sessionId);
    }, { name: 'Viewer', sessionId: viewerSessionId })
  ]);

  await Promise.all([
    alicePage.goto('/game/ABCD'),
    bobPage.goto('/game/ABCD'),
    spectatorPage.goto('/game/ABCD')
  ]);

  await Promise.all([
    expect(alicePage.getByText('Your Hand (1)')).toBeVisible(),
    expect(bobPage.getByText('Your Hand (1)')).toBeVisible(),
    expect(spectatorPage.getByText('Your Hand (1)')).toHaveCount(0),
    expect(spectatorPage.getByText('Request to rejoin as')).toBeVisible()
  ]);

  expect(aliceFrames).toHaveLength(1);
  expect(bobFrames).toHaveLength(1);
  expect(spectatorFrames).toHaveLength(1);
  expect(aliceFrames[0]).toContain('alice-private-hand-card');
  expect(aliceFrames[0]).not.toContain('bob-private-hand-card');
  expect(bobFrames[0]).toContain('bob-private-hand-card');
  expect(bobFrames[0]).not.toContain('alice-private-hand-card');
  expect(spectatorFrames[0]).not.toContain('alice-private-hand-card');
  expect(spectatorFrames[0]).not.toContain('bob-private-hand-card');
  expect(spectatorFrames[0]).not.toContain('"concealedOwn"');
  expect(spectatorFrames[0]).not.toContain('"kind":"normal"');

  await context.close();
});

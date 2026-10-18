import { expect, test, type Browser, type Page } from '@playwright/test';
import type { TableCard } from '@3eal/engine';
import type { Card, ServerMsg, View } from '../src/shared/protocol';

const aliceId = '00000000-0000-4000-8000-000000000001';
const bobId = '00000000-0000-4000-8000-000000000002';
const viewerId = '00000000-0000-4000-8000-000000000003';
const aliceSessionId = '10000000-0000-4000-8000-000000000001';
const bobSessionId = '10000000-0000-4000-8000-000000000002';
const viewerSessionId = '10000000-0000-4000-8000-000000000003';

// Starting Table cards are dealt revealed. Each colour here appears on only one
// card, so a frame containing that colour proves exactly which card leaked.
const aliceStart: TableCard[] = [
  { id: 'alice-start-1', kind: 'normal', color: 'periwinkle', number: 1, shape: 'circle' },
  { id: 'alice-start-2', kind: 'normal', color: 'rose', number: 2, shape: 'triangle' },
  { id: 'alice-start-3', kind: 'normal', color: 'grape', number: 3, shape: 'square' }
];
const bobStart: TableCard[] = [
  { id: 'bob-start-1', kind: 'normal', color: 'frenchBlue', number: 4, shape: 'pentagon' },
  { id: 'bob-start-2', kind: 'normal', color: 'teal', number: 5, shape: 'hexagon' },
  { id: 'bob-start-3', kind: 'normal', color: 'rose', number: 6, shape: 'circle' }
];

const aliceHandCard: Card = { id: 'alice-private-hand-card', kind: 'normal', color: 'grape', number: 7, shape: 'hexagon' };
const bobHandCard: Card = { id: 'bob-private-hand-card', kind: 'normal', color: 'frenchBlue', number: 6, shape: 'pentagon' };

function publicSlots(cards: TableCard[], concealedIds: Set<string>) {
  return cards.map((card) => concealedIds.has(card.id)
    ? { state: 'concealed' as const, cardId: card.id }
    : { state: 'revealed' as const, card });
}

function concealedOwn(cards: TableCard[], concealedIds: Set<string>): Record<string, TableCard> {
  return Object.fromEntries(cards.filter((card) => concealedIds.has(card.id)).map((card) => [card.id, card]));
}

function publicData(aliceTable: ReturnType<typeof publicSlots>, bobTable: ReturnType<typeof publicSlots>) {
  return {
    roomCode: 'ABCD',
    phase: 'playing' as const,
    hostId: aliceId,
    players: [
      { id: aliceId, name: 'Alice', connected: true, away: false, table: aliceTable },
      { id: bobId, name: 'Bob', connected: true, away: false, table: bobTable }
    ],
    spectators: [{ id: viewerId, name: 'Viewer', connected: true }],
    spectatorCount: 1,
    activePlayerId: aliceId,
    turnEndsAt: Date.now() + 60_000,
    turnRemainingMs: null,
    turnDurationSeconds: 60,
    turnNumber: 1,
    paused: false,
    pauseRemaining: null,
    interrupt: null,
    lastInterruptResult: null,
    deckCount: 200,
    winnerId: null,
    winningSets: null
  };
}

/** Views for a game where `aliceConcealed` names Alice's face-down cards. */
function makeViews(aliceConcealed: Set<string> = new Set()): { alice: View; bob: View; spectator: View } {
  const aliceTable = publicSlots(aliceStart, aliceConcealed);
  const bobTable = publicSlots(bobStart, new Set());
  const base = publicData(aliceTable, bobTable);
  return {
    alice: {
      role: 'player',
      data: { ...base, you: { id: aliceId, hand: [aliceHandCard], concealedOwn: concealedOwn(aliceStart, aliceConcealed) } }
    },
    bob: {
      role: 'player',
      data: { ...base, you: { id: bobId, hand: [bobHandCard], concealedOwn: {} } }
    },
    spectator: { role: 'spectator', data: base }
  };
}

async function mockRoom(page: Page, view: View, observed: string[], nextView?: View): Promise<void> {
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
      webSocket.send(JSON.stringify({ t: 'view', view } satisfies ServerMsg));
      observed.push(JSON.stringify({ t: 'view', view } satisfies ServerMsg));
      if (nextView) {
        const followUp = JSON.stringify({ t: 'view', view: nextView } satisfies ServerMsg);
        setTimeout(() => {
          webSocket.send(followUp);
          observed.push(followUp);
        }, 60);
      }
    });
  });
}

async function openPages(browser: Browser, views: ReturnType<typeof makeViews>, nextViews?: ReturnType<typeof makeViews>) {
  const context = await browser.newContext();
  const alicePage = await context.newPage();
  const bobPage = await context.newPage();
  const spectatorPage = await context.newPage();
  const aliceFrames: string[] = [];
  const bobFrames: string[] = [];
  const spectatorFrames: string[] = [];

  await Promise.all([
    mockRoom(alicePage, views.alice, aliceFrames, nextViews?.alice),
    mockRoom(bobPage, views.bob, bobFrames, nextViews?.bob),
    mockRoom(spectatorPage, views.spectator, spectatorFrames, nextViews?.spectator)
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

  return { context, alicePage, bobPage, spectatorPage, aliceFrames, bobFrames, spectatorFrames };
}

test('at game start, hands stay private while every starting Table card is visible to opponents and spectators', async ({ browser }) => {
  const views = makeViews();
  const { context, alicePage, bobPage, spectatorPage, aliceFrames, bobFrames, spectatorFrames } = await openPages(browser, views);

  await Promise.all([
    expect(alicePage.getByText('Your Hand (1)')).toBeVisible(),
    expect(bobPage.getByText('Your Hand (1)')).toBeVisible(),
    expect(spectatorPage.getByText('Your Hand (1)')).toHaveCount(0),
    expect(spectatorPage.getByText('Request to rejoin as')).toBeVisible()
  ]);

  expect(aliceFrames).toHaveLength(1);
  expect(bobFrames).toHaveLength(1);
  expect(spectatorFrames).toHaveLength(1);

  // Every starting Table card is revealed by identity to everyone.
  for (const frame of [aliceFrames[0], bobFrames[0], spectatorFrames[0]]) {
    expect(frame).toContain('"color":"periwinkle"');
    expect(frame).toContain('"color":"frenchBlue"');
    expect(frame).toContain('"state":"revealed"');
  }
  // Hands stay private to their owner.
  expect(aliceFrames[0]).toContain('alice-private-hand-card');
  expect(aliceFrames[0]).not.toContain('bob-private-hand-card');
  expect(bobFrames[0]).toContain('bob-private-hand-card');
  expect(bobFrames[0]).not.toContain('alice-private-hand-card');
  expect(spectatorFrames[0]).not.toContain('alice-private-hand-card');
  expect(spectatorFrames[0]).not.toContain('bob-private-hand-card');
  expect(spectatorFrames[0]).not.toContain('"concealedOwn"');
  // The owner sees the eye badge on each of their own revealed starting cards.
  await expect(alicePage.getByLabel('Revealed to all players')).toHaveCount(6);

  await context.close();
});

test('a card concealed after the start disappears from opponents and spectators', async ({ browser }) => {
  const views = makeViews();
  const concealed = makeViews(new Set(['alice-start-1']));
  const { context, bobPage, spectatorPage, bobFrames, spectatorFrames } = await openPages(browser, views, concealed);

  // Wait for the initial (revealed) snapshot to arrive and render.
  await expect(bobPage.getByLabel('Revealed to all players').first()).toBeVisible();

  // Before the conceal, Alice's first card was public.
  expect(bobFrames[0]).toContain('"color":"periwinkle"');
  expect(spectatorFrames[0]).toContain('"color":"periwinkle"');

  // After the conceal resolves, the card is face-down to both viewers.
  await expect(bobPage.getByLabel('Concealed card')).toHaveCount(1);
  await expect(spectatorPage.getByLabel('Concealed card')).toHaveCount(1);
  await expect
    .poll(() => bobFrames.length)
    .toBeGreaterThanOrEqual(2);
  expect(bobFrames.at(-1)).toContain('"cardId":"alice-start-1"');
  expect(bobFrames.at(-1)).not.toContain('"color":"periwinkle"');
  expect(spectatorFrames.at(-1)).toContain('"cardId":"alice-start-1"');
  expect(spectatorFrames.at(-1)).not.toContain('"color":"periwinkle"');

  await context.close();
});

import { expect, test, type Page } from '@playwright/test';
import type { View } from '../src/shared/protocol';
import { ALICE, BOB, mockConfig, mockRoomSocket, playerView, waitForOwnTable } from './fixtures';

const finishedHost = playerView({ phase: 'finished', winnerId: ALICE, hostId: ALICE, activePlayerId: null });
const finishedGuest = playerView({ phase: 'finished', winnerId: ALICE, hostId: ALICE, activePlayerId: null, viewerId: BOB });

test('host and guest return to the lobby after a finished game in two separate contexts', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();
  await Promise.all([mockConfig(hostPage), mockConfig(guestPage)]);

  let hostView: View = finishedHost;
  let guestView: View = finishedGuest;
  let guestSocket: { send: (message: string) => void } | null = null;

  await mockRoomSocket(hostPage, 'ABCD', () => hostView, [], undefined, (message, socket) => {
    if (message['t'] !== 'returnToLobby') return;
    hostView = playerView({ phase: 'lobby', activePlayerId: null, hostId: ALICE });
    guestView = playerView({ phase: 'lobby', activePlayerId: null, hostId: ALICE, viewerId: BOB });
    socket.send(JSON.stringify({ t: 'view', view: hostView }));
    guestSocket?.send(JSON.stringify({ t: 'view', view: guestView }));
  });
  await mockRoomSocket(guestPage, 'ABCD', () => guestView, [], (socket) => {
    guestSocket = socket;
  });

  await Promise.all([hostPage.goto('/game/ABCD'), guestPage.goto('/game/ABCD')]);
  await Promise.all([waitForOwnTable(hostPage, /Your Table/), waitForOwnTable(guestPage, /Your Table/)]);
  await expect(hostPage.getByRole('heading', { name: 'Game over' })).toBeVisible();

  await hostPage.getByRole('button', { name: 'Return to Lobby' }).click();

  await expect.poll(() => new URL(hostPage.url()).pathname).toBe('/lobby/ABCD');
  await expect.poll(() => new URL(guestPage.url()).pathname).toBe('/lobby/ABCD');
  await expect(hostPage.getByRole('heading', { name: 'Players (2)' })).toBeVisible();
  await expect(guestPage.getByRole('heading', { name: 'Players (2)' })).toBeVisible();
  await expect(hostPage.getByText('Connecting to room…')).toHaveCount(0);
  await expect(guestPage.getByText('Connecting to room…')).toHaveCount(0);

  await hostContext.close();
  await guestContext.close();
});

interface DuplicateTabJoin {
  page: string;
  sessionId: string;
  name: string;
}

test('two tabs sharing one session settle and both reach the lobby after a finished game', async ({ browser }) => {
  const context = await browser.newContext();
  const first = await context.newPage();
  const second = await context.newPage();
  const sessionId = '10000000-0000-4000-8000-000000000099';

  const seedTab = async (page: Page, tabName: string) => {
    await page.addInitScript(({ key, nameKey, session, tab }) => {
      if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, session);
      if (!sessionStorage.getItem(nameKey)) sessionStorage.setItem(nameKey, tab);
    }, { key: '3eal-session:ABCD', nameKey: '3eal-player-name', session: sessionId, tab: tabName });
  };
  await seedTab(first, 'Alice');
  await seedTab(second, 'Alice');

  const joins: DuplicateTabJoin[] = [];
  // Install the shared route on both already-created pages.
  const socketsBySession = new Map<string, { send: (message: string) => void; close: (options?: { code?: number; reason?: string }) => void }>();
  let lobby = false;
  const install = async (page: Page, tabName: string) => {
    await page.routeWebSocket(/\/api\/rooms\/ABCD\/ws$/, (webSocket) => {
      webSocket.onMessage((message) => {
        if (typeof message !== 'string') return;
        const parsed = JSON.parse(message) as { t?: string; sessionId?: string; name?: string };
        if (parsed.t === 'returnToLobby') {
          lobby = true;
          const next = playerView({ phase: 'lobby', activePlayerId: null, hostId: ALICE });
          for (const socket of socketsBySession.values()) {
            try {
              socket.send(JSON.stringify({ t: 'view', view: next }));
            } catch {
              // A closed socket is already gone.
            }
          }
          return;
        }
        if (parsed.t !== 'join' || !parsed.sessionId) return;
        joins.push({ page: tabName, sessionId: parsed.sessionId, name: parsed.name ?? '' });
        const existing = socketsBySession.get(parsed.sessionId);
        if (existing && existing !== webSocket) existing.close({ code: 4001, reason: 'reconnected' });
        socketsBySession.set(parsed.sessionId, webSocket);
        const view = lobby
          ? playerView({ phase: 'lobby', activePlayerId: null, hostId: ALICE })
          : finishedHost;
        webSocket.send(JSON.stringify({ t: 'view', view }));
      });
    });
  };
  await install(first, 'first');
  await install(second, 'second');
  await Promise.all([mockConfig(first), mockConfig(second)]);

  // Duplicate a tab after it has loaded, as a user would.
  await first.goto('/game/ABCD');
  await waitForOwnTable(first, /Your Table/);
  await second.goto('/game/ABCD');
  await Promise.all([waitForOwnTable(first, /Your Table/), waitForOwnTable(second, /Your Table/)]);

  // The older tab was displaced with 4001, then rejoined with a new session
  // and a unique name instead of fighting for the same seat.
  await expect.poll(() => joins.filter((join) => join.page === 'first').length).toBeGreaterThanOrEqual(2);
  const firstJoins = joins.filter((join) => join.page === 'first');
  expect(firstJoins[0].sessionId).toBe(sessionId);
  expect(firstJoins.at(-1)?.sessionId).not.toBe(sessionId);
  expect(firstJoins.at(-1)?.name).not.toBe('Alice');
  await expect(first.getByText('Connecting to the game…')).toHaveCount(0);
  await expect(second.getByText('Connecting to the game…')).toHaveCount(0);

  await first.getByRole('button', { name: 'Return to Lobby' }).click();
  await expect.poll(() => new URL(first.url()).pathname).toBe('/lobby/ABCD');
  await expect.poll(() => new URL(second.url()).pathname).toBe('/lobby/ABCD');
  await expect(first.getByRole('heading', { name: 'Players (2)' })).toBeVisible();
  await expect(second.getByRole('heading', { name: 'Players (2)' })).toBeVisible();
  await expect(first.getByText('Connecting to room…')).toHaveCount(0);
  await expect(second.getByText('Connecting to room…')).toHaveCount(0);

  await context.close();
});

test('an impossible join stops retrying with a clear error and a way home', async ({ page }) => {
  await mockConfig(page);
  await page.route('**/api/rooms/ABCD/exists', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ exists: true })
  }));
  await page.routeWebSocket(/\/api\/rooms\/ABCD\/ws$/, (webSocket) => {
    webSocket.close({ code: 1011, reason: 'server unavailable' });
  });

  await page.goto('/game/ABCD');
  await expect(page.getByRole('alert')).toHaveText('Could not reconnect to this room. Return home and try again.', { timeout: 12_000 });
  const home = page.getByRole('button', { name: 'Return Home' });
  await expect(home).toBeVisible();
  await home.click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
});

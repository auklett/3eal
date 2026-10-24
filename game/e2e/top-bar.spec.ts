import { expect, test } from '@playwright/test';
import type { View } from '../src/shared/protocol';
import { ALICE, BOB, mockConfig, mockRoomSocket, playerView, waitForOwnTable } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockConfig(page);
});

test('the top bar shows Players only to the host and Rules to everyone', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({ hostId: ALICE }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await expect(page.getByRole('button', { name: 'Players' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rules' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Leave' })).toBeVisible();

  await page.getByRole('button', { name: 'Rules' }).click();
  const rules = page.getByRole('dialog', { name: 'Game Rules' });
  await expect(rules).toBeVisible();
  await rules.getByRole('button', { name: 'Close rules' }).click();
  await expect(rules).toBeHidden();
});

test('a non-host never sees the Players control', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({ hostId: BOB }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await expect(page.getByRole('button', { name: 'Players' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Rules' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Leave' })).toBeVisible();
});

test('the Players overlay closes and its control disappears when host ownership transfers', async ({ page }) => {
  let current = playerView({ hostId: ALICE });
  let pushView: (view: View) => void = () => {};
  await mockRoomSocket(page, 'ABCD', () => current, [], (socket) => {
    pushView = (next) => socket.send(JSON.stringify({ t: 'view', view: next }));
  });
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await page.getByRole('button', { name: 'Players' }).click();
  const players = page.getByRole('dialog', { name: 'Players' });
  await expect(players).toBeVisible();

  current = playerView({ hostId: BOB });
  pushView(current);

  await expect(players).toBeHidden();
  await expect(page.getByRole('button', { name: 'Players' })).toHaveCount(0);
});

test('Game Over sits above the board, focuses its heading, and stops the timer', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({
    phase: 'finished',
    winnerId: ALICE,
    winningSets: [['alice-1', 'alice-2', 'alice-3']]
  }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  const heading = page.getByRole('heading', { name: 'Game over', exact: true });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(page.getByTestId('turn-timer')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Return to Lobby' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Leave Lobby' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rematch' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Main Page' })).toHaveCount(0);

  const headingBox = await heading.boundingBox();
  const tableBox = await page.getByRole('heading', { name: /Your Table/ }).boundingBox();
  expect(headingBox).not.toBeNull();
  expect(tableBox).not.toBeNull();
  expect(headingBox!.y).toBeLessThan(tableBox!.y);
});

test('a non-host sees Leave Lobby but waits for the host instead of returning', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({ phase: 'finished', hostId: BOB, winnerId: BOB }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await expect(page.getByText('Waiting for the host to return to the lobby')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Return to Lobby' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Leave Lobby' })).toBeVisible();
});

test('Return to Lobby sends the intent and navigates once the lobby snapshot arrives', async ({ page }) => {
  let current = playerView({ phase: 'finished', winnerId: ALICE });
  const sent: string[] = [];
  await mockRoomSocket(page, 'ABCD', () => current, sent, undefined, (message, socket) => {
    if (message['t'] !== 'returnToLobby') return;
    current = playerView({ phase: 'lobby', activePlayerId: null, reveal: false });
    socket.send(JSON.stringify({ t: 'view', view: current }));
  });
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await page.getByRole('button', { name: 'Return to Lobby' }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/lobby/ABCD');
  await expect(page.getByRole('heading', { name: 'Players (2)' })).toBeVisible();
  expect(sent.some((message) => message.includes('"t":"returnToLobby"'))).toBe(true);
});

test('Leave Lobby sends leaveRoom and goes home after the server confirms', async ({ page }) => {
  const sent: string[] = [];
  await mockRoomSocket(page, 'ABCD', playerView({ phase: 'finished', winnerId: ALICE }), sent, undefined, (message, socket) => {
    if (message['t'] !== 'leaveRoom') return;
    socket.send(JSON.stringify({ t: 'left' }));
    socket.close();
  });
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await page.getByRole('button', { name: 'Leave Lobby' }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  expect(sent.some((message) => message.includes('"t":"leaveRoom"'))).toBe(true);
});

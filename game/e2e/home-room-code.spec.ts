import { expect, test } from '@playwright/test';
import { mockConfig, mockRoomSocket, playerView } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockConfig(page);
});

test('rejects a malformed code without leaving the home page', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Room Code').fill('AB');
  await page.getByRole('button', { name: 'Join Room' }).click();

  await expect(page.getByText('Enter a room code containing 4–6 letters or numbers.')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/');
});

test('a nonexistent room stays on the home page and offers exactly two options', async ({ page }) => {
  await page.route('**/api/rooms/ZZZZ/exists', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ roomCode: 'ZZZZ', exists: false })
  }));
  await page.goto('/');
  await page.getByLabel('Room Code').fill('ZZZZ');
  await page.getByRole('button', { name: 'Join Room' }).click();

  await expect(page.getByText('No room ZZZZ exists yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create room with this code' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change the code' })).toBeVisible();
  // It must not navigate away from the home page.
  expect(new URL(page.url()).pathname).toBe('/');
  // It must never claim to be reconnecting.
  await expect(page.getByText(/Reconnecting/)).toHaveCount(0);
});

test('"Change the code" clears the input so the player can retype', async ({ page }) => {
  await page.route('**/api/rooms/ZZZZ/exists', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ roomCode: 'ZZZZ', exists: false })
  }));
  await page.goto('/');
  await page.getByLabel('Room Code').fill('ZZZZ');
  await page.getByRole('button', { name: 'Join Room' }).click();
  await page.getByRole('button', { name: 'Change the code' }).click();

  await expect(page.getByLabel('Room Code')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Create room with this code' })).toHaveCount(0);
});

test('an atomic create conflict keeps the same two options with a clear message', async ({ page }) => {
  await page.route('**/api/rooms/ZZZZ/exists', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ roomCode: 'ZZZZ', exists: false })
  }));
  await page.route('**/api/rooms', (route) => route.request().method() === 'POST'
    ? route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'That room code is already in use. Choose another.' })
    })
    : route.continue());
  await page.goto('/');
  await page.getByLabel('Room Code').fill('ZZZZ');
  await page.getByRole('button', { name: 'Join Room' }).click();
  await page.getByRole('button', { name: 'Create room with this code' }).click();

  await expect(page.getByText('That room code is already in use. Choose another.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create room with this code' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change the code' })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/');
});

test('creating a room with the typed code navigates into its lobby', async ({ page }) => {
  await page.route('**/api/rooms/ZZZZ/exists', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ roomCode: 'ZZZZ', exists: false })
  }));
  await page.route('**/api/rooms', (route) => route.request().method() === 'POST'
    ? route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ roomCode: 'ZZZZ', sessionId: '10000000-0000-4000-8000-000000000009' })
    })
    : route.continue());
  await mockRoomSocket(page, 'ZZZZ', playerView({ phase: 'lobby', activePlayerId: null, reveal: false }));

  await page.goto('/');
  await page.getByLabel('Room Code').fill('ZZZZ');
  await page.getByRole('button', { name: 'Join Room' }).click();
  await page.getByRole('button', { name: 'Create room with this code' }).click();

  await expect(page).toHaveURL(/\/lobby\/ZZZZ$/);
});

test('a direct link to a missing room shows "Room not found", not "Reconnecting…"', async ({ page }) => {
  await page.route('**/api/rooms/ZZZZ/exists', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ roomCode: 'ZZZZ', exists: false })
  }));
  await page.routeWebSocket(/\/api\/rooms\/ZZZZ\/ws$/, (webSocket) => {
    webSocket.close();
  });

  await page.goto('/lobby/ZZZZ');

  await expect(page.getByText('Room not found')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create lobby using the entered code' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Return home' })).toBeVisible();
  await expect(page.getByText(/Reconnecting/)).toHaveCount(0);
});

test('a genuine drop inside a valid room still shows Reconnecting…', async ({ page }) => {
  await page.routeWebSocket(/\/api\/rooms\/ABCD\/ws$/, (webSocket) => {
    webSocket.onMessage((message) => {
      if (typeof message !== 'string') return;
      if (!message.includes('"t":"join"')) return;
      webSocket.send(JSON.stringify({ t: 'view', view: playerView({ phase: 'lobby', activePlayerId: null, reveal: false }) }));
      setTimeout(() => webSocket.close(), 50);
    });
  });

  await page.goto('/lobby/ABCD');

  await expect(page.getByText(/Reconnecting/)).toBeVisible();
  await expect(page.getByText('Room not found')).toHaveCount(0);
});

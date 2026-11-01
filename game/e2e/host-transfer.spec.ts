import { expect, test } from '@playwright/test';
import { ALICE, BOB, VIEWER, mockConfig, mockRoomSocket, playerView, waitForOwnTable } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockConfig(page);
});

test('the Players overlay lists players and spectators with a two-step Make host menu', async ({ page }) => {
  const sent: string[] = [];
  await mockRoomSocket(page, 'ABCD', playerView({
    hostId: ALICE,
    spectators: [{ id: VIEWER, name: 'Viewer', connected: true }]
  }), sent);
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await page.getByRole('button', { name: 'Players' }).click();
  const overlay = page.getByRole('dialog', { name: 'Players' });
  await expect(overlay).toBeVisible();

  // Counts are gone; names, badges, and spectators remain.
  await expect(overlay.getByText(/Table \d/)).toHaveCount(0);
  await expect(overlay.getByText(/Hand \d/)).toHaveCount(0);
  await expect(overlay.getByText('Alice', { exact: true })).toBeVisible();
  await expect(overlay.getByText('Bob', { exact: true })).toBeVisible();
  await expect(overlay.getByText('Viewer', { exact: true })).toBeVisible();
  await expect(overlay.getByText('Spectator', { exact: true })).toBeVisible();

  // The host has no action menu for their own row.
  await expect(overlay.getByRole('button', { name: 'Actions for Alice' })).toHaveCount(0);

  const trigger = overlay.getByRole('button', { name: 'Actions for Bob' });
  const triggerBox = await trigger.boundingBox();
  expect(triggerBox).not.toBeNull();
  expect(triggerBox!.width).toBeGreaterThanOrEqual(44);
  expect(triggerBox!.height).toBeGreaterThanOrEqual(44);

  await trigger.click();
  const menu = overlay.getByRole('menu', { name: 'Actions for Bob' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Make host/ })).toBeFocused();
  await expect(menu.getByRole('menuitem', { name: /Kick/ })).toBeVisible();

  await menu.getByRole('menuitem', { name: /Make host/ }).click();
  await expect(menu.getByText('Make Bob host?')).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Confirm' }).click();

  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(sent.some((message) => message.includes('"t":"transferHost"') && message.includes(`"playerId":"${BOB}"`))).toBe(true);
});

test('the Players overlay closes itself when another member becomes host', async ({ page }) => {
  let current = playerView({ hostId: ALICE });
  let pushView: (view: ReturnType<typeof playerView>) => void = () => {};
  await mockRoomSocket(page, 'ABCD', () => current, [], (socket) => {
    pushView = (next) => socket.send(JSON.stringify({ t: 'view', view: next }));
  });
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await page.getByRole('button', { name: 'Players' }).click();
  await expect(page.getByRole('dialog', { name: 'Players' })).toBeVisible();

  current = playerView({ hostId: BOB });
  pushView(current);

  await expect(page.getByRole('dialog', { name: 'Players' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Players' })).toHaveCount(0);
  // The aria-live region announces the new host.
  await expect(page.locator('[aria-live="polite"]').first()).toHaveText('Bob is now the host.');
});

test('lobby member rows use the same Make host menu', async ({ page }) => {
  const sent: string[] = [];
  await mockRoomSocket(page, 'ABCD', playerView({
    phase: 'lobby',
    activePlayerId: null,
    hostId: ALICE
  }), sent);
  await page.goto('/lobby/ABCD');
  await expect(page.getByRole('heading', { name: 'Players (2)' })).toBeVisible();

  const trigger = page.getByRole('button', { name: 'Actions for Bob' });
  await expect(page.getByRole('button', { name: 'Actions for Alice' })).toHaveCount(0);
  await trigger.click();

  const menu = page.getByRole('menu', { name: 'Actions for Bob' });
  await expect(menu.getByRole('menuitem', { name: /Kick/ })).toBeVisible();
  await menu.getByRole('menuitem', { name: /Make host/ }).click();
  await expect(menu.getByText('Make Bob host?')).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Cancel' }).click();
  await expect(menu.getByRole('menuitem', { name: /Make host/ })).toBeVisible();

  await menu.getByRole('menuitem', { name: /Make host/ }).click();
  await menu.getByRole('menuitem', { name: 'Confirm' }).click();
  expect(sent.some((message) => message.includes('"t":"transferHost"'))).toBe(true);
});

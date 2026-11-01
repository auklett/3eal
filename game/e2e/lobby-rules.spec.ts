import { expect, test } from '@playwright/test';
import { ALICE, mockConfig, mockRoomSocket, playerView } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockConfig(page);
});

test('the lobby header opens the shared Rules overlay and restores focus on Escape', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({ phase: 'lobby', activePlayerId: null }));
  await page.goto('/lobby/ABCD');
  await expect(page.getByRole('heading', { name: 'Players (2)' })).toBeVisible();

  const trigger = page.getByRole('button', { name: 'Rules' });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Game Rules' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Build 3 sets of 3 on your Table.', { exact: true })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('the lobby Rules control keeps a 44px target and falls back to its icon label on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await mockRoomSocket(page, 'ABCD', playerView({ phase: 'lobby', activePlayerId: null, viewerId: ALICE }));
  await page.goto('/lobby/ABCD');

  const trigger = page.getByRole('button', { name: 'Rules' });
  await expect(trigger).toBeVisible();
  const box = await trigger.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
  // The text label is hidden below 360px; the accessible name still says Rules.
  await expect(trigger.getByText('Rules', { exact: true })).toBeHidden();
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Game Rules' })).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { ALICE, mockConfig, mockRoomSocket, playerView, waitForOwnTable } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockConfig(page);
  await page.addInitScript(({ key }) => sessionStorage.setItem(key, '1'), {
    key: `3eal-your-turn:ABCD:${ALICE}`
  });
});

test('End turn uses the rose endTurn variant with black text and a 44px target', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({ activePlayerId: ALICE }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  const endTurn = page.getByRole('button', { name: 'End turn' });
  await expect(endTurn).toBeVisible();
  const styles = await endTurn.evaluate((node) => {
    const computed = getComputedStyle(node);
    return {
      backgroundColor: computed.backgroundColor,
      color: computed.color,
      borderRadius: computed.borderRadius,
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      minHeight: computed.minHeight
    };
  });
  expect(styles.backgroundColor).toBe('rgb(192, 96, 96)');
  expect(styles.color).toBe('rgb(0, 0, 0)');
  expect(styles.borderRadius).toBe('12px');
  expect(styles.fontSize).toBe('15px');
  expect(styles.fontWeight).toBe('500');
  expect(Number.parseFloat(styles.minHeight)).toBeGreaterThanOrEqual(44);

  const box = await endTurn.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test('the STEAL actor sees a transient note when the stolen card went to their Hand', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({
    activePlayerId: ALICE,
    lastInterruptResult: { kind: 'STEAL', outcome: 'resolved', resolvedAt: 12_345 },
    stolenToHandAt: 12_345
  }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await expect(page.getByText('The stolen card went to your Hand.')).toBeVisible();
});

test('the board no longer renders Table, Hand, or n/9 counts but keeps Deck', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({ activePlayerId: ALICE }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await expect(page.getByText('Deck 200')).toBeVisible();
  await expect(page.getByText(/Table \d/)).toHaveCount(0);
  await expect(page.getByText('3/9')).toHaveCount(0);
  await expect(page.getByText('Your Hand (')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Your Hand', exact: true })).toBeVisible();

  // The moved counts are also absent from aria-labels.
  await expect(page.locator('[aria-label*="Table "][aria-label*="/9"]')).toHaveCount(0);
  await expect(page.locator('[aria-label*="Hand ("]')).toHaveCount(0);
});

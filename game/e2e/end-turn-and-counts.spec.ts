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

test('a disabled End turn button stays grey instead of using the rose fill', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({
    activePlayerId: ALICE,
    aliceHand: [{ id: 'steal-action', kind: 'action', action: 'STEAL' }]
  }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);
  await page.getByRole('button', { name: 'Select STEAL card' }).click();

  const endTurn = page.getByRole('button', { name: 'End turn' });
  await expect(endTurn).toBeDisabled();
  await expect(endTurn).toHaveCSS('background-color', /\/\s*0\.12\)/);
  await expect(endTurn).toHaveCSS('color', /\/\s*0\.4\)/);
  await expect(endTurn).toHaveCSS('opacity', '1');
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
  const accessibleLabels = await page.locator('[aria-label]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('aria-label') ?? '')
  );
  expect(accessibleLabels.join(' ')).not.toMatch(/\b(?:Table\s+\d+|\d+\/9|Your Hand\s*\(\d+\))/i);

  await page.getByRole('button', { name: "View Bob's table" }).click();
  const opponentDialog = page.getByRole('dialog', { name: "Bob's table" });
  await expect(opponentDialog).toBeVisible();
  await expect(opponentDialog.getByText(/\bTable\s+\d+\b/i)).toHaveCount(0);
});

test('the Players overlay does not render Table or Hand counts', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({ activePlayerId: ALICE }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);
  await page.getByRole('button', { name: 'Players' }).click();

  const playersDialog = page.getByRole('dialog', { name: 'Players' });
  await expect(playersDialog).toBeVisible();
  await expect(playersDialog.getByText(/\b(?:Table|Hand)\s*(?:count\s*)?(?:\d+|\(\d+\))/i)).toHaveCount(0);
  const accessibleLabels = await playersDialog.locator('[aria-label]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('aria-label') ?? '')
  );
  expect(accessibleLabels.join(' ')).not.toMatch(/\b(?:Table|Hand)\s*(?:count\s*)?(?:\d+|\(\d+\))/i);
});

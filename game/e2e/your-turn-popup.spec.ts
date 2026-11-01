import { expect, test } from '@playwright/test';
import type { View } from '../src/shared/protocol';
import { ALICE, BOB, mockConfig, mockRoomSocket, playerView, waitForOwnTable } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockConfig(page);
});

test('the active player gets an instant, non-modal Your turn popup with the specified panel', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({ activePlayerId: ALICE }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  const popup = page.getByTestId('your-turn-popup');
  await expect(popup).toBeVisible();
  await expect(popup.getByText('Your turn', { exact: true })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Dismiss' })).toBeVisible();
  expect(await popup.locator('[aria-hidden="true"] span').count()).toBe(3);

  const styles = await popup.evaluate((node) => {
    const computed = getComputedStyle(node);
    return {
      backgroundColor: computed.backgroundColor,
      borderWidth: computed.borderTopWidth,
      borderRadius: computed.borderTopLeftRadius,
      padding: computed.padding,
      width: computed.width
    };
  });
  expect(styles.backgroundColor).toBe('rgb(20, 20, 20)');
  expect(styles.borderWidth).toBe('2px');
  expect(styles.borderRadius).toBe('16px');
  expect(styles.padding).toBe('16px');
  expect(styles.width).toBe('300px');

  const title = popup.getByText('Your turn', { exact: true });
  const titleStyles = await title.evaluate((node) => {
    const computed = getComputedStyle(node);
    return { fontSize: computed.fontSize, fontWeight: computed.fontWeight, lineHeight: computed.lineHeight };
  });
  expect(titleStyles.fontSize).toBe('34px');
  expect(titleStyles.fontWeight).toBe('500');
  expect(titleStyles.lineHeight).toBe('34px');

  // It disappears instantly on Escape.
  await page.keyboard.press('Escape');
  await expect(popup).toHaveCount(0);
});

test('the popup auto-hides after five seconds and never re-shows in the same turn', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({ activePlayerId: ALICE }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);
  await expect(page.getByTestId('your-turn-popup')).toBeVisible();

  await page.waitForTimeout(5_200);
  await expect(page.getByTestId('your-turn-popup')).toHaveCount(0);

  // A reload reconnects, but the same turn has already shown the popup.
  await page.reload();
  await waitForOwnTable(page, /Your Table/);
  await expect(page.getByTestId('your-turn-popup')).toHaveCount(0);
});

test('only the active player sees the popup', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({ activePlayerId: BOB }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);
  await expect(page.getByTestId('your-turn-popup')).toHaveCount(0);
});

test('a pause freezes the remaining time and an interrupt hides the popup for the turn', async ({ page }) => {
  let current = playerView({ activePlayerId: ALICE });
  let pushView: (view: View) => void = () => {};
  await mockRoomSocket(page, 'ABCD', () => current, [], (socket) => {
    pushView = (next) => socket.send(JSON.stringify({ t: 'view', view: next }));
  });
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);
  await expect(page.getByTestId('your-turn-popup')).toBeVisible();

  current = playerView({
    activePlayerId: ALICE,
    paused: true,
    pauseRemaining: { turn: 20_000, interrupt: null }
  });
  pushView(current);
  await page.waitForTimeout(5_200);
  await expect(page.getByTestId('your-turn-popup')).toBeVisible();

  current = playerView({
    activePlayerId: ALICE,
    interrupt: {
      id: 'interrupt-1',
      kind: 'STEAL',
      actorId: BOB,
      targetId: ALICE,
      targetCardId: 'alice-1',
      endsAt: Date.now() + 30_000
    }
  });
  pushView(current);
  await expect(page.getByTestId('your-turn-popup')).toHaveCount(0);

  // Even after the interrupt closes, the turn is consumed.
  current = playerView({ activePlayerId: ALICE });
  pushView(current);
  await expect(page.getByTestId('your-turn-popup')).toHaveCount(0);
});

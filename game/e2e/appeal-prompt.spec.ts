import { expect, test } from '@playwright/test';
import { ALICE, BOB, aliceCards, mockConfig, mockRoomSocket, playerView, waitForOwnTable } from './fixtures';

const appeal = { id: 'appeal-card', kind: 'action' as const, action: 'APPEAL' as const };

function stealInterrupt(endsAt: number | null = Date.now() + 30_000) {
  return {
    id: 'interrupt-1',
    kind: 'STEAL' as const,
    actorId: BOB,
    targetId: ALICE,
    targetCardId: aliceCards[0].id,
    endsAt
  };
}

test.beforeEach(async ({ page }) => {
  await mockConfig(page);
});

test('the appeal prompt is an opaque single-row panel with one countdown', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({
    activePlayerId: BOB,
    interrupt: stealInterrupt(),
    aliceHand: [appeal],
    interruptCard: { cardId: aliceCards[0].id, card: aliceCards[0], revealed: false }
  }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  const prompt = page.getByTestId('appeal-prompt');
  await expect(prompt).toBeVisible();
  await expect(prompt.getByText('Play APPEAL?')).toBeVisible();
  await expect(prompt.getByText('Bob wants to STEAL this card from you.')).toBeVisible();
  const appealButton = prompt.getByRole('button', { name: 'APPEAL' });
  await expect(appealButton).toBeVisible();
  const appealStyles = await appealButton.evaluate((node) => {
    const computed = getComputedStyle(node);
    return { background: computed.backgroundColor, color: computed.color };
  });
  expect(appealStyles.background).toBe('rgb(255, 255, 255)');
  expect(appealStyles.color).toBe('rgb(0, 0, 0)');
  await expect(prompt.getByRole('button', { name: 'Pass' })).toBeVisible();
  await expect(prompt.getByRole('img', { name: /seconds remaining/ })).toHaveCount(1);

  const styles = await prompt.evaluate((node) => {
    const computed = getComputedStyle(node);
    return {
      backgroundColor: computed.backgroundColor,
      borderWidth: computed.borderTopWidth,
      borderRadius: computed.borderTopLeftRadius,
      paddingTop: computed.paddingTop,
      paddingLeft: computed.paddingLeft,
      maxWidth: computed.maxWidth
    };
  });
  expect(styles.backgroundColor).toBe('rgb(20, 20, 20)');
  expect(styles.borderWidth).toBe('2px');
  expect(styles.borderRadius).toBe('16px');
  expect(styles.paddingTop).toBe('14px');
  expect(styles.paddingLeft).toBe('16px');
  expect(styles.maxWidth).toBe('600px');

  // The ring is the only appeal countdown: the turn banner no longer has one.
  await expect(page.getByTestId('appeal-timer')).toHaveCount(0);
  const banner = page.getByLabel('Turn status');
  await expect(banner.getByText('Turn paused')).toBeVisible();
  await expect(banner.getByText(/^\d+s appeal$/)).toHaveCount(0);
});

test('the waiting notice uses the same opaque panel, shows seconds, and reveals nobody', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({
    activePlayerId: BOB,
    interrupt: stealInterrupt(),
    aliceHand: [],
    interruptCard: { cardId: aliceCards[0].id, card: aliceCards[0], revealed: false }
  }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  const waiting = page.getByTestId('interrupt-waiting');
  await expect(waiting).toBeVisible();
  await expect(waiting.getByText('Waiting on a decision…')).toBeVisible();
  await expect(waiting.getByText(/^\d+s$/)).toBeVisible();
  await expect(waiting.getByRole('button')).toHaveCount(0);
  await expect(page.getByTestId('appeal-prompt')).toHaveCount(0);

  const background = await waiting.evaluate((node) => getComputedStyle(node).backgroundColor);
  expect(background).toBe('rgb(20, 20, 20)');

  // It never names who was asked or who holds APPEAL.
  await expect(waiting).not.toContainText('Bob');
  await expect(waiting).not.toContainText('Alice');
  await expect(waiting).not.toContainText('APPEAL');
});

test('a paused appeal prompt freezes its ring and relabels its buttons', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({
    activePlayerId: BOB,
    paused: true,
    pauseRemaining: { turn: null, interrupt: 20_000 },
    interrupt: stealInterrupt(null),
    aliceHand: [appeal],
    interruptCard: { cardId: aliceCards[0].id, card: aliceCards[0], revealed: false }
  }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  const prompt = page.getByTestId('appeal-prompt');
  await expect(prompt.getByRole('button', { name: 'APPEAL (Paused)' })).toBeDisabled();
  await expect(prompt.getByRole('button', { name: 'Pass (Paused)' })).toBeDisabled();
  await expect(prompt.getByRole('img', { name: '20 seconds remaining' })).toBeVisible();
  await page.waitForTimeout(700);
  await expect(prompt.getByRole('img', { name: '20 seconds remaining' })).toBeVisible();
});

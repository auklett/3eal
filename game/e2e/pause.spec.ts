import { expect, test } from '@playwright/test';
import { ALICE, BOB, mockConfig, mockRoomSocket, normalCard, playerView, waitForOwnTable } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockConfig(page);
});

test('host sees a Pause control during play and it sends a pause intent', async ({ page }) => {
  const sent: string[] = [];
  await mockRoomSocket(page, 'ABCD', playerView(), sent);
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await page.getByRole('button', { name: 'Pause' }).click();
  expect(sent.some((message) => message.includes('"t":"pause"'))).toBe(true);
});

test('everyone sees the paused banner, only the host sees Resume, and controls are frozen', async ({ page }) => {
  const sent: string[] = [];
  await mockRoomSocket(page, 'ABCD', playerView({
    hostId: ALICE,
    paused: true,
    pauseRemaining: { turn: 10_000, interrupt: null }
  }), sent);
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await expect(page.getByText('Game paused by host')).toBeVisible();
  await expect(page.getByText(/10s frozen/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'End turn' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Resume' }).click();
  expect(sent.some((message) => message.includes('"t":"resume"'))).toBe(true);
});

test('a non-host player sees the banner but never the Resume control', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({
    hostId: BOB,
    paused: true,
    pauseRemaining: { turn: 10_000, interrupt: null }
  }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await expect(page.getByText('Game paused by host')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0);
});

test('a paused interrupt keeps the appeal pop-up visible but disables its buttons', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({
    hostId: ALICE,
    paused: true,
    pauseRemaining: { turn: 45_000, interrupt: 5_000 },
    activePlayerId: ALICE,
    aliceHand: [normalCard('alice-appeal', 5), { id: 'alice-appeal-card', kind: 'action', action: 'APPEAL' }],
    interrupt: {
      id: 'interrupt-1',
      kind: 'STEAL',
      actorId: BOB,
      targetId: ALICE,
      targetCardId: 'alice-1',
      endsAt: null
    }
  }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await expect(page.getByText('Game paused by host')).toBeVisible();
  const appeal = page.getByRole('button', { name: 'APPEAL (Paused)', exact: true });
  const pass = page.getByRole('button', { name: 'Pass (Paused)', exact: true });
  await expect(appeal).toBeVisible();
  await expect(appeal).toBeDisabled();
  await expect(appeal).toContainText('Paused');
  await expect(pass).toBeDisabled();
  await expect(pass).toContainText('Paused');
});

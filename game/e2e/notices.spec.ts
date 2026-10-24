import { expect, test } from '@playwright/test';
import { ALICE, BOB, mockConfig, mockRoomSocket, normalCard, playerView, waitForOwnTable } from './fixtures';

test.beforeEach(async ({ page }) => {
  await mockConfig(page);
});

test('host rejoin requests live in the shared notice stack and send a decision', async ({ page }) => {
  const sent: string[] = [];
  await mockRoomSocket(page, 'ABCD', playerView({
    rejoinRequests: [{ requestId: '00000000-0000-4000-8000-000000000010', name: 'Mallory' }]
  }), sent);
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  const stack = page.getByTestId('notice-stack');
  await expect(stack.getByText('Mallory wants to rejoin.')).toBeVisible();
  await stack.getByRole('button', { name: 'Approve' }).click();
  expect(sent.some((message) => message.includes('"t":"rejoinDecision"') && message.includes('"accept":true'))).toBe(true);
});

test('rejoin requests are never rendered for a non-host', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({
    hostId: BOB,
    rejoinRequests: [{ requestId: '00000000-0000-4000-8000-000000000010', name: 'Mallory' }]
  }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await expect(page.getByText('Mallory wants to rejoin.')).toHaveCount(0);
  await expect(page.getByTestId('notice-stack')).toHaveCount(0);
});

test('the appeal prompt is a top notice that never covers the top bar buttons', async ({ page }) => {
  const sent: string[] = [];
  await mockRoomSocket(page, 'ABCD', playerView({
    activePlayerId: ALICE,
    aliceHand: [normalCard('alice-normal', 5), { id: 'appeal-1', kind: 'action', action: 'APPEAL' }],
    interrupt: {
      id: 'interrupt-1',
      kind: 'STEAL',
      actorId: BOB,
      targetId: ALICE,
      targetCardId: 'alice-1',
      endsAt: Date.now() + 30_000
    }
  }), sent);
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  const stack = page.getByTestId('notice-stack');
  await expect(stack.getByText('Play APPEAL?')).toBeVisible();
  await expect(stack.getByRole('button', { name: 'APPEAL', exact: true })).toBeVisible();
  await expect(stack.getByRole('button', { name: 'Pass', exact: true })).toBeVisible();

  const stackBox = await stack.boundingBox();
  const headerBox = await page.locator('header').boundingBox();
  expect(stackBox).not.toBeNull();
  expect(headerBox).not.toBeNull();
  expect(stackBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height - 1);

  await stack.getByRole('button', { name: 'Pass', exact: true }).click();
  expect(sent.some((message) => message.includes('"t":"pass"'))).toBe(true);
});

test('an ineligible player sees one waiting notice during an interrupt', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({
    activePlayerId: ALICE,
    interrupt: {
      id: 'interrupt-1',
      kind: 'STEAL',
      actorId: ALICE,
      targetId: BOB,
      targetCardId: 'bob-1',
      endsAt: Date.now() + 30_000
    }
  }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await expect(page.getByText(/Waiting on a decision…/)).toBeVisible();
  await expect(page.getByText('Play APPEAL?')).toHaveCount(0);
});

test('the interrupt result shows once and does not reappear after a reload', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({
    lastInterruptResult: { kind: 'STEAL', outcome: 'appealed', resolvedAt: 1_234 }
  }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await expect(page.getByText('STEAL was appealed.')).toBeVisible();

  await page.reload();
  await waitForOwnTable(page, /Your Table/);
  await expect(page.getByText('STEAL was appealed.')).toHaveCount(0);
});

test('the interrupt result clears itself after five seconds', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({
    lastInterruptResult: { kind: 'CONCEAL', outcome: 'resolved', resolvedAt: 9_999 }
  }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await expect(page.getByText('CONCEAL resolved.')).toBeVisible();
  await expect(page.getByText('CONCEAL resolved.')).toHaveCount(0, { timeout: 7_000 });
});

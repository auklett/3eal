import { expect, test } from '@playwright/test';
import { ALICE, mockConfig, mockRoomSocket, normalCard, playerView, waitForOwnTable } from './fixtures';

const HAND_CARD = normalCard('hand-move', 4);

test.beforeEach(async ({ page }) => {
  await mockConfig(page);
});

test('a Hand-to-Table move shows a pending state that clears when the snapshot arrives', async ({ page }) => {
  const sent: string[] = [];
  let releaseSnapshot: () => void = () => {};
  const snapshotGate = new Promise<void>((resolve) => { releaseSnapshot = resolve; });
  const view = playerView({ activePlayerId: ALICE, aliceHand: [HAND_CARD] });

  await mockRoomSocket(page, 'ABCD', view, sent, undefined, async (message, socket) => {
    if (message['t'] === 'place') {
      await snapshotGate;
      socket.send(JSON.stringify({ t: 'view', view }));
    }
  });
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await page.getByRole('button', { name: 'Select Normal card' }).click();
  await page.getByRole('button', { name: 'Move Selected to Table' }).click();

  // In-flight: the pending text does not claim the move already happened, and
  // the move button is disabled so a double click cannot send a duplicate.
  await expect(page.getByText('Submitting move…')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move Selected to Table' })).toBeDisabled();
  expect(sent.filter((message) => message.includes('"t":"place"'))).toHaveLength(1);

  releaseSnapshot();
  await expect(page.getByText('Submitting move…')).toHaveCount(0);
  await expect(page.getByText('Move confirmed.')).toBeVisible();
});

test('a rejected Hand-to-Table move shows the server error and re-enables the move', async ({ page }) => {
  const sent: string[] = [];
  let releaseError: () => void = () => {};
  const errorGate = new Promise<void>((resolve) => { releaseError = resolve; });
  const view = playerView({ activePlayerId: ALICE, aliceHand: [HAND_CARD] });

  await mockRoomSocket(page, 'ABCD', view, sent, undefined, async (message, socket) => {
    if (message['t'] === 'place') {
      await errorGate;
      socket.send(JSON.stringify({ t: 'error', code: 'rejected', message: 'That card cannot go there.' }));
    }
  });
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await page.getByRole('button', { name: 'Select Normal card' }).click();
  await page.getByRole('button', { name: 'Move Selected to Table' }).click();
  await expect(page.getByText('Submitting move…')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move Selected to Table' })).toBeDisabled();

  releaseError();
  await expect(page.getByText('Submitting move…')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveText('That card cannot go there.');

  // The rejection reverts the optimistic placement, so the card is back in Hand
  // and the move can be tried again.
  await page.getByRole('button', { name: 'Select Normal card' }).click();
  await expect(page.getByRole('button', { name: 'Move Selected to Table' })).toBeEnabled();
});

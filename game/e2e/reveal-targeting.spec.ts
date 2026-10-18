import { expect, test } from '@playwright/test';
import { ALICE, bobCards, mockConfig, mockRoomSocket, playerView, waitForOwnTable } from './fixtures';

const EMPTY_MESSAGE = "No concealed cards to reveal yet. Nothing is face-down on any opponent's Table.";

test.beforeEach(async ({ page }) => {
  await mockConfig(page);
});

test('REVEAL shows a clear disabled-state message when no opponent card is concealed', async ({ page }) => {
  // Every starting Table card is revealed, so REVEAL has no legal target yet.
  await mockRoomSocket(page, 'ABCD', playerView({
    activePlayerId: ALICE,
    aliceHand: [{ id: 'reveal-empty', kind: 'action', action: 'REVEAL' }],
    bobTable: bobCards.map((card) => ({ state: 'revealed' as const, card }))
  }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await page.getByRole('button', { name: 'Select REVEAL card' }).click();
  await expect(page.getByText(EMPTY_MESSAGE)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
});

test('REVEAL prompts for a concealed opponent card once one exists', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({
    activePlayerId: ALICE,
    aliceHand: [{ id: 'reveal-target', kind: 'action', action: 'REVEAL' }],
    bobTable: [
      { state: 'concealed' as const, cardId: bobCards[0].id },
      { state: 'revealed' as const, card: bobCards[1] },
      { state: 'revealed' as const, card: bobCards[2] }
    ]
  }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await page.getByRole('button', { name: 'Select REVEAL card' }).click();
  await expect(page.getByText("Choose a card on an opponent's Table that is concealed.")).toBeVisible();
  await expect(page.getByText(EMPTY_MESSAGE)).toHaveCount(0);
});

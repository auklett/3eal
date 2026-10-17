import { expect, test } from '@playwright/test';
import type { PublicSlot } from '../src/shared/protocol';
import { ALICE, aliceCards, bobCards, mockConfig, mockRoomSocket, playerView, waitForOwnTable } from './fixtures';

function revealed(card: (typeof aliceCards)[number]): PublicSlot {
  return { state: 'revealed', card };
}

function concealed(card: (typeof aliceCards)[number]): PublicSlot {
  return { state: 'concealed', cardId: card.id };
}

test.beforeEach(async ({ page }) => {
  await mockConfig(page);
});

test('a revealed card shows an eye badge and a concealed card does not', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({
    aliceTable: [revealed(aliceCards[0]), concealed(aliceCards[1]), concealed(aliceCards[2])],
    bobTable: [revealed(bobCards[0]), concealed(bobCards[1]), concealed(bobCards[2])]
  }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  const badges = page.getByLabel('Revealed to all players');
  await expect(badges).toHaveCount(2);
  // It is a real eye (svg), drawn on a dark translucent circle, not the old yellow dot.
  await expect(badges.first().locator('svg')).toHaveCount(1);
  await expect(badges.first()).toHaveClass(/bg-black\/70/);
});

test('no eye badges are shown on the Game Over screen', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({
    phase: 'finished',
    activePlayerId: null,
    aliceTable: aliceCards.map(revealed),
    bobTable: bobCards.map(revealed),
    winningSets: [aliceCards.map((card) => card.id), bobCards.map((card) => card.id), []],
    reveal: true
  }));
  await page.goto('/game/ABCD');
  await expect(page.getByRole('heading', { name: 'Game over' })).toBeVisible();

  await expect(page.getByLabel('Revealed to all players')).toHaveCount(0);
});

test('opponents never see concealed card identities or a reveal badge', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView());
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await expect(page.getByLabel('Revealed to all players')).toHaveCount(0);
  await expect(page.locator(`[data-table-owner="${ALICE}"] [aria-label="Concealed card"]`)).toHaveCount(0);
});

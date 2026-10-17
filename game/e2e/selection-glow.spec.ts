import { expect, test, type Locator } from '@playwright/test';
import { ALICE, mockConfig, mockRoomSocket, playerView, waitForOwnTable } from './fixtures';

/**
 * Every box-shadow painted on a card (the card element plus its descendants).
 * A selected card must produce exactly one 4px ring, so this should be a single
 * entry; a second entry would mean a second (offset) outline.
 */
async function shadows(locator: Locator): Promise<string[]> {
  return locator.evaluate((el) => {
    const nodes = [el, ...Array.from(el.querySelectorAll('*'))];
    const result: string[] = [];
    for (const node of nodes) {
      const shadow = getComputedStyle(node).boxShadow;
      if (shadow && shadow !== 'none') result.push(shadow);
    }
    return result;
  });
}

// `transition-all` animates the ring in; reduced motion makes it settle at once.
test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
  await mockConfig(page);
});

test('a selected card shows exactly one 4px ring: teal for Action/Periwinkle, white for Rose', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({
    activePlayerId: ALICE,
    aliceHand: [{ id: 'glow-action', kind: 'action', action: 'CONCEAL' }]
  }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  // Periwinkle (table slot 0) -> teal ring, because a white ring would vanish on it.
  const periSlot = page.locator(`[data-table-owner="${ALICE}"][data-table-slot="0"]`);
  const periCard = page.locator('[aria-label="Lavender 1 circle"]');
  await periSlot.click();
  await expect(periCard).toHaveCSS('box-shadow', /^rgb\(0, 128, 128\) 0px 0px 0px 4px$/);
  await expect(periCard).toHaveCSS('outline-style', 'none');
  expect(await shadows(periCard)).toHaveLength(1);
  await periSlot.click(); // deselect without swapping

  // Rose (table slot 1) -> white ring.
  const roseCard = page.locator('[aria-label="Coral 2 triangle"]');
  await page.locator(`[data-table-owner="${ALICE}"][data-table-slot="1"]`).click();
  await expect(roseCard).toHaveCSS('box-shadow', /^rgb\(255, 255, 255\) 0px 0px 0px 4px$/);
  await expect(roseCard).toHaveCSS('outline-style', 'none');
  expect(await shadows(roseCard)).toHaveLength(1);

  // Action card (Hand) -> teal ring on the white card face.
  const actionButton = page.getByRole('button', { name: 'Select CONCEAL card' });
  await actionButton.click();
  const actionCard = actionButton.locator('div').first();
  await expect(actionCard).toHaveCSS('box-shadow', /^rgb\(0, 128, 128\) 0px 0px 0px 4px$/);
  await expect(actionCard).toHaveCSS('outline-style', 'none');
  expect(await shadows(actionCard)).toHaveLength(1);
});

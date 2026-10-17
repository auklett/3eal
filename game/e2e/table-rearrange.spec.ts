import { expect, test, type Page } from '@playwright/test';
import { ALICE, aliceCards, mockConfig, mockRoomSocket, ownSlotIds, playerView, waitForOwnTable } from './fixtures';

async function dragSlot(page: Page, from: number, to: number): Promise<void> {
  const source = page.locator(`[data-table-owner="${ALICE}"][data-table-slot="${from}"]`);
  const target = page.locator(`[data-table-owner="${ALICE}"][data-table-slot="${to}"]`);
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('Missing drag source or target');
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
  await page.mouse.up();
}

// A taller viewport keeps all nine Table slots on screen for drag gestures.
test.use({ viewport: { width: 1280, height: 1400 } });

test.beforeEach(async ({ page }) => {
  await mockConfig(page);
});

test('desktop: tap a table card then tap an empty slot to move it', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView());
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await page.locator(`[data-table-owner="${ALICE}"][data-table-slot="0"]`).click();
  await page.locator(`[data-table-owner="${ALICE}"][data-table-slot="6"]`).click();

  const ids = await ownSlotIds(page);
  expect(ids[6]).toBe(aliceCards[0].id);
  expect(ids[0]).toBe('');
});

test('desktop: tap a table card then tap an occupied slot to swap them', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView());
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await page.locator(`[data-table-owner="${ALICE}"][data-table-slot="0"]`).click();
  await page.locator(`[data-table-owner="${ALICE}"][data-table-slot="2"]`).click();

  const ids = await ownSlotIds(page);
  expect(ids[0]).toBe(aliceCards[2].id);
  expect(ids[2]).toBe(aliceCards[0].id);
});

test('desktop: dragging a table card onto another slot rearranges it locally', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView());
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await dragSlot(page, 1, 7);

  const ids = await ownSlotIds(page);
  expect(ids[7]).toBe(aliceCards[1].id);
  expect(ids[1]).toBe('');
});

test('a pure table-to-table move sends no WebSocket message', async ({ page }) => {
  const sent: string[] = [];
  await mockRoomSocket(page, 'ABCD', playerView(), sent);
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await page.locator(`[data-table-owner="${ALICE}"][data-table-slot="0"]`).click();
  await page.locator(`[data-table-owner="${ALICE}"][data-table-slot="5"]`).click();
  await dragSlot(page, 2, 4);

  expect(sent).toHaveLength(1);
  expect(sent[0]).toContain('"t":"join"');
});

test('rearrangement works even when it is not the viewer\'s turn', async ({ page }) => {
  // activePlayerId defaults to Bob, so Alice cannot play cards; rearranging is still available.
  await mockRoomSocket(page, 'ABCD', playerView());
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await expect(page.locator(`[data-table-owner="${ALICE}"][data-table-slot="0"]`)).toBeEnabled();
  const first = await page.locator(`[data-table-owner="${ALICE}"][data-table-slot="0"]`).getAttribute('data-card-id');
  await page.locator(`[data-table-owner="${ALICE}"][data-table-slot="0"]`).click();
  await page.locator(`[data-table-owner="${ALICE}"][data-table-slot="8"]`).click();

  const ids = await ownSlotIds(page);
  expect(ids[8]).toBe(first);
});

test('rearrangement still works while the game is paused', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({
    hostId: ALICE,
    paused: true,
    pauseRemaining: { turn: 10_000, interrupt: null }
  }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await expect(page.locator(`[data-table-owner="${ALICE}"][data-table-slot="0"]`)).toBeEnabled();
  const first = await page.locator(`[data-table-owner="${ALICE}"][data-table-slot="0"]`).getAttribute('data-card-id');
  await page.locator(`[data-table-owner="${ALICE}"][data-table-slot="0"]`).click();
  await page.locator(`[data-table-owner="${ALICE}"][data-table-slot="8"]`).click();

  const ids = await ownSlotIds(page);
  expect(ids[8]).toBe(first);
});

test('rearrangement still works during an action targeting flow', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({
    activePlayerId: ALICE,
    aliceHand: [{ id: 'target-action', kind: 'action', action: 'REVEAL' }]
  }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  // Selecting REVEAL starts a targeting flow aimed at opponents' concealed cards.
  await page.getByRole('button', { name: 'Select REVEAL card' }).click();

  const first = await page.locator(`[data-table-owner="${ALICE}"][data-table-slot="0"]`).getAttribute('data-card-id');
  await page.locator(`[data-table-owner="${ALICE}"][data-table-slot="0"]`).click();
  await page.locator(`[data-table-owner="${ALICE}"][data-table-slot="7"]`).click();

  const ids = await ownSlotIds(page);
  expect(ids[7]).toBe(first);
});

test('a tap immediately after a drag is not swallowed', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView());
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  const sourceBox = await page.locator(`[data-table-owner="${ALICE}"][data-table-slot="0"]`).boundingBox();
  const destBox = await page.locator(`[data-table-owner="${ALICE}"][data-table-slot="5"]`).boundingBox();
  if (!sourceBox || !destBox) throw new Error('Missing tap targets');

  await dragSlot(page, 1, 7);

  // Immediately (raw pointer, well inside the old 250ms window) tap another
  // card and an empty slot; the tap must land rather than be suppressed.
  await page.mouse.click(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.click(destBox.x + destBox.width / 2, destBox.y + destBox.height / 2);

  const ids = await ownSlotIds(page);
  expect(ids[7]).toBe(aliceCards[1].id);
  expect(ids[5]).toBe(aliceCards[0].id);
  expect(ids[0]).toBe('');
});

test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('tap rearranges the table on a touch viewport', async ({ page }) => {
    await mockRoomSocket(page, 'ABCD', playerView());
    await page.goto('/game/ABCD');
    await waitForOwnTable(page, /Your Table/);

    await page.locator(`[data-table-owner="${ALICE}"][data-table-slot="1"]`).tap();
    await page.locator(`[data-table-owner="${ALICE}"][data-table-slot="3"]`).tap();

    const ids = await ownSlotIds(page);
    expect(ids[3]).toBe(aliceCards[1].id);
    expect(ids[1]).toBe('');
  });
});

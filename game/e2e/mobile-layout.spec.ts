import { expect, test } from '@playwright/test';
import { ALICE, mockConfig, mockRoomSocket, normalCard, playerView, waitForOwnTable } from './fixtures';

test.describe('mobile layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test.beforeEach(async ({ page }) => {
    await mockConfig(page);
  });

  test('the opponents rail pans horizontally, snaps, and does not clip its first panel', async ({ page }) => {
    await mockRoomSocket(page, 'ABCD', playerView({ extraPlayers: 3 }));
    await page.goto('/game/ABCD');
    await waitForOwnTable(page, /Your Table/);

    const rail = page.getByTestId('opponents-rail');
    await expect(rail).toBeVisible();
    const metrics = await rail.evaluate((node) => {
      const computed = getComputedStyle(node);
      return {
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
        overflowX: computed.overflowX,
        snapType: computed.scrollSnapType,
        overscrollX: computed.overscrollBehaviorX,
        touchAction: computed.touchAction
      };
    });
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
    expect(metrics.overflowX).toBe('auto');
    // Chrome normalizes the default `proximity` keyword away, so `x` means
    // `scroll-snap-type: x proximity` here.
    expect(metrics.snapType).toBe('x');
    expect(metrics.overscrollX).toBe('contain');
    expect(metrics.touchAction).toBe('pan-x pan-y');

    const railBox = await rail.boundingBox();
    const firstPanelBox = await rail.locator('section').first().boundingBox();
    expect(railBox).not.toBeNull();
    expect(firstPanelBox).not.toBeNull();
    expect(firstPanelBox!.x).toBeGreaterThanOrEqual(railBox!.x - 1);
    expect(firstPanelBox!.x + firstPanelBox!.width).toBeLessThanOrEqual(railBox!.x + railBox!.width + 1);

    // Mini Table cards must not swallow the horizontal pan gesture.
    const cardTouchAction = await rail.locator('[data-table-owner]').first()
      .evaluate((node) => getComputedStyle(node).touchAction);
    expect(cardTouchAction).toBe('pan-x pan-y');

    await rail.evaluate((node) => node.scrollTo({ left: 600, behavior: 'instant' as ScrollBehavior }));
    await expect.poll(() => rail.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);

    // The rail itself must never widen the page.
    const pageWidth = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    expect(pageWidth.scrollWidth).toBeLessThanOrEqual(pageWidth.clientWidth + 1);
  });

  test('the Rules overlay Normal caption uses the deck constants', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Rules/i }).click();
    await expect(page.getByText('5 colors, 7 numbers, 5 shapes.')).toBeVisible();
  });

  test('the Hand dock never covers the Table or the contextual Move buttons', async ({ page }) => {
    await mockRoomSocket(page, 'ABCD', playerView({
      activePlayerId: ALICE,
      aliceHand: [normalCard('hand-normal', 5)]
    }));
    await page.goto('/game/ABCD');
    await waitForOwnTable(page, /Your Table/);

    const dock = page.getByTestId('hand-dock');
    const table = page.getByTestId('own-table-panel');
    await expect(dock).toBeVisible();
    await expect(table).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(async () => {
      const dockBox = await dock.boundingBox();
      const tableBox = await table.boundingBox();
      return dockBox && tableBox ? tableBox.y + tableBox.height <= dockBox.y + 1 : false;
    }).toBe(true);

    // The contextual actions appear after selecting a Hand card and are nudged clear.
    await page.getByRole('button', { name: 'Select Normal card' }).click();
    const actions = page.locator('[data-context-actions]');
    await expect(actions).toBeVisible();
    await expect.poll(async () => {
      const dockBox = await dock.boundingBox();
      const actionsBox = await actions.boundingBox();
      return dockBox && actionsBox ? actionsBox.y + actionsBox.height <= dockBox.y + 1 : false;
    }).toBe(true);

    // The Show/Hide control still works and keeps its target size.
    const hide = page.getByRole('button', { name: 'Hide', exact: true });
    const hideBox = await hide.boundingBox();
    expect(hideBox).not.toBeNull();
    expect(hideBox!.height).toBeGreaterThanOrEqual(44);
    await hide.click();
    await expect(page.getByRole('button', { name: 'Show', exact: true })).toBeVisible();
  });
});

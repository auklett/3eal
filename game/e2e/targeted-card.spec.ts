import { expect, test } from '@playwright/test';
import {
  ALICE,
  BOB,
  VIEWER,
  aliceCards,
  mockConfig,
  mockRoomSocket,
  playerView,
  spectatorView,
  waitForOwnTable
} from './fixtures';

const appeal = { id: 'appeal-card', kind: 'action' as const, action: 'APPEAL' as const };

function interrupt() {
  return {
    id: 'interrupt-1',
    kind: 'STEAL' as const,
    actorId: BOB,
    targetId: ALICE,
    targetCardId: aliceCards[0].id,
    endsAt: Date.now() + 30_000
  };
}

test.beforeEach(async ({ page }) => {
  await mockConfig(page);
});

test('the target sees a ring and a Targeted chip on their own concealed card', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({
    activePlayerId: BOB,
    interrupt: interrupt(),
    aliceHand: [appeal],
    interruptCard: { cardId: aliceCards[0].id, card: aliceCards[0], revealed: false }
  }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  const slot = page.locator(`[data-table-owner="${ALICE}"][data-card-id="${aliceCards[0].id}"]`);
  await expect(slot).toBeVisible();
  await expect(slot.getByTestId('targeted-card')).toHaveText('Targeted');

  // Its owner sees the face of their own concealed card.
  const card = slot.getByLabel('Lavender 1 circle');
  await expect(card).toHaveCSS('box-shadow', /4px/);
  // The label is not the only signal: it overlaps the bottom edge of the card.
  const slotBox = await slot.boundingBox();
  const chipBox = await slot.getByTestId('targeted-card').boundingBox();
  expect(slotBox).not.toBeNull();
  expect(chipBox).not.toBeNull();
  expect(chipBox!.y).toBeLessThan(slotBox!.y + slotBox!.height);
  expect(chipBox!.y + chipBox!.height).toBeGreaterThan(slotBox!.y + slotBox!.height - 8);
});

test('a target without APPEAL sees only the waiting notice, still with the highlight', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({
    activePlayerId: BOB,
    interrupt: interrupt(),
    aliceHand: [],
    interruptCard: { cardId: aliceCards[0].id, card: aliceCards[0], revealed: false }
  }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await expect(page.getByTestId('interrupt-waiting')).toBeVisible();
  await expect(page.getByTestId('appeal-prompt')).toHaveCount(0);
  await expect(page.getByTestId('targeted-card')).toHaveText('Targeted');
});

test('the STEAL actor never receives the target highlight or card identity', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({
    viewerId: BOB,
    hostId: ALICE,
    activePlayerId: BOB,
    interrupt: interrupt(),
    aliceHand: []
  }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);

  await expect(page.getByTestId('targeted-card')).toHaveCount(0);
  await expect(page.getByTestId('appeal-prompt')).toHaveCount(0);
  await expect(page.getByTestId('interrupt-waiting')).toBeVisible();
  // The concealed target's identity is absent from the actor's table view.
  await expect(page.locator(`[data-table-owner="${ALICE}"][data-card-id="${aliceCards[0].id}"] [aria-label="Concealed card"]`)).toBeVisible();
  await expect(page.getByLabel('Lavender 1 circle')).toHaveCount(0);
});

test('a spectator sees the waiting notice but no targeted card or prompt', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', spectatorView({
    activePlayerId: BOB,
    interrupt: interrupt()
  }));
  await page.goto('/game/ABCD');
  await expect(page.getByText('Spectating — you see the same public view as opponents.')).toBeVisible();

  await expect(page.getByTestId('targeted-card')).toHaveCount(0);
  await expect(page.getByTestId('appeal-prompt')).toHaveCount(0);
  await expect(page.getByTestId('interrupt-waiting')).toBeVisible();
});

test('a blind STEAL card is visible only to its target across all viewer roles', async ({ browser }) => {
  const thirdPlayer = '00000000-0000-4000-8000-000000000100';
  const viewers = [
    { id: ALICE, role: 'target' },
    { id: BOB, role: 'actor' },
    { id: thirdPlayer, role: 'uninvolved' },
    { id: VIEWER, role: 'spectator' }
  ] as const;

  for (const viewer of viewers) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await mockConfig(page);
    const viewOptions = {
      viewerId: viewer.id,
      extraPlayers: viewer.role === 'uninvolved' ? 1 : 0,
      activePlayerId: BOB,
      interrupt: interrupt(),
      aliceHand: viewer.role === 'target' ? [appeal] : [],
      interruptCard: viewer.role === 'target'
        ? { cardId: aliceCards[0].id, card: aliceCards[0], revealed: false }
        : null
    };
    const view = viewer.role === 'spectator'
      ? spectatorView(viewOptions)
      : playerView(viewOptions);
    await mockRoomSocket(page, 'ABCD', view);
    await page.goto('/game/ABCD');

    if (viewer.role === 'spectator') {
      await expect(page.getByText('Spectating — you see the same public view as opponents.')).toBeVisible();
    } else {
      await waitForOwnTable(page, /Your Table/);
    }

    if (viewer.role === 'target') {
      await expect(page.locator(`[data-table-owner="${ALICE}"][data-card-id="${aliceCards[0].id}"]`).getByTestId('targeted-card'))
        .toHaveText('Targeted');
      const appealPrompt = page.getByTestId('appeal-prompt');
      await expect(appealPrompt).toBeVisible();
      await expect(appealPrompt.getByLabel('Lavender 1 circle')).toBeVisible();
    } else {
      await expect(page.getByTestId('targeted-card')).toHaveCount(0);
      await expect(page.getByTestId('appeal-prompt')).toHaveCount(0);
      await expect(page.getByLabel('Lavender 1 circle')).toHaveCount(0);
    }
    await context.close();
  }
});

import { test } from '@playwright/test';
import {
  ALICE,
  BOB,
  VIEWER,
  aliceCards,
  mockConfig,
  mockRoomSocket,
  normalCard,
  playerView,
  waitForOwnTable
} from './fixtures';

const out = (name: string) => `../reference/actual-${name}.png`;

test.use({ viewport: { width: 1280, height: 900 } });

const hand = [
  { id: 'hand-1', kind: 'normal' as const, color: 'rose' as const, number: 4 as const, shape: 'triangle' as const },
  { id: 'hand-2', kind: 'action' as const, action: 'APPEAL' as const }
];

test.beforeEach(async ({ page }) => {
  await mockConfig(page);
});

test('capture your turn popup', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({ activePlayerId: ALICE, aliceHand: hand }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);
  await page.getByTestId('your-turn-popup').waitFor();
  await page.screenshot({ path: out('01-your-turn-full') });
  await page.getByTestId('your-turn-popup').screenshot({ path: out('01-your-turn-popup') });
});

test('capture appeal prompt', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({
    activePlayerId: BOB,
    aliceHand: [hand[1]],
    interrupt: {
      id: 'interrupt-1',
      kind: 'STEAL',
      actorId: BOB,
      targetId: ALICE,
      targetCardId: aliceCards[0].id,
      endsAt: Date.now() + 27_000
    },
    interruptCard: { cardId: aliceCards[0].id, card: aliceCards[0], revealed: false }
  }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);
  await page.getByTestId('appeal-prompt').waitFor();
  await page.screenshot({ path: out('02-appeal-full') });
  await page.getByTestId('appeal-prompt').screenshot({ path: out('02-appeal-prompt') });
});

test('capture end turn button and counts', async ({ page }) => {
  await page.addInitScript(({ key }) => sessionStorage.setItem(key, '1'), {
    key: `3eal-your-turn:ABCD:${ALICE}`
  });
  await mockRoomSocket(page, 'ABCD', playerView({ activePlayerId: ALICE, aliceHand: hand }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);
  await page.screenshot({ path: out('03-end-turn-full') });
  await page.getByRole('button', { name: 'End turn' }).locator('xpath=ancestor::div[contains(@class,"flex-wrap")][1]').screenshot({ path: out('03-hand-dock') });
});

test('capture players overlay menu and confirm', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({
    hostId: ALICE,
    activePlayerId: ALICE,
    aliceHand: hand,
    spectators: [{ id: VIEWER, name: 'Viewer', connected: true }]
  }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);
  await page.getByRole('button', { name: 'Players' }).click();
  const overlay = page.getByRole('dialog', { name: 'Players' });
  await overlay.waitFor();
  await overlay.getByRole('button', { name: 'Actions for Bob' }).click();
  await page.getByRole('menu', { name: 'Actions for Bob' }).waitFor();
  await page.screenshot({ path: out('04-players-menu-full') });
  await overlay.screenshot({ path: out('04-players-menu') });
  await page.getByRole('menu', { name: 'Actions for Bob' }).getByRole('menuitem', { name: /Make host/ }).click();
  await page.screenshot({ path: out('04-players-confirm-full') });
  await overlay.screenshot({ path: out('04-players-confirm') });
});

test('capture lobby rules button', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({
    phase: 'lobby',
    activePlayerId: null,
    hostId: ALICE
  }));
  await page.goto('/lobby/ABCD');
  await page.getByRole('heading', { name: 'Players (2)' }).waitFor();
  await page.screenshot({ path: out('05-lobby-full') });
  await page.locator('header').screenshot({ path: out('05-lobby-header') });
});

test('capture targeted card highlight and paused board', async ({ page }) => {
  await page.addInitScript(({ key }) => sessionStorage.setItem(key, '1'), {
    key: `3eal-your-turn:ABCD:${ALICE}`
  });
  await mockRoomSocket(page, 'ABCD', playerView({
    activePlayerId: BOB,
    aliceHand: [],
    interrupt: {
      id: 'interrupt-1',
      kind: 'STEAL',
      actorId: BOB,
      targetId: ALICE,
      targetCardId: aliceCards[0].id,
      endsAt: Date.now() + 27_000
    },
    interruptCard: { cardId: aliceCards[0].id, card: aliceCards[0], revealed: false }
  }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);
  await page.getByTestId('targeted-card').waitFor();
  await page.screenshot({ path: out('06-targeted-full') });
  await page.getByRole('heading', { name: 'Your Table' }).locator('xpath=ancestor::section[1]').screenshot({ path: out('06-targeted-card') });
});

test('capture paused board without counts', async ({ page }) => {
  await page.addInitScript(({ key }) => sessionStorage.setItem(key, '1'), {
    key: `3eal-your-turn:ABCD:${ALICE}`
  });
  await mockRoomSocket(page, 'ABCD', playerView({
    activePlayerId: ALICE,
    paused: true,
    pauseRemaining: { turn: 30_000, interrupt: null },
    aliceHand: [hand[0], normalCard('hand-3', 6)]
  }));
  await page.goto('/game/ABCD');
  await waitForOwnTable(page, /Your Table/);
  await page.screenshot({ path: out('05-paused-counts-removed') });
});

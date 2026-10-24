import { expect, test, type Page } from '@playwright/test';
import { mockConfig, mockRoomSocket, playerView } from './fixtures';

const RULES = { name: 'Game Rules' } as const;

async function openRulesFromHome(page: Page): Promise<string> {
  await mockConfig(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Rules' }).click();
  const dialog = page.getByRole('dialog', RULES);
  await expect(dialog).toBeVisible();
  return (await dialog.innerText()).trim();
}

async function openRulesInGame(page: Page): Promise<string> {
  await mockConfig(page);
  await mockRoomSocket(page, 'ABCD', playerView());
  await page.goto('/game/ABCD');
  await expect(page.getByRole('heading', { name: /Your Table/ })).toBeVisible();
  await page.getByRole('button', { name: 'Rules' }).click();
  const dialog = page.getByRole('dialog', RULES);
  await expect(dialog).toBeVisible();
  return (await dialog.innerText()).trim();
}

test('Home and in-game open the same visual Rules overlay with the same content', async ({ page }) => {
  const fromHome = await openRulesFromHome(page);
  const fromGame = await openRulesInGame(page);
  expect(fromGame).toBe(fromHome);
});

test('the Rules overlay shows the visual sections, set examples, and corrected action-card rule', async ({ page }) => {
  await mockConfig(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Rules' }).click();
  const dialog = page.getByRole('dialog', RULES);
  await expect(dialog).toBeVisible();

  // The four valid-set panels name every pattern; the non-set counter-example
  // was removed.
  for (const chip of ['Same Color (ex. All Rose)', 'Same Number (ex. All 5)', 'Same Shape (ex. All pentagons)', 'Wild Card (ex. TEAL = 4)']) {
    await expect(dialog.getByText(chip, { exact: true })).toBeVisible();
  }
  await expect(dialog.getByText('Nothing matches', { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('group', { name: /set:/i })).toHaveCount(4);
  // Each card type is named above its example card.
  for (const name of ['Normal', 'Teal Wild', 'Action']) {
    await expect(dialog.getByText(name, { exact: true })).toBeVisible();
  }
  // Real card components are used for the examples.
  await expect(dialog.getByLabel('Coral 1 circle').first()).toBeVisible();
  await expect(dialog.getByLabel('TEAL wild card').first()).toBeVisible();
  // The corrected rule: every unused Action card persists across turns.
  await expect(dialog.getByText('Action cards stay in Hand until played', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Other Hand cards return to the deck', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Build 3 sets of 3 on your Table.', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Eye = everyone can see it.', { exact: true })).toBeVisible();
  await expect(dialog.getByText('60s per turn', { exact: true })).toBeVisible();
  // Accessibility: every example group has a spoken description.
  await expect(dialog.getByRole('group', { name: /Same colour set/ })).toBeVisible();

  // The old wall-of-text wording is gone everywhere on the page.
  await expect(page.getByText('Unplayed APPEAL')).toHaveCount(0);
  await expect(page.getByText('Zones and privacy')).toHaveCount(0);
});

test('Escape closes the Rules overlay and returns focus to its trigger', async ({ page }) => {
  await mockConfig(page);
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Rules' });
  await trigger.click();
  await expect(page.getByRole('dialog', RULES)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', RULES)).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('the Rules overlay fits a 360px viewport without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await mockConfig(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Rules' }).click();
  const dialog = page.getByRole('dialog', RULES);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Wild Card (ex. TEAL = 4)', { exact: true })).toBeVisible();
  await expect(dialog.getByText('60s per turn', { exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

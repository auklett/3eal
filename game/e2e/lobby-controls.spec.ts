import { expect, test } from '@playwright/test';
import { ALICE, BOB, mockConfig, mockRoomSocket, playerView } from './fixtures';

const LOBBY = { phase: 'lobby' as const, activePlayerId: null, reveal: false };

test.beforeEach(async ({ page }) => {
  await mockConfig(page);
});

test('the role control is a keyboard-operable segmented radiogroup', async ({ page }) => {
  const sent: string[] = [];
  await mockRoomSocket(page, 'ABCD', playerView(LOBBY), sent);
  await page.goto('/lobby/ABCD');
  await expect(page.getByRole('heading', { name: 'Players (2)' })).toBeVisible();

  const group = page.getByRole('radiogroup', { name: 'Play as' });
  const player = group.getByRole('radio', { name: 'Player' });
  const spectator = group.getByRole('radio', { name: 'Spectator' });
  await expect(player).toHaveAttribute('aria-checked', 'true');
  await expect(spectator).toHaveAttribute('aria-checked', 'false');

  await player.focus();
  await page.keyboard.press('ArrowRight');
  await expect(spectator).toBeFocused();
  expect(sent.some((message) => message.includes('"t":"setRole"') && message.includes('"role":"spectator"'))).toBe(true);

  await spectator.click();
  expect(sent.filter((message) => message.includes('"t":"setRole"')).length).toBeGreaterThanOrEqual(2);
});

test('the timer slider and numeric field clamp, commit on blur, and revert invalid text', async ({ page }) => {
  const sent: string[] = [];
  let current = playerView(LOBBY);
  await mockRoomSocket(page, 'ABCD', () => current, sent, undefined, (message, socket) => {
    if (message['t'] !== 'setTurnTimer') return;
    current = playerView({ ...LOBBY, turnDurationSeconds: Number(message['seconds']) });
    socket.send(JSON.stringify({ t: 'view', view: current }));
  });
  await page.goto('/lobby/ABCD');
  await expect(page.getByRole('heading', { name: 'Players (2)' })).toBeVisible();

  const input = page.getByLabel('Turn timer in seconds');
  await expect(input).toHaveValue('60');
  await input.fill('999');
  await input.blur();
  await expect(input).toHaveValue('180');
  expect(sent.some((message) => message.includes('"t":"setTurnTimer"') && message.includes('"seconds":180'))).toBe(true);

  // Empty text never sends; it falls back to the last authoritative value.
  const before = sent.filter((message) => message.includes('"t":"setTurnTimer"')).length;
  await input.fill('');
  await input.blur();
  await expect(input).toHaveValue('180');
  expect(sent.filter((message) => message.includes('"t":"setTurnTimer"')).length).toBe(before);
});

test('a rejected timer update reverts and shows the server error inline', async ({ page }) => {
  const sent: string[] = [];
  await mockRoomSocket(page, 'ABCD', playerView(LOBBY), sent, undefined, (message, socket) => {
    if (message['t'] !== 'setTurnTimer') return;
    socket.send(JSON.stringify({ t: 'error', code: 'rejected', message: 'Turn timer must be between 15 and 180 seconds' }));
  });
  await page.goto('/lobby/ABCD');
  await expect(page.getByRole('heading', { name: 'Players (2)' })).toBeVisible();

  const input = page.getByLabel('Turn timer in seconds');
  await input.fill('120');
  await input.blur();
  await expect(page.getByTestId('timer-error')).toHaveText('Turn timer must be between 15 and 180 seconds');
  await expect(input).toHaveValue('60');
});

test('hosts with more than ten players cannot start and see the reason', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({ ...LOBBY, extraPlayers: 9 }));
  await page.goto('/lobby/ABCD');
  await expect(page.getByRole('heading', { name: 'Players (11)' })).toBeVisible();

  await expect(page.getByRole('button', { name: 'Start game' })).toBeDisabled();
  await expect(page.getByText('Up to 10 players can start a game. Move extras to Spectator.')).toBeVisible();
});

test('the host starts with two players and sees the timer controls', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView(LOBBY));
  await page.goto('/lobby/ABCD');
  await expect(page.getByRole('button', { name: 'Start game' })).toBeEnabled();
  await expect(page.getByLabel('Turn timer in seconds')).toBeVisible();
});

test('a non-host sees no host controls', async ({ page }) => {
  await mockRoomSocket(page, 'ABCD', playerView({ ...LOBBY, hostId: BOB }));
  await page.goto('/lobby/ABCD');
  await expect(page.getByRole('heading', { name: 'Players (2)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start game' })).toHaveCount(0);
  await expect(page.getByLabel('Turn timer in seconds')).toHaveCount(0);
});

test('Leave room sends leaveRoom and goes home after confirmation', async ({ page }) => {
  const sent: string[] = [];
  await mockRoomSocket(page, 'ABCD', playerView(LOBBY), sent, undefined, (message, socket) => {
    if (message['t'] !== 'leaveRoom') return;
    socket.send(JSON.stringify({ t: 'left' }));
    socket.close();
  });
  await page.goto('/lobby/ABCD');
  await expect(page.getByRole('heading', { name: 'Players (2)' })).toBeVisible();

  await page.getByRole('button', { name: 'Leave room' }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  expect(sent.some((message) => message.includes('"t":"leaveRoom"'))).toBe(true);
});

// Keep the fixture import honest: ALICE hosts the default lobby.
void ALICE;

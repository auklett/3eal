import { expect, type Page } from '@playwright/test';
import type { Card } from '@3eal/engine';
import type { PublicSlot, ServerMsg, View } from '../src/shared/protocol';

export const ALICE = '00000000-0000-4000-8000-000000000001';
export const BOB = '00000000-0000-4000-8000-000000000002';
export const VIEWER = '00000000-0000-4000-8000-000000000003';

export function normalCard(id: string, number: 1 | 2 | 3 | 4 | 5 | 6 | 7 = 1): Card {
  return {
    id,
    kind: 'normal',
    color: number % 2 === 0 ? 'rose' : 'periwinkle',
    number,
    shape: number % 2 === 0 ? 'triangle' : 'circle'
  };
}

export const aliceCards: Card[] = [normalCard('alice-1', 1), normalCard('alice-2', 2), normalCard('alice-3', 3)];
export const bobCards: Card[] = [normalCard('bob-1', 1), normalCard('bob-2', 2), normalCard('bob-3', 3)];

export interface InterruptFixture {
  id: string;
  kind: 'CONCEAL' | 'STEAL' | 'REVEAL';
  actorId: string;
  targetId: string;
  targetCardId: string;
  endsAt: number | null;
}

export interface ViewOptions {
  phase?: 'lobby' | 'playing' | 'finished';
  hostId?: string;
  activePlayerId?: string | null;
  paused?: boolean;
  pauseRemaining?: { turn: number | null; interrupt: number | null } | null;
  interrupt?: InterruptFixture | null;
  aliceTable?: PublicSlot[];
  bobTable?: PublicSlot[];
  aliceHand?: Card[];
  winnerId?: string | null;
  winningSets?: string[][] | null;
  reveal?: boolean;
}

function concealed(cards: Card[]): PublicSlot[] {
  return cards.map((card) => ({ state: 'concealed', cardId: card.id }));
}

export function playerView(options: ViewOptions = {}): View {
  const phase = options.phase ?? 'playing';
  const aliceTable = options.aliceTable ?? concealed(aliceCards);
  const bobTable = options.bobTable ?? concealed(bobCards);
  const activePlayerId = options.activePlayerId === undefined ? BOB : options.activePlayerId;
  const reveal = options.reveal ?? phase === 'finished';

  const data: Record<string, unknown> = {
    roomCode: 'ABCD',
    phase,
    hostId: options.hostId ?? ALICE,
    players: [
      { id: ALICE, name: 'Alice', connected: true, away: false, table: aliceTable },
      { id: BOB, name: 'Bob', connected: true, away: false, table: bobTable }
    ],
    spectators: [],
    spectatorCount: 0,
    activePlayerId,
    turnEndsAt: phase === 'playing' && !options.paused ? Date.now() + 60_000 : null,
    turnRemainingMs: null,
    turnDurationSeconds: 60,
    turnNumber: 1,
    paused: options.paused ?? false,
    pauseRemaining: options.pauseRemaining ?? null,
    interrupt: options.interrupt ?? null,
    lastInterruptResult: null,
    deckCount: 200,
    winnerId: options.winnerId === undefined ? (phase === 'finished' ? ALICE : null) : options.winnerId,
    winningSets: options.winningSets ?? null,
    you: {
      id: ALICE,
      hand: options.aliceHand ?? [],
      concealedOwn: Object.fromEntries(aliceCards.map((card) => [card.id, card]))
    }
  };

  if (reveal) {
    data['reveal'] = {
      players: {
        [ALICE]: { table: aliceCards, hand: [] },
        [BOB]: { table: bobCards, hand: [] }
      },
      deck: []
    };
  }

  return { role: 'player', data } as unknown as View;
}

export async function mockConfig(page: Page): Promise<void> {
  await page.route('**/api/config', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ turnstileSiteKey: '', webAnalyticsToken: '' })
  }));
}

type MockSocket = { send: (message: string) => void; close: () => void };

/** Serves a mocked game socket, replying to every `join` with the given view. */
export async function mockRoomSocket(
  page: Page,
  roomCode: string,
  view: View,
  sent: string[] = [],
  onJoin?: (webSocket: MockSocket) => void,
  onClientMessage?: (message: Record<string, unknown>, webSocket: MockSocket) => void
): Promise<void> {
  await page.routeWebSocket(new RegExp(`/api/rooms/${roomCode}/ws$`), (webSocket) => {
    webSocket.onMessage((message) => {
      if (typeof message !== 'string') return;
      sent.push(message);
      let parsed: unknown;
      try {
        parsed = JSON.parse(message);
      } catch {
        return;
      }
      if (typeof parsed !== 'object' || parsed === null) return;
      const parsedMessage = parsed as Record<string, unknown>;
      if (parsedMessage['t'] === 'join') {
        const response: ServerMsg = { t: 'view', view };
        webSocket.send(JSON.stringify(response));
        onJoin?.(webSocket);
        return;
      }
      onClientMessage?.(parsedMessage, webSocket);
    });
  });
}

/** Card IDs shown in the viewer's own Table, in slot order. */
export async function ownSlotIds(page: Page): Promise<string[]> {
  return page.locator(`[data-table-owner="${ALICE}"]`).evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLElement).dataset['cardId'] ?? ''));
}

export async function waitForOwnTable(page: Page, name: RegExp | string): Promise<void> {
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

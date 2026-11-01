import { expect, test } from '@playwright/test';
import {
  countCompleteSets,
  findWinningPartition,
  type TableCard
} from '@3eal/engine';
import {
  ServerMsgSchema,
  type ClientMsg,
  type ServerMsg,
  type View
} from '../src/shared/protocol';

type PlayerView = Extract<View, { role: 'player' }>;
type SocketEvent = { sequence: number; message: ServerMsg };

class RoomSocket {
  readonly socket: WebSocket;
  private readonly events: SocketEvent[] = [];
  private readonly waiters = new Set<{
    after: number;
    predicate: (message: ServerMsg) => boolean;
    resolve: (message: ServerMsg) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private openError: Error | null = null;
  sequence = 0;
  view: View | null = null;

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.addEventListener('message', (event) => {
      let payload: unknown;
      try {
        payload = JSON.parse(String(event.data)) as unknown;
      } catch {
        this.rejectWaiters(new Error('Worker sent invalid JSON over WebSocket'));
        return;
      }
      const parsed = ServerMsgSchema.safeParse(payload);
      if (!parsed.success) {
        this.rejectWaiters(new Error('Worker sent a message outside the server protocol'));
        return;
      }
      const message = parsed.data;
      const entry = { sequence: ++this.sequence, message };
      this.events.push(entry);
      if (message.t === 'view') this.view = message.view;
      for (const waiter of this.waiters) {
        if (entry.sequence <= waiter.after || !waiter.predicate(message)) continue;
        clearTimeout(waiter.timer);
        this.waiters.delete(waiter);
        waiter.resolve(message);
      }
    });
    this.socket.addEventListener('error', () => {
      this.openError = new Error('WebSocket connection to the local Worker failed');
      this.rejectWaiters(this.openError);
    });
  }

  async waitForOpen(): Promise<void> {
    if (this.socket.readyState === WebSocket.OPEN) return;
    if (this.openError) throw this.openError;
    await new Promise<void>((resolve, reject) => {
      this.socket.addEventListener('open', () => resolve(), { once: true });
      this.socket.addEventListener('error', () => reject(this.openError ?? new Error('WebSocket open failed')), { once: true });
    });
  }

  send(message: ClientMsg): void {
    this.socket.send(JSON.stringify(message));
  }

  waitForMessage(
    after: number,
    predicate: (message: ServerMsg) => boolean,
    timeoutMs = 10_000
  ): Promise<ServerMsg> {
    const existing = this.events.find((event) =>
      event.sequence > after && predicate(event.message)
    );
    if (existing) return Promise.resolve(existing.message);
    if (this.openError) return Promise.reject(this.openError);
    return new Promise((resolve, reject) => {
      const waiter = {
        after,
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new Error('Timed out waiting for a Worker WebSocket message'));
        }, timeoutMs)
      };
      this.waiters.add(waiter);
    });
  }

  async waitForView(
    after: number,
    predicate: (view: View) => boolean,
    timeoutMs = 10_000
  ): Promise<View> {
    const message = await this.waitForMessage(
      after,
      (candidate) => candidate.t === 'view' && predicate(candidate.view),
      timeoutMs
    );
    if (message.t !== 'view') throw new Error('Expected a Worker view');
    return message.view;
  }

  async close(): Promise<void> {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      this.socket.addEventListener('close', () => resolve(), { once: true });
      this.socket.close(1000, 'test disconnect');
    });
  }

  private rejectWaiters(error: Error): void {
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.waiters.clear();
  }
}

function playerView(view: View | null): PlayerView {
  if (!view || view.role !== 'player') throw new Error('Expected the participant player view');
  return view;
}

function currentCards(view: PlayerView): TableCard[] {
  const player = view.data.players.find((candidate) => candidate.id === view.data.you.id);
  if (!player) throw new Error('The active player is missing from the view');
  return player.table.map((slot) => {
    if (slot.state === 'revealed') return slot.card;
    const card = view.data.you.concealedOwn[slot.cardId];
    if (!card) throw new Error('The own concealed card is missing from the private view');
    return card;
  });
}

function choosePlacement(view: PlayerView): { card: TableCard; slot: number } | null {
  const table = currentCards(view);
  const candidates = view.data.you.hand.filter(
    (card): card is TableCard => card.kind === 'normal' || card.kind === 'teal'
  );
  if (table.length < 9) {
    const card = candidates[0];
    if (!card) return null;
    return { card, slot: table.length };
  }

  let best: { card: TableCard; slot: number; score: number } | null = null;
  for (const card of candidates) {
    for (let slot = 0; slot < table.length; slot += 1) {
      const proposed = table.map((current, index) => index === slot ? card : current);
      if (findWinningPartition(proposed)) return { card, slot };
      const score = countCompleteSets(proposed);
      if (!best || score > best.score) best = { card, slot, score };
    }
  }
  return best;
}

function isFinished(view: View | null): boolean {
  return view?.data.phase === 'finished';
}

async function waitForViews(
  sockets: RoomSocket[],
  cursors: number[],
  predicate: (view: View) => boolean = () => true
): Promise<View[]> {
  return Promise.all(sockets.map((socket, index) =>
    socket.waitForView(cursors[index] ?? socket.sequence, predicate)
  ));
}

test('a guest marked away rejoins after a Worker reset and host lobby reconnect', async ({ browser, page }) => {
  test.setTimeout(240_000);

  const roomResponse = await fetch('http://127.0.0.1:8790/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Host' })
  });
  expect(roomResponse.status).toBe(201);
  const room = await roomResponse.json() as { roomCode: string; sessionId: string };
  const roomUrl = `ws://127.0.0.1:8790/api/rooms/${room.roomCode}/ws`;
  const host = new RoomSocket(roomUrl);
  const guest = new RoomSocket(roomUrl);
  const guestSessionId = crypto.randomUUID();
  let guestContext: Awaited<ReturnType<typeof browser.newContext>> | null = null;
  let observer: RoomSocket | null = null;

  try {
    await Promise.all([host.waitForOpen(), guest.waitForOpen()]);
    host.send({ t: 'join', name: 'Host', sessionId: room.sessionId, role: 'player' });
    guest.send({ t: 'join', name: 'Guest', sessionId: guestSessionId, role: 'player' });
    await Promise.all([
      host.waitForView(0, (view) => view.role === 'player'),
      guest.waitForView(0, (view) => view.role === 'player')
    ]);

    let cursor = host.sequence;
    host.send({ t: 'setTurnTimer', seconds: 180 });
    await waitForViews([host, guest], [cursor, guest.sequence]);
    cursor = host.sequence;
    host.send({ t: 'start' });
    await waitForViews([host, guest], [cursor, guest.sequence], (view) => view.data.phase === 'playing');

    let turnCount = 0;
    while (!isFinished(host.view) && turnCount < 250) {
      const hostView = playerView(host.view);
      const activeId = hostView.data.activePlayerId;
      if (!activeId) throw new Error('The game has no active player');
      const actor = activeId === hostView.data.you.id ? host : guest;
      const actorView = playerView(actor.view);
      const actorCursor = actor.sequence;
      const other = actor === host ? guest : host;
      const otherCursor = other.sequence;

      if (actor === host) {
        const placement = choosePlacement(actorView);
        if (placement) {
          actor.send({ t: 'place', cardId: placement.card.id, slot: placement.slot });
          await waitForViews([host, guest], [actorCursor, otherCursor]);
        }
      }

      if (!isFinished(host.view)) {
        const endTurnCursor = actor.sequence;
        const otherEndTurnCursor = other.sequence;
        actor.send({ t: 'endTurn' });
        await waitForViews([host, guest], [actor === host ? endTurnCursor : otherEndTurnCursor, actor === host ? otherEndTurnCursor : endTurnCursor]);
      }
      turnCount += 1;
    }
    expect(isFinished(host.view), 'the actual Worker game should reach a win').toBe(true);

    const guestViewBeforeDisconnect = playerView(guest.view);
    const oldGuestId = guestViewBeforeDisconnect.data.you.id;
    const disconnectedCursor = host.sequence;
    await guest.close();
    const awayView = await host.waitForView(
      disconnectedCursor,
      (view) => view.role === 'player' &&
        view.data.players.some((player) => player.id === oldGuestId && !player.connected),
      10_000
    );
    const markedAway = await host.waitForView(
      host.sequence,
      (view) => view.role === 'player' &&
        view.data.players.some((player) => player.id === oldGuestId && player.away),
      80_000
    );
    expect(awayView.data.phase).toBe('finished');
    expect(markedAway.data.players.find((player) => player.id === oldGuestId)?.away).toBe(true);

    const originalHostId = playerView(host.view).data.you.id;
    const returnCursor = host.sequence;
    host.send({ t: 'returnToLobby' });
    const lobbyView = playerView(await host.waitForView(
      returnCursor,
      (view) => view.role === 'player' && view.data.phase === 'lobby'
    ));
    expect(lobbyView.data.hostId).toBe(originalHostId);
    expect(lobbyView.data.players.map((player) => player.id)).toEqual([originalHostId]);

    await page.addInitScript(({ code, sessionId }) => {
      sessionStorage.setItem(`3eal-session:${code}`, sessionId);
      sessionStorage.setItem('3eal-player-name', 'Host');
    }, { code: room.roomCode, sessionId: room.sessionId });
    await page.goto(`/lobby/${room.roomCode}`);
    await expect(page).toHaveURL(new RegExp(`/lobby/${room.roomCode}$`), { timeout: 10_000 });
    await expect(page).toHaveURL(new RegExp(`/lobby/${room.roomCode}$`), { timeout: 10_000 });
    await expect(page.getByText('Host controls')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Players (1)' })).toBeVisible();

    guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await guestPage.addInitScript(({ code, sessionId }) => {
      sessionStorage.setItem(`3eal-session:${code}`, sessionId);
      sessionStorage.setItem('3eal-player-name', 'Guest');
    }, { code: room.roomCode, sessionId: guestSessionId });
    await guestPage.goto(`/lobby/${room.roomCode}`);
    await expect(guestPage.getByRole('heading', { name: 'Players (2)' })).toBeVisible({ timeout: 10_000 });
    await expect(guestPage.getByRole('list').getByText('Guest', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Players (2)' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('list').getByText('Guest', { exact: true })).toBeVisible();

    observer = new RoomSocket(roomUrl);
    await observer.waitForOpen();
    observer.send({ t: 'join', name: 'Observer', sessionId: crypto.randomUUID(), role: 'spectator' });
    const observerView = await observer.waitForView(0, (view) => view.role === 'spectator');
    const newGuest = observerView.data.players.find((player) => player.name === 'Guest');
    expect(newGuest).toBeDefined();
    expect(newGuest?.id).not.toBe(oldGuestId);
    expect(observerView.data.hostId).toBe(originalHostId);
    expect(observerView.data.players.find((player) => player.id === originalHostId)?.connected).toBe(true);
  } finally {
    await Promise.all([host.close(), guest.close(), observer?.close()]);
    await guestContext?.close();
  }
});

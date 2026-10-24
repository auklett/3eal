# 3EAL — Tech Stack & Architecture

## Stack

- **Client:** React 19, TypeScript, Vite, Tailwind CSS 4
- **Shared game rules:** Pure TypeScript npm workspace at `game/packages/engine`
- **Realtime/server:** Cloudflare Worker and one SQLite-backed Durable Object (`GameRoom`) per room
- **Transport:** WebSockets with the Hibernation API, full filtered snapshots, and alarms for every server deadline
- **Validation:** Zod protocol schemas, Vitest, fast-check, Playwright, OxLint, TypeScript, GitHub Actions
- **Hosting:** Workers static assets and Worker API on the same origin
- **Anti-abuse/analytics:** Cloudflare Turnstile on room creation and optional Cloudflare Web Analytics

Firebase, Firestore, anonymous authentication, Pages Functions, and Google Cloud service accounts have been removed. There are no accounts; the room code and case-insensitively unique player name identify participants.

## Important files

```text
game/
├── packages/engine/src/     # seeded pure rules, deck, partitions, room reducer
├── src/shared/protocol.ts   # Zod-validated client/server messages and filtered views
├── src/hooks/useRoom.ts     # reconnecting WebSocket client and optimistic state
├── src/logic/createRoom.ts  # room-code validation, exists probe, atomic create-with-code
├── src/logic/tableLayout.ts # local-only Table rearrangement merge/move helpers
├── src/pages/               # Home, Worker lobby, Worker game board
├── worker/index.ts          # same-origin API/static-assets routing, room existence, and room creation
├── worker/gameRoom.ts       # SQLite persistence, Hibernation API, alarms, views
├── worker/views.ts          # per-socket privacy filtering
├── wrangler.toml            # Worker, assets, Turnstile vars, first SQLite migration
└── playwright.config.ts     # browser-level hidden-information coverage
```

## Authoritative state and privacy

Each room's Durable Object stores the shuffled deck, hands, Tables, action/interrupt state, seats, and rejoin requests in one SQLite row. A validated action reduces the pure room state, persists it, advances the earliest alarm, and broadcasts full snapshots. The Worker never serializes the seed, deck order, opponents' hands, or concealed card identities into public views. Players receive only their own hand and concealed cards in a separate private field. Spectators receive the same public snapshot as opponents. Each player's three starting Table cards are dealt revealed, so their identities are public to everyone; only cards concealed later (a card placed from Hand, or one hidden by CONCEAL) have private identities. Each player also starts with one CONCEAL, STEAL, REVEAL, and APPEAL in their private Hand.

Rejoin requests are serialized only into the host's private `you.rejoinRequests` list. Every other player view and every spectator view gets an empty list, so the host notice strip derives from the same authoritative snapshots as the rest of the board.

Card IDs are seeded-random 128-bit values, independent of card descriptions. The deck seed comes from the Worker and stays in Durable Object state. At game end the public snapshot reveals all cards and adds the three winning sets (the valid partition the engine found), so every client can render the same Game Over grouping.

Room lookup and creation are separate concerns. `GET /api/rooms/:code/exists` instantiates the Durable Object to answer without writing any state (a missing room must not be created by a mere lookup). `POST /api/rooms` optionally accepts a caller-supplied `roomCode`; creation is a single atomic step that returns `409` if that code is already taken, so a player who typed a code never races another creator.

## Timers and lifecycle

- Interrupts last at most 30 seconds and end on the first APPEAL, all APPEAL holders passing, or expiry.
- The 60-second default turn timer pauses during an interrupt; the host sets 15–180 seconds in the lobby.
- The host may pause and resume at any time during play by sending the `pause` / `resume` messages. Pausing stores each timer's remaining time and freezes every server deadline (turn, interrupt, away, and rejoin-request); no game action is accepted until the host resumes, at which point each deadline is recomputed as `now + remaining` and the alarm is reset to the earliest.
- A disconnected seat is retained; after 60 seconds away its current/future turns are skipped.
- A game starts only with 2–10 players. The cap matches the ten copies of each Action card; the engine deals one of each action plus three revealed Table cards per player from the 218-card deck without reshuffling the remainder.
- The persisted row schema supplies Zod defaults for fields added after the first release (`paused` → `false`, `pauseRemaining` → `null`, `winningSets` → `null`, `left` → `false`, and `lastInterruptResult.resolvedAt` → `0`), so rooms persisted before those features still load.
- Host approval is required for a new session to reclaim a player seat. Pending requesters receive no view before approval.
- The room's single alarm is always set to the earliest interrupt, turn, away, or rejoin-request deadline — except while paused, when there is no pending deadline and no alarm is scheduled. Server timers do not use `setTimeout`.

## End of game and room reset

`returnToLobby` and `leaveRoom` are engine helpers rather than `RoomIntent` cases because the Worker supplies the fresh seed and may delete the room:

- **Return to Lobby** is host-only and valid only after the game ends. The Worker passes `crypto.randomUUID()` as the new seed, the engine resets directly to the lobby, and the normal `view` broadcast moves every client to `/lobby/:code`. The reset keeps present players/spectators, the room code, and the timer setting, while clearing cards, turns, pause, winner, winning sets, and rejoin requests. Disconnected, away, left, and kicked members are dropped; their names and default numbers become available again.
- **Leave Lobby** is available in the lobby and after the game ends, never during play. The engine removes a non-winner immediately and retains a leaving winner as a `left` record until the reset so Game Over remains renderable. The Worker sends `{ t: 'left' }` and closes that member's sockets; the client stops reconnecting and navigates home.
- Host succession selects the first remaining connected, non-left, non-kicked member in list order (players before spectators). If no members remain, the Worker deletes the Durable Object's storage and alarm.
- The top-bar **Leave** control during play does not call `leaveRoom`; it closes the view and uses the existing disconnect/rejoin flow, so the seat remains held until the game ends.

## Free-tier operation

The first Wrangler migration declares `new_sqlite_classes = ["GameRoom"]`, as required to use SQLite-backed Durable Objects on Workers Free. Cloudflare's current pricing documentation lists free daily quotas, reset at 00:00 UTC; exceeded operations fail until reset. Incoming WebSocket messages use 20:1 request billing, outgoing messages are free, and static asset requests are free. See the official [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), and [Pages migration guide](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/).

Turnstile and Web Analytics are Cloudflare services; no paid vendor or external database is required.

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
├── src/pages/               # Home, Worker lobby, Worker game board
├── worker/index.ts          # same-origin API/static-assets routing and room creation
├── worker/gameRoom.ts       # SQLite persistence, Hibernation API, alarms, views
├── worker/views.ts          # per-socket privacy filtering
├── wrangler.toml            # Worker, assets, Turnstile vars, first SQLite migration
└── playwright.config.ts     # browser-level hidden-information coverage
```

## Authoritative state and privacy

Each room's Durable Object stores the shuffled deck, hands, Tables, action/interrupt state, seats, and rejoin requests in one SQLite row. A validated action reduces the pure room state, persists it, advances the earliest alarm, and broadcasts full snapshots. The Worker never serializes the seed, deck order, opponents' hands, or concealed card identities into public views. Players receive only their own hand and concealed cards in a separate private field. Spectators receive the same public snapshot as opponents.

Card IDs are seeded-random 128-bit values, independent of card descriptions. The deck seed comes from the Worker and stays in Durable Object state. At game end the public snapshot reveals all cards.

## Timers and lifecycle

- Interrupts last at most 30 seconds and end on the first APPEAL, all APPEAL holders passing, or expiry.
- The 60-second default turn timer pauses during an interrupt; the host sets 15–180 seconds in the lobby.
- A disconnected seat is retained; after 60 seconds away its current/future turns are skipped.
- Host approval is required for a new session to reclaim a player seat. Pending requesters receive no view before approval.
- The room's single alarm is always set to the earliest interrupt, turn, away, or rejoin-request deadline. Server timers do not use `setTimeout`.

## Free-tier operation

The first Wrangler migration declares `new_sqlite_classes = ["GameRoom"]`, as required to use SQLite-backed Durable Objects on Workers Free. Cloudflare's current pricing documentation lists free daily quotas, reset at 00:00 UTC; exceeded operations fail until reset. Incoming WebSocket messages use 20:1 request billing, outgoing messages are free, and static asset requests are free. See the official [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), and [Pages migration guide](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/).

Turnstile and Web Analytics are Cloudflare services; no paid vendor or external database is required.

# 3EAL

3EAL is a browser-based multiplayer card game. Create a room, invite players by room code, and build three valid sets of three cards before your opponents.

## Rules overview

- **Deck:** 218 cards — 175 Normal, 3 TEAL wild, and 40 Action cards (10 each of CONCEAL, STEAL, REVEAL, APPEAL).
- **Colors:** Periwinkle (`C0C0FF`), Teal (`008080`), Rose (`C06060`), Grape Soda (`884488`), French Blue (`404088`).
- **Sets:** Three cards sharing a color, number, or shape. TEAL is always Teal for color sets and can adopt any number or shape otherwise.
- **Interrupts:** CONCEAL, STEAL, and REVEAL allow eligible opponents to APPEAL during a maximum 30-second window.
- **Turns:** 60 seconds by default; the host can choose 15–180 seconds in the lobby. The timer pauses during interrupts.
- **APPEAL:** Unplayed APPEAL cards persist in Hand between turns until played; other unused Hand cards are discarded at turn end.

Read the full [rules](docs/rules.md).

## Architecture

- React 19 + TypeScript + Vite client, served as Workers static assets from the same origin as the API.
- A Cloudflare Worker routes room creation and WebSocket connections.
- One SQLite-backed `GameRoom` Durable Object stores each room's authoritative game state in one row. WebSockets use the Hibernation API; the object persists every accepted action and uses one alarm for turn, interrupt, rejoin, and away deadlines.
- The pure TypeScript rules engine in [`game/packages/engine/`](game/packages/engine/) is shared by the Worker and browser.
- Card IDs and deck order are generated from a per-game seeded RNG; the seed and hidden card identities stay server-side.
- Each socket receives a full filtered snapshot: a player gets public data plus their own hand and concealed cards; a spectator gets public data only. Spectators receive exactly what opponents see.
- Cloudflare Turnstile protects room creation. Cloudflare Web Analytics is loaded when its token is configured.

There are no accounts or chat. Identity is a room code and unique player name. The host approves new-session rejoin requests.

## Local development

Requirements: Node.js 22+, npm, and a Cloudflare account only if you want to deploy.

```bash
cd game
npm ci
cp .dev.vars.example .dev.vars
```

Set a Turnstile **secret key** in the ignored `game/.dev.vars` file and a matching public site key in `game/wrangler.toml` under `[vars]`. You may use Cloudflare's documented Turnstile test keys for local development. Do not commit secret keys. Web Analytics is optional locally; configure its site token in `WEB_ANALYTICS_TOKEN` when available.

Run the full Worker + static-asset app:

```bash
npm run dev:worker
```

The app is served at the URL printed by Wrangler (usually `http://localhost:8787`). `npm run dev` starts Vite alone and does not run the Worker API.

## Checks

Run from `game/`:

| Command | Description |
|---|---|
| `npm test` | Vitest unit and property tests |
| `npm run test:e2e` | Playwright hidden-information flow |
| `npm run lint` | OxLint |
| `npm run build` | TypeScript build and Vite assets |
| `npm run worker:typecheck` | Generate Worker types and type-check Worker sources |
| `npm run simulate` | Run the seeded Monte Carlo bot simulator |
| `npm run deploy` | Build and deploy with Wrangler |

The simulator reports average turns and simulated minutes to win, first-player win rate, STEAL/APPEAL set-loss swings, and average player turns to the first set. Its default 30-second simulated bot turn is an explicit timing assumption; override it and the number of games with `SIM_TURN_SECONDS` and `SIM_GAMES`. The 15–25 minute target is reported for comparison.

## Free-tier deployment

The Wrangler configuration declares `GameRoom` as a SQLite-backed Durable Object in the first migration (`new_sqlite_classes`). Keep it SQLite-backed for the Workers Free plan. Add `TURNSTILE_SECRET_KEY` with `npx wrangler secret put TURNSTILE_SECRET_KEY`; set `TURNSTILE_SITE_KEY` and `WEB_ANALYTICS_TOKEN` in the Worker environment. Deploy with `npm run deploy`.

GitHub Actions validates pull requests and deploys pushes to `main`. Add repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to enable deployment.

Cloudflare's current [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) document the free limits. Free-plan operations fail when a daily quota is exceeded and reset at 00:00 UTC; incoming WebSocket messages use 20:1 request billing and outgoing messages are free. Static asset requests are free. Cloudflare may change quotas, so re-check those pages before launch. The [Pages-to-Workers migration guide](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/) supports serving the client and Worker together.

# 3EAL

3EAL is a strategic card game about collecting and protecting sets. Build three valid sets of three cards before your opponents, while using action cards to disrupt their plans.

The application includes a polished Home screen, a Firebase-backed live Lobby, an interactive Game Board, and shared Rules overlays. Lobby and authoritative gameplay state synchronize across browsers through Firebase and Cloudflare Pages Functions.

## Game overview

- **Players:** 2 or more to start; remaining players may continue if others leave mid-game
- **Deck:** 120 cards — 105 Normal, 3 TEAL wild, and 12 Action cards
- **Objective:** Be the first to have 9 cards on your Table that form 3 valid sets
- **Valid sets:** Three cards sharing a color, number, or shape
- **TEAL:** A wild card with fixed Teal color that can adopt any number or shape when completing a set

Action cards are **CONCEAL**, **STEAL**, **REVEAL**, and **APPEAL**. CONCEAL, STEAL, and REVEAL open an interrupt window; the eligible player or players can use APPEAL to cancel the action. The current game implementation uses a 30-second window.

Drawing happens automatically when your turn begins. Every drawn card goes to your private Hand first. During Main, Normal and TEAL cards may be moved to an open Table slot; with 9 cards on the Table, moving one swaps it with a selected Table card. To discard a Table card, move it to your Hand. All cards left in Hand—including Action cards—are discarded automatically at turn end. Table rearrangement is local-only and is not sent to the server or shown to opponents.

For the complete rules and card details, see [`docs/rules.md`](docs/rules.md).

## Current implementation status

### Implemented

- Local game engine for drawing, action resolution, turn flow, and win checks
- Set validation and partition search, including TEAL wild cards
- Game Board with Table and Hand, server-validated card moves/swaps and action targeting, and player/rules menus
- Home screen with room-code entry, room creation, and Rules access
- Live Firebase Lobby with unique player names, numbered defaults, room creation/joining, roster updates, player and room renaming, host kick, leave, host handoff, and host start
- Firebase anonymous authentication for lobby player identity
- Server-authoritative game state and mutation API hosted in Cloudflare Pages Functions
- Table-card rearrangement by tap or drag, stored locally and never sent to the server; drag previews follow the pointer
- Hand-to-Table drag placement targets a specific slot; Table cards can be dragged to Hand during the active turn
- Game-over screen shows the winner's sets and returns to that room's lobby
- Immediate pending, accepted, and failed feedback for server-bound game actions
- Per-player sanitized Firestore game views; the canonical deck, hands, and concealed card identities are server-only
- Client-denying Firestore rules configured and exercised in the local emulator
- Active-game leave/kick handling with card discard, turn-order updates, host handoff, and continued single-player play
- Vitest game-engine unit tests and GitHub Actions CI for tests, lint, and build

### Remaining work

Production Firestore rules and Cloudflare Pages bindings still need to be verified and deployed. Integration coverage, manual device/accessibility checks, and operational recovery validation remain. Optional bot, tutorial, sound, spectator, history, and alternate-variant ideas remain post-MVP. See [`docs/roadmap.md`](docs/roadmap.md).

## Quick start

### Requirements

- Node.js and npm
- Firebase CLI, for running the local Auth and Firestore emulators

### Configure Firebase

The app connects to the Auth emulator at `localhost:9099` and Firestore emulator at `localhost:8080` in development. Provide the Firebase web-app configuration values in `game/.env.local`:

```dotenv
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-auth-domain
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-storage-bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

Do not commit `.env.local`. The emulator configuration is in [`game/firebase.json`](game/firebase.json).

### Start the full local app

In one terminal:

```bash
cd game
npm install
npx firebase-tools emulators:start --project eal-5d762 --only auth,firestore
```

Use the same project ID as `VITE_FIREBASE_PROJECT_ID` in `.env.local`; otherwise, the emulator can issue tokens for a different project that the app will reject.

In a second terminal, configure the Pages emulator bindings once and run the local Pages Functions runtime:

```bash
cd game
cp .dev.vars.example .dev.vars
npm run pages:dev
```

Provide the public Firebase web-app values in the ignored `game/.env.local` file above. Open the Pages dev URL printed by Wrangler (normally **http://localhost:8788**). `npm run dev` runs Vite alone and does not serve the Pages API.

### Cloudflare Pages deployment

The Cloudflare Pages project builds from `game/` with `npm run build` and publishes `dist/`. Pages Functions are in `game/functions/`.

Configure the public Firebase web-app values (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, and `VITE_FIREBASE_APP_ID`) as Cloudflare **build variables** in each environment that should use Firebase. `VITE_` values are embedded in the browser bundle during the build and are not secrets.

Set `FIREBASE_PROJECT_ID` as a Pages Function runtime variable. Add `FIREBASE_SERVICE_ACCOUNT` as an encrypted **secret** binding containing the complete JSON key for a dedicated service account granted only the Cloud Datastore User role (`roles/datastore.user`). Do not put the service-account JSON in source control, `wrangler.toml`, a build variable, or any `VITE_` variable. Redeploy after changing build variables or Function secrets so the new deployment uses the configuration.

The browser can read lobby metadata and only its own sanitized `rooms/{roomCode}/views/{uid}` game document. The authoritative deck, hands, and concealed card identities are stored in `rooms/{roomCode}/private/state`; client Firestore rules should deny direct access to that state and deny client writes. Game and lobby mutations pass through the Pages Functions API, which uses Firestore REST transactions. The API verifies Firebase ID tokens against Google's public signing certificates.

`game/firestore.rules` is connected to `game/firebase.json` for local emulator testing. Verify and deploy the reviewed rules to the production Firebase project separately.

For local development, start Firebase emulators with the same project ID used by `.env.local` and `.dev.vars`:

```bash
cd game
npx firebase-tools emulators:start --project eal-5d762 --only auth,firestore
```

Without `--project`, the Firebase CLI can select `demo-no-project`, causing sign-in tokens to be rejected when the configured project is `eal-5d762`.

### Available scripts

Run these from `game/`:

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run build` | Run TypeScript project builds and create a production bundle |
| `npm run preview` | Preview the production build locally |
| `npm run pages:dev` | Build the emulator-configured frontend and serve Pages Functions locally |
| `npm run lint` | Run OxLint |
| `npm test` | Run Vitest game-engine unit tests |

## Project structure

```text
game/
├── src/
│   ├── components/
│   │   ├── cards/       # Normal, Action, and shared card UI
│   │   └── game/        # Menus, action targeting, and rules
│   ├── lib/             # Firebase initialization and room/game API subscriptions
│   ├── logic/           # Deck generation, validation, and authoritative game rules
│   ├── pages/           # Home, Lobby, and Game Board views
│   ├── types/           # Game and card TypeScript types
│   ├── App.tsx          # Navigation and view composition
│   └── index.css        # Tailwind CSS import and global styles
├── functions/           # Cloudflare Pages Functions mutation API
├── firestore.rules      # Client read/write access control
├── firebase.json        # Firestore rules and local emulator configuration
├── wrangler.toml        # Cloudflare Pages build/runtime configuration
└── package.json         # Dependencies and npm scripts

docs/
├── logic.md             # Data model and game logic
├── rules.md             # Game rules
├── tech-stack.md        # Architecture and technology notes
├── ui-ux.md             # UI and interaction requirements
└── roadmap.md           # Progress, known boundaries, and future work
```

## Technology

| Area | Technology |
|---|---|
| UI | React 19, TypeScript 6 |
| Build/development | Vite 8 |
| Styling | Tailwind CSS 4 |
| Backend | Cloudflare Pages Functions, Firebase Authentication, and Cloud Firestore |
| Local checks | OxLint and TypeScript build |

See [`docs/tech-stack.md`](docs/tech-stack.md) for architecture details.

## Documentation

- This README contains local setup and deployment guidance.
- [`docs/rules.md`](docs/rules.md) — Objective, cards, setup, valid sets, turns, and actions
- [`docs/logic.md`](docs/logic.md) — Data schemas, engine behavior, deck, and validation
- [`docs/ui-ux.md`](docs/ui-ux.md) — Views, design system, and interaction requirements
- [`docs/tech-stack.md`](docs/tech-stack.md) — Technology and architecture
- [`docs/roadmap.md`](docs/roadmap.md) — Completed work and remaining milestones

## License

MIT — See the repository license for details.

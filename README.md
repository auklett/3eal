# 3EAL

3EAL is a strategic card game about collecting and protecting sets. Build three valid sets of three cards before your opponents, while using action cards to disrupt their plans.

The application includes a polished Home screen, a Firebase-backed live Lobby, an interactive Game Board, and shared Rules overlays. Lobby and authoritative gameplay state synchronize across browsers through Firebase and Cloudflare Pages Functions.

## Game overview

- **Players:** 2 or more
- **Deck:** 120 cards — 105 Normal, 3 TEAL wild, and 12 Action cards
- **Objective:** Be the first to have 9 cards on your Table that form 3 valid sets
- **Valid sets:** Three cards sharing a color, number, or shape
- **TEAL:** A wild card with fixed Teal color that can adopt any number or shape when completing a set

Action cards are **CONCEAL**, **STEAL**, **REVEAL**, and **APPEAL**. CONCEAL, STEAL, and REVEAL open an interrupt window; the eligible player or players can use APPEAL to cancel the action. The current game implementation uses a 30-second window.

For the complete rules and card details, see [`docs/rules.md`](docs/rules.md).

## Current implementation status

### Implemented

- Local game engine for drawing, action resolution, turn flow, and win checks
- Set validation and partition search, including TEAL wild cards
- Game Board with Table and Hand, card selection, server-validated action targeting, and player/rules menus
- Home screen with room-code entry, room creation, and Rules access
- Live Firebase Lobby with room creation/joining, roster updates, player and room renaming, host kick, leave, host handoff, and host start
- Firebase anonymous authentication for lobby player identity
- Server-authoritative game state and mutation API hosted in Cloudflare Pages Functions
- Per-player sanitized Firestore game views; the canonical deck, hands, and concealed card identities are server-only
- Client-denying Firestore rules configured and exercised in the local emulator

### Not yet implemented

Production Firestore rules have **not** been deployed, and the Cloudflare Pages site has **not** been deployed. Configure the Pages service-account secret before enabling the API in production. Automated test suites and active-game player departure/host-change handling also remain. See [`docs/roadmap.md`](docs/roadmap.md).

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
npx firebase-tools emulators:start --only auth,firestore
```

In a second terminal, configure the Pages emulator bindings once and run the local Pages Functions runtime:

```bash
cd game
cp .dev.vars.example .dev.vars
npm run pages:dev
```

Provide the public Firebase web-app values in the ignored `game/.env.local` file above. Open the Pages dev URL printed by Wrangler (normally **http://localhost:8788**). `npm run dev` runs Vite alone and does not serve the Pages API.

### Available scripts

Run these from `game/`:

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run build` | Run TypeScript project builds and create a production bundle |
| `npm run preview` | Preview the production build locally |
| `npm run pages:dev` | Build the emulator-configured frontend and serve Pages Functions locally |
| `npm run lint` | Run OxLint |

## Project structure

```text
game/
├── src/
│   ├── components/
│   │   ├── cards/       # Normal, Action, and shared card UI
│   │   └── game/        # Game menus, action targeting, and rules overlay
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

- [`docs/rules.md`](docs/rules.md) — Objective, cards, setup, valid sets, turns, and actions
- [`docs/logic.md`](docs/logic.md) — Data schemas, engine behavior, deck, and validation
- [`docs/ui-ux.md`](docs/ui-ux.md) — Views, design system, and interaction requirements
- [`docs/tech-stack.md`](docs/tech-stack.md) — Technology and architecture
- [`docs/roadmap.md`](docs/roadmap.md) — Completed work and remaining milestones

## License

MIT — See the repository license for details.

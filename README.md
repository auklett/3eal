# 3EAL

3EAL is a strategic card game about collecting and protecting sets. Build three valid sets of three cards before your opponents, while using action cards to disrupt their plans.

The application includes a polished Home screen, a Firebase-backed live Lobby, an interactive Game Board, and shared Rules overlays. **The lobby is synchronized across browsers; gameplay is currently local to each browser and is not synchronized between players.**

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
- Game Board with Table and Hand, card selection/rearrangement, action targeting, and player/rules menus
- Home screen with room-code entry, room creation, and Rules access
- Live Firebase Lobby with room creation/joining, roster updates, player and room renaming, host kick, leave, host handoff, and host start
- Firebase anonymous authentication for lobby player identity
- Local Firebase Auth and Firestore emulator configuration for development

### Not yet implemented

Game state is not shared across browsers. Each browser initializes and updates its own deck, hands, tables, turns, and actions after entering the Game Board. Production Firestore security rules, authoritative server-side gameplay and appeal timing, hosting, and automated tests also remain to be completed. See [`docs/roadmap.md`](docs/roadmap.md).

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

### Start the app

In one terminal:

```bash
cd game
npm install
npx firebase-tools emulators:start --only auth,firestore
```

In a second terminal:

```bash
cd game
npm run dev
```

Open **http://localhost:5173**. The Firebase Emulator UI is enabled by the local emulator configuration.

### Available scripts

Run these from `game/`:

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run build` | Run TypeScript project builds and create a production bundle |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run OxLint |

## Project structure

```text
game/
├── src/
│   ├── components/
│   │   ├── cards/       # Normal, Action, and shared card UI
│   │   └── game/        # Game menus, action targeting, and rules overlay
│   ├── lib/             # Firebase initialization and room/lobby operations
│   ├── logic/           # Deck generation, validation, and local game engine
│   ├── pages/           # Home, Lobby, and Game Board views
│   ├── types/           # Game and card TypeScript types
│   ├── App.tsx          # Navigation and view composition
│   └── index.css        # Tailwind CSS import and global styles
├── firebase.json        # Local Firebase Emulator Suite configuration
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
| Lobby backend | Firebase Authentication and Cloud Firestore |
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

# 3EAL — Tech Stack & Architecture

## 1. Core Technology Stack

* **Frontend:** React 19.2.8 with TypeScript 6.0.2
* **Build Tool:** Vite 8.2.0
* **Styling:** Tailwind CSS 4.3.3
* **Backend & Realtime State:** Firebase Authentication (anonymous sign-in) and Cloud Firestore, with authoritative writes through Cloudflare Pages Functions
* **Hosting:** Cloudflare Pages (static Vite app and Pages Functions)
* **Version Control:** GitHub
* **Quality Checks:** OxLint, TypeScript/Vite build, Vitest, and GitHub Actions CI

---

## 2. Current Directory Structure

```text
game/
├── src/
│   ├── components/
│   │   ├── cards/         # NormalCard, ActionCard, CardSlot
│   │   └── game/          # Action targeting, menus, and rules
│   ├── logic/             # Deck creation, pattern validation, turn/action engine
│   │   ├── deck.ts        # Card generation and shuffling
│   │   ├── validation.ts  # Set validation and win condition checking
│   │   └── gameEngine.ts  # Game state machine and action handlers
│   ├── types/             # TypeScript schemas (Card, Player, RoomState)
│   │   └── index.ts       # All type definitions
│   ├── pages/             # Home, Lobby, and Game Board views
│   ├── lib/               # Firebase initialization and room/game API subscriptions
│   ├── App.tsx            # Main application entry
│   └── index.css           # Global styles
├── functions/             # Cloudflare Pages API
├── firestore.rules        # Client access controls
├── firebase.json          # Emulator configuration
├── wrangler.toml          # Pages configuration
└── package.json           # Dependencies and scripts
```

---

## 3. Available Scripts

* `npm run dev` - Start development server (default: http://localhost:5173)
* `npm run build` - Build for production (TypeScript compile + Vite build)
* `npm run preview` - Preview production build locally
* `npm run lint` - Run OxLint for code quality checks
* `npm test` - Run engine tests and Firestore-rule tests when the emulator is active
* `npm run build:analyze` - Build and generate a local bundle report at `dist/bundle-stats.html`
* `npx firebase emulators:exec --only firestore --project demo-3eal-rules "npm test"` - Run the suite with Firestore security rules enabled

---

## 4. Current Architecture

* **Authoritative state:** Cloudflare Pages Functions verify Firebase ID tokens, batch-read room/state documents, and atomically commit with Firestore update-time preconditions. Server-side game state keeps the deck, hands, and concealed card identities private; unchanged deck and seat documents are not rewritten.
* **Realtime views:** Firestore publishes lobby metadata and sanitized public game state. Each player can read only their assigned private seat document; spectators cannot read player hands. Per-seat versions reconcile independently delivered public/private snapshots. Deck and server metadata are server-only. Clients cannot write Firestore documents directly.
* **Local development:** Firebase Auth and Firestore emulators run with the same project ID as the client and Pages Function configuration.
* **Room identity:** The API normalizes names for uniqueness, admits players up to the current deck's 59-player starting-deal capacity and up to 8 spectators, and allocates numbered `Player N` defaults to joining players.
* **Card movement:** Table rearrangement is local-only presentation state. It does not call the server and does not change the order opponents see. Hand-to-Table moves and swaps are game actions and are validated by the authoritative API.
* **Draw and cleanup:** Each turn draws automatically into Hand. Normal/TEAL cards can be placed or swapped onto the Table during Main; Normal/TEAL cards left in Hand are shuffled back into the deck at turn end, while Action cards stay in Hand. Discarded cards are recycled directly into the deck.
* **Latency feedback:** The UI reports when a server-bound request is submitted, accepted, or rejected. Firestore subscriptions deliver the resulting state separately from the command response.
* **Winner persistence:** Winning sets are serialized as objects containing card arrays, avoiding Firestore's prohibition on nested arrays.
* **Active-game membership:** Leaving or host removal recycles that player's cards and updates turn order and host identity. Connected clients heartbeat every 15 seconds; turn limits are host-configurable, three consecutive missed turns forfeit a seat, and rejoining requires host approval. Spectators receive only public Tables.
* **Bundle loading:** Lobby and Game Board are lazy-loaded; Firebase auth/Firestore and React are in named, cacheable chunks. `npm run build:analyze` creates a local bundle report; API and first-Firestore-snapshot timings are measured in the browser, and Pages Functions emit `Server-Timing`.

Production Firebase rules and Cloudflare Pages runtime bindings still require deployment verification. The CI workflow runs tests, lint, and build but does not deploy.
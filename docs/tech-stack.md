# 3EAL — Tech Stack & Architecture

## 1. Core Technology Stack

* **Frontend:** React 19.2.8 with TypeScript 6.0.2
* **Build Tool:** Vite 8.2.0
* **Styling:** Tailwind CSS 4.3.3
* **Backend & Realtime State:** Firebase Authentication (anonymous sign-in) and Cloud Firestore, with authoritative writes through Cloudflare Pages Functions
* **Hosting:** Cloudflare Pages (static Vite app and Pages Functions)
* **Version Control:** GitHub
* **Linting:** OxLint 1.75.0

---

## 2. Current Directory Structure

```text
game/
├── src/
│   ├── components/
│   │   ├── cards/         # NormalCard, ActionCard, CardSlot
│   │   ├── game/          # Board, Hand, DiscardPile, ActionOverlay
│   │   └── lobby/         # PlayerList, CodeInput
│   ├── logic/             # Deck creation, pattern validation, action triggers
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

---

## 4. Current Architecture

* **Authoritative state:** Cloudflare Pages Functions verify Firebase ID tokens and use Firestore REST transactions for room and game mutations. Server-side game state keeps the deck, hands, and concealed card identities private.
* **Realtime views:** Firestore publishes lobby metadata and sanitized per-player game views. Clients cannot write Firestore documents directly; private game state is not readable from the client.
* **Local development:** Firebase Auth and Firestore emulators run with the same project ID as the client and Pages Function configuration.
* **Room identity:** The API enforces case-insensitive unique names inside each room and allocates numbered `Player N` defaults to joining players.
* **Presentation order:** Table card arrangement is cosmetic; tap-to-move and pointer drag-and-drop update the persisted slot order through the authoritative API without changing game state.
* **Latency feedback:** The UI reports when a server-bound request is submitted, accepted, or rejected. Firestore subscriptions deliver the resulting state separately from the command response.

No new dependencies are implied by either of these — just two things to build correctly the first time given Firebase's transaction primitives.
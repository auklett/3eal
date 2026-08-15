# 3EAL — Tech Stack & Architecture

## 1. Core Technology Stack

* **Frontend:** React 19.2.8 with TypeScript 6.0.2
* **Build Tool:** Vite 8.2.0
* **Styling:** Tailwind CSS 4.3.3
* **Backend & Realtime State:** Firebase (Firestore / Realtime Database & Firebase Anonymous Auth) - *Planned for Phase 3*
* **Hosting:** Cloudflare Pages - *Planned for Phase 3*
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
│   ├── hooks/             # useGameEngine, useFirebaseLobby (planned)
│   ├── logic/             # Deck creation, pattern validation, action triggers
│   │   ├── deck.ts        # Card generation and shuffling
│   │   ├── validation.ts  # Set validation and win condition checking
│   │   └── gameEngine.ts  # Game state machine and action handlers
│   ├── types/             # TypeScript schemas (Card, Player, RoomState)
│   │   └── index.ts       # All type definitions
│   ├── pages/             # GameBoard and page components
│   ├── App.tsx            # Main application entry
│   └── App.css            # Global styles
├── public/                # Static assets
├── package.json           # Dependencies and scripts
├── vite.config.ts         # Vite configuration
├── tsconfig.json          # TypeScript configuration
└── tailwind.config.js     # Tailwind CSS configuration
```

---

## 3. Available Scripts

* `npm run dev` - Start development server (default: http://localhost:5173)
* `npm run build` - Build for production (TypeScript compile + Vite build)
* `npm run preview` - Preview production build locally
* `npm run lint` - Run OxLint for code quality checks

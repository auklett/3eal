# 3EAL

A strategic card game where players race to form 3 sets of 3 matching cards. Built with React, TypeScript, and Vite.

---

## 🎮 Game Overview

**3EAL** is a turn-based card game for 2+ players. The goal is to be the first to form **3 complete sets of 3 cards** (9 cards total) using pattern matching.

### Core Mechanics
- **120-card deck:** 105 unique normal cards (3 colors × 7 numbers × 5 shapes) + 15 action cards (3 each of 5 types)
- **4 winning patterns:** Same Color, Same Number, Same Shape, Consecutive Numbers
- **5 action cards:** CONCEAL, STEAL, REVEAL, APPEAL, TEAL (wild)
- **TEAL wild cards:** Fixed Teal color, flexible shape/number to complete any pattern
- **Interrupt system:** Targeted players can block CONCEAL/STEAL/REVEAL with APPEAL within 10 seconds

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [`docs/logic.md`](docs/logic.md) | Complete data schemas, deck generation, action handlers, game flow, win validation, and pattern engine |
| [`docs/rules.md`](docs/rules.md) | Official game rules: objective, setup, patterns, turn flow, action cards, deck composition, winning |
| [`docs/tech-stack.md`](docs/tech-stack.md) | Technology stack, directory structure, available scripts, implementation files |
| [`docs/ui-ux.md`](docs/ui-ux.md) | Design system, card layouts, screen views, interaction patterns, accessibility, implementation status |
| [`docs/roadmap.md`](docs/roadmap.md) | Development phases, current progress, future milestones |

---

## 🚀 Quick Start

```bash
cd game
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

### Available Scripts
- `npm run dev` — Start development server
- `npm run build` — Build for production
- `npm run preview` — Preview production build
- `npm run lint` — Run OxLint

---

## 🏗️ Architecture

```
game/
├── src/
│   ├── components/     # React UI components (cards, game, lobby)
│   ├── logic/          # Pure game logic (deck, validation, engine)
│   │   ├── deck.ts     # 120-card generation & shuffling
│   │   ├── validation.ts # Pattern matching & win detection
│   │   └── gameEngine.ts # State machine & action handlers
│   ├── types/          # TypeScript schemas (Card, Player, RoomState)
│   └── pages/          # GameBoard and routing
└── public/             # Static assets
```

### Key Logic Modules
- **deck.ts** — Generates 105 normal + 15 action cards, Fisher-Yates shuffle
- **validation.ts** — Validates 4 patterns, checks win condition via combinatorial search
- **gameEngine.ts** — Turn phases (DRAW → MAIN → INTERRUPT), action resolution, appeal handling

---

## 🎯 Current Status

**Phase 1 (Local Single-Player): ~60% Complete**

| Feature | Status |
|---------|--------|
| Project setup (Vite + React + TS + Tailwind) | ✅ |
| Card generation (120 cards) | ✅ |
| Game state machine | ✅ |
| Card UI components (5:7 ratio, 3×3 grid) | ✅ |
| Single-player / manual turn switching | ✅ |
| Card rearrangement (click to swap) | ✅ |
| Hamburger menu (Rules, Players) | ✅ |
| Action targeting UI (STEAL/REVEAL/CONCEAL) | 🚧 In Progress |
| Set builder workspace | ❌ Not Started |

**Next Phases:**
- **Phase 2:** Local multiplayer, appeal timer, AI opponent
- **Phase 3:** Firebase integration, hosted MVP on Cloudflare Pages

---

## 🎨 Design System

- **Background:** `#000000` (Pure Black)
- **Text:** `#FFFFFF` (Pure White)
- **Cards:** 80×112px (5:7 ratio), rounded corners (12px)
- **Normal Card Colors:** `#C0C0FF` (Periwinkle), `#008080` (Teal), `#C06060` (Rose)
- **Action Cards:** White background (CONCEAL/STEAL/REVEAL/APPEAL), Teal (TEAL)

---

## 📖 How to Play (Quick Reference)

1. **Draw** 1 card to start your turn
2. **Main Phase:** Discard normals, play actions (CONCEAL/STEAL/REVEAL/TEAL)
3. **Interrupt:** Targeted player has 10s to play APPEAL and block
4. **End Turn:** Discard down to 9 cards, check for 3 valid sets → **WIN!**

**Valid Sets (any one):**
- 3 cards same color
- 3 cards same number (1–7)
- 3 cards same shape (○ △ □ ⬟ ⬡)
- 3 consecutive numbers (e.g., 2-3-4)

**TEAL** = Wild card (always Teal color, any shape/number)

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript 6 |
| Build | Vite 8 |
| Styling | Tailwind CSS 4 |
| Linting | OxLint |
| Backend (Planned) | Firebase Realtime DB + Auth |
| Hosting (Planned) | Cloudflare Pages |

---

## 🤝 Contributing

See [`docs/roadmap.md`](docs/roadmap.md) for current priorities. The game logic is pure TypeScript in `game/src/logic/` — easy to test and extend.

---

## 📄 License

MIT — Feel free to use, modify, and distribute.
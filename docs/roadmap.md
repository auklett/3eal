# 3EAL — Development Roadmap

## Current Status

The local game engine, game board, application views, and Firebase-backed live lobby are implemented. Gameplay state is still local to each browser: starting a room does not synchronize turns, cards, or actions between players. The hosted multiplayer MVP is therefore in progress, not complete.

---

## Phase 1: Local Game Core (Complete ✅)

- [x] Set up the React, TypeScript, Vite, and Tailwind application.
- [x] Generate and shuffle the 120-card deck: 105 Normal, 3 TEAL wild, and 12 Action cards (3 each of CONCEAL, STEAL, REVEAL, and APPEAL).
- [x] Implement local Draw, Main, Interrupt, turn-end, and win-condition logic.
- [x] Validate sets and find a partition of nine Table cards into three valid sets, including TEAL wild cards.
- [x] Implement the 3×3 Table, visible Hand, card selection/rearrangement, card counts, and action targeting UI.
- [x] Implement CONCEAL, STEAL, REVEAL, and APPEAL effects in the local game engine.
- [x] Implement the 30-second APPEAL window and eligibility rules.
- [x] Add revealed/selected card indicators, action feedback, and the Players/Rules in-game menu.

---

## Phase 2: Application Views and Live Lobby (Complete ✅)

- [x] Build the polished Home view with room-code entry, Join Room, Create Room, and Rules actions.
- [x] Build the Lobby view with room code, live roster, player rename, host controls, and status feedback.
- [x] Add application navigation between Home, Lobby, and Game Board.
- [x] Add shared Rules overlays and responsive dark-theme styling across the application.
- [x] Add Firebase anonymous authentication for lobby player identity.
- [x] Implement Firestore room creation and joining, live lobby subscriptions, room/player rename, host kick, leave, host handoff, and host start.
- [x] Require at least two players before the host can start the game.
- [x] Add local Firebase emulator configuration for development.

### Current Boundary

Lobby membership and room status are synchronized through Firestore. The Game Board initializes its own local deck and game state in each browser; gameplay changes are not shared with other players. Do not treat the current room start flow as synchronized multiplayer gameplay.

---

## Phase 3: Synchronized Multiplayer and Hosted MVP (In Progress)

### Shared Game State

- [ ] Persist authoritative game state for each room and synchronize active player, turn phase, deck, discard pile, Table, Hand, pending action, and winner across clients.
- [ ] Enforce private information: opponents must not receive Action card hands or the identities/faces of Concealed cards unless rules reveal them.
- [ ] Validate every move against the current room state and acting player's identity; prevent stale, duplicate, or out-of-turn actions.
- [ ] Resolve concurrent APPEAL attempts atomically so only one valid appeal can cancel a pending action.
- [ ] Enforce the 30-second interrupt deadline using trusted server-side timing rather than a client's clock.
- [ ] Handle reconnects, browser refresh, player departure, and host changes during an active game.

### Production Release

- [ ] Define and test production Firestore security rules; do not rely on permissive emulator rules.
- [ ] Configure production Firebase authentication and project settings.
- [ ] Deploy the application to Cloudflare Pages.
- [ ] Add a GitHub CI/CD workflow for type checking, linting, and deployment.

---

## Phase 4: Quality, Accessibility, and Extensions (Future)

- [ ] Add unit tests for deck generation, set validation, win partitions, and game actions.
- [ ] Add integration tests for room lifecycle and complete game flows.
- [ ] Test layouts and interactions across mobile, tablet, and desktop sizes.
- [ ] Audit keyboard navigation, focus handling, reduced-motion behavior, and screen-reader labels.
- [ ] Add an optional set-builder workspace for manually arranging candidate sets.
- [ ] Consider a bot opponent for solo practice.
- [ ] Add sound effects and additional action feedback.
- [ ] Add tutorial/onboarding, settings, and optional animation or visual themes.
- [ ] Consider spectator mode, game history/statistics, and alternate game variants.

---

## Ongoing Technical Debt

- [ ] Add automated coverage for error cases, concurrent room operations, and interrupted/reconnected sessions.
- [ ] Review bundle size and consider splitting large application dependencies.
- [ ] Document and verify production deployment, Firebase rules, and operational recovery procedures.

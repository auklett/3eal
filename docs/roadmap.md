# 3EAL — Development Roadmap

## Current Status

The game board, Firebase-backed live lobby, server-authoritative game API, and per-player sanitized game views are implemented and exercised against the local Firebase emulators. Production Firestore rules and Cloudflare Pages have not been deployed, and active-game player departure/host changes and automated test suites remain. The hosted multiplayer MVP is therefore in progress, not complete.

---

## Phase 1: Local Game Core (Complete ✅)

- [x] Set up the React, TypeScript, Vite, and Tailwind application.
- [x] Generate and shuffle the 120-card deck: 105 Normal, 3 TEAL wild, and 12 Action cards (3 each of CONCEAL, STEAL, REVEAL, and APPEAL).
- [x] Implement local Draw, Main, Interrupt, turn-end, and win-condition logic.
- [x] Validate sets and find a partition of nine Table cards into three valid sets, including TEAL wild cards.
- [x] Implement the 3×3 Table, visible Hand, card selection, card counts, and action targeting UI.
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

Lobby metadata remains in `rooms/{roomCode}`. Game mutations pass through Cloudflare Pages Functions, which verify Firebase ID tokens and update a private authoritative state and sanitized per-player views in Firestore transactions. The browser can read its own view and cannot read/write the canonical deck, hands, or concealed identities. Refresh/reconnect resumes from the stored per-player view; mid-game departure, kicks, and host changes are not implemented.

---

## Phase 3: Synchronized Multiplayer and Hosted MVP (In Progress)

### Shared Game State

- [x] Persist authoritative game state for each room and synchronize active player, turn phase, deck count, discard pile, Table, private Hand, pending action, and winner through player-specific views.
- [x] Enforce private information: opponents do not receive Action card hands or concealed card identities; Firestore rules deny direct access to private state and direct client writes.
- [x] Validate moves against the authoritative room state, authenticated member, active player/phase, card ownership, action target, and server-side win partition.
- [x] Resolve concurrent APPEAL attempts atomically so only one valid appeal can cancel a pending action.
- [x] Enforce the 30-second interrupt deadline with server time and transactionally resolve expired actions.
- [x] Resume the authoritative per-player view after browser refresh/reconnect.
- [ ] Handle player departure, kicks, and host changes during an active game.

### Production Release

- [x] Define strict client Firestore rules and exercise member/view isolation and client-write denial against the local emulator.
- [ ] Deploy the reviewed Firestore rules to production before enabling production gameplay.
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

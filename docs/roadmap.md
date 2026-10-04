# 3EAL — Development Roadmap

## Current Status

The game board, Firebase-backed live lobby, server-authoritative API, public/private game-state projection, spectator and host-approved rejoin flows, and engine/security tests are implemented. Production bindings still require deployment verification; end-to-end API/gameplay tests, manual device/accessibility verification, and operational recovery checks remain.

---

## Phase 1: Local Game Core (Complete ✅)

- [x] Set up the React, TypeScript, Vite, and Tailwind application.
- [x] Generate and seed-shuffle the 218-card deck: 175 Normal, 3 TEAL wild, and 40 Action cards (10 each of CONCEAL, STEAL, REVEAL, and APPEAL).
- [x] Implement local Draw, Main, Interrupt, turn-end, and win-condition logic.
- [x] Validate sets and find a partition of nine Table cards into three valid sets, including TEAL wild cards.
- [x] Implement the 3×3 Table, visible Hand, card selection, card counts, and action targeting UI.
- [x] Implement CONCEAL, STEAL, REVEAL, and APPEAL effects in the local game engine.
- [x] Use a fixed 30-second interrupt window for all action cards.
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
- [x] Enforce unique room player names and assign numbered defaults (`Player 1`, `Player 2`, …).
- [x] Support tap-to-move and drag-and-drop rearrangement of a player's Table cards at any time (local presentation only; no server request).
- [x] Provide immediate pending, confirmed, and failed feedback for server-bound gameplay actions.
- [x] Show illustrated card/set examples in the Rules overlay and reveal all three starting Table cards.
- [x] Recycle discarded cards directly into the draw deck; retain unused Action cards at turn end.
- [x] Add 45/75/120-second turn limits, skip expired/away turns, and forfeit after three consecutive missed turns.
- [x] Add player/spectator roles, post-start spectator joins, host-approved unique-name seat recovery, spectator fallback, and connected-player host handoff.
- [x] Add persisted color-blind card patterns and glyphs.
- [x] Offer home or create-a-lobby-with-this-code options when a room code cannot be joined.

### Current Boundary

Lobby metadata remains in `rooms/{roomCode}`. Game mutations pass through Cloudflare Pages Functions, which verify Firebase ID tokens and atomically update `public/state`, fixed per-seat `playerPrivate` documents, private deck/metadata documents, and the room document with Firestore update-time preconditions. Clients read only public state and their assigned seat; spectators receive no private-seat reads. Game clients heartbeat every 15 seconds. Rejoin requests wait for host approval and time out to spectator admission when available.

---

## Phase 3: Synchronized Multiplayer and Hosted MVP (In Progress)

### Shared Game State

- [x] Persist authoritative game state per room and synchronize public state plus only the viewer's private seat.
- [x] Enforce private information: opponents do not receive Hand contents or concealed card identities; winner's cards and winning sets are revealed after the game ends. Firestore rules deny direct access to private state and direct client writes.
- [x] Validate moves against the authoritative room state, authenticated member, active player/phase, card ownership, action target, and server-side win partition.
- [x] Resolve concurrent APPEAL attempts atomically so only one valid appeal can cancel a pending action.
- [x] Enforce private-state-based interrupt deadlines and transactionally resolve expired actions.
- [x] Resume from split state after refresh; require host approval to rejoin by unique name and allow spectator fallback.
- [x] Tick away/expired turns, forfeit after three consecutive missed turns, and hand host status to connected players.
- [x] Allow as many players as the deck can deal to (59 maximum with the current deck) and up to 8 spectators, including spectators joining an active game.
- [x] Add Firestore emulator tests proving public visibility, own-seat-only reads, spectator isolation, and client-write denial.
- [x] Add API/first-snapshot performance marks, Server-Timing, preconnect hints, and a local bundle analyzer command.
- [x] Handle player departure, kicks, host changes, and turn-order updates during an active game.
- [x] Store winning set partitions in a Firestore-compatible form so winner state and the finished room status save together.

### Production Release

- [x] Define strict client Firestore rules and exercise member/view isolation and client-write denial against the local emulator.
- [ ] Deploy the reviewed Firestore rules to production before enabling production gameplay.
- [ ] Configure production Firebase authentication and project settings.
- [ ] Deploy the application to Cloudflare Pages.
- [ ] Verify the production `FIREBASE_SERVICE_ACCOUNT` secret and Firestore access by creating and joining a room.
- [x] Add GitHub Actions CI for tests, linting, and production build/type checking.
- [ ] Configure automated deployment after production credentials and project settings are supplied.

---

## Phase 4: Quality, Accessibility, and Extensions (Future)

- [x] Add unit tests for deck generation, set validation, win partitions, drawing, hand-to-table moves/swaps, end-turn cleanup, and winner state.
- [ ] Add signed-API integration tests for room lifecycle, timers, reconnect approval, and complete game flows.
- [ ] Manually verify layouts and interactions across mobile, tablet, and desktop sizes.
- [ ] Audit keyboard navigation, focus handling, reduced-motion behavior, and screen-reader labels.

### Deferred Optional Extensions

These exploratory ideas remain outside the hosted multiplayer MVP and need separate product/design decisions before implementation:

- Bot opponent for solo practice
- Sound effects, tutorial/onboarding, settings, and additional visual themes/animations
- Game history/statistics and alternate game variants

---

## Ongoing Technical Debt

- [ ] Add automated coverage for error cases, concurrent room operations, and interrupted/reconnected sessions.
- [x] Review bundle size and lazy-load Lobby and Game Board code; continue monitoring the production bundle warning.
- [ ] Document and verify production deployment, Firebase rules, and operational recovery procedures.

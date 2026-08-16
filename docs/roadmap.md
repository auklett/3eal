# 3EAL — Development Roadmap

## Current Progress: ~80% (Phase 1 Nearly Complete)

---

## Phase 1: Local Single-Player Core Test (In Progress)

### Completed ✅
- [✅] Set up local React project repository with Vite + TypeScript + Tailwind
- [✅] Implement card generation logic (105 Normal Cards + 15 Action Cards)
- [✅] Implement local state machine (Draw phase, Main phase, Discard phase, Win validation)
- [✅] Build UI card components based on 5:7 ratio (80px × 112px), `#000000` background, 3×3 grid layout with rounded corners
- [✅] Add single-player vs. bot or manual turn switching on 1 device
- [✅] Implement card rearrangement within hand (drag-and-drop + tap-to-move, both available at any time)
- [✅] Add card glow effect (4px ring; white for colored/TEAL cards, teal for white/silver & white-background action cards)
- [✅] Add hamburger menu with Rules and Players pages
- [✅] Fix player card count display (shows actual cards with Normal/Action breakdown)
- [✅] Set website favicon to the 3️⃣ emoji

### Implemented Features Detail
- **Glow effect on selected/dragged cards:** White border for colored cards; teal `#008080` glow for white/silver cards and white-background action cards
- **Tap-to-move:** Tap card to select (glows), tap another slot to move/swap, tap same to cancel — works at any time (same availability as drag-and-drop)
- **Drag-and-drop rearrangement** (existing)
- **Fixed player card count display** in Players menu (Normal + Action)
- **Action cards:** White-background action cards (CONCEAL/STEAL/REVEAL/APPEAL) show a teal glow when selected/dragged; TEAL cards show a white glow
- **Revealed cards** show yellow ring indicator
- **Website favicon** set to the 3️⃣ emoji

### Remaining for Phase 1
- [ ] Complete action card targeting UI (STEAL/REVEAL/CONCEAL with card selection)
- [ ] Add set builder workspace UI for manual set formation

---

## Phase 2: Local Multiplayer Testing

- [ ] Implement multi-player state logic locally (pass-and-play or multi-tab local sync)
- [ ] Add `APPEAL` interrupt resolution window logic (10-second timer UI)
- [ ] Validate complete set matching algorithms for all 4 patterns
- [ ] Add bot/AI opponent for single-player testing
- [ ] Polish animations and transitions for card interactions

---

## Phase 3: MVP Hosted Release

- [ ] Integrate Firebase Realtime Database for room creation and state synchronization
- [ ] Build Room Code generation and joining logic
- [ ] Implement Lobby management features (Kick, Rename, Leave, Start Game)
- [ ] Deploy repository to Cloudflare Pages via GitHub CI/CD pipeline
- [ ] Add Firebase Anonymous Authentication for player identity
- [ ] Implement real-time game state sync across clients

---

## Phase 4: Polish & Extensions (Future)

- [ ] Add sound effects and visual feedback for actions
- [ ] Implement spectator mode
- [ ] Add game statistics and history
- [ ] Create tutorial/onboarding flow
- [ ] Add settings (animation speed, color themes, etc.)
- [ ] Mobile responsiveness improvements
- [ ] Consider adding variants (team play, different deck sizes)

---

## Technical Debt & Quality

- [ ] Add unit tests for validation logic (deck.ts, validation.ts, gameEngine.ts)
- [ ] Add integration tests for game flow
- [ ] Set up CI/CD pipeline with linting and type checking
- [ ] Add ESLint/Prettier configuration
- [ ] Document public APIs with JSDoc/TypeDoc
- [ ] Performance optimization for win condition checking (memoization)
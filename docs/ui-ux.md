# 3EAL — UI/UX Specifications

## 1. Global Design System

* **Main Background Color:** `#000000` (Pure Black)
* **Main Text Color:** `#FFFFFF` (Pure White)
* **Card Aspect Ratio:** `5:7` (80px × 112px) with rounded corners (`border-radius: 12px` / `rounded-xl`)
* **Hand Layout:** Cards displayed in a 3×3 grid (max 9 cards visible at once)
* **Card Rearrangement:** Players can click cards to select and swap positions within the grid
* **Font:** System default sans-serif, clean and legible

---

## 2. Card Visual Layouts

### 2.1 Normal Cards
* **Background Color:** Solid card color (`#C0C0C0`, `#008080`, or `#C06060`).
* **Center Shape:** Drawn in `#000000` (Black) in the center of the card.
* **Shape Number:** Rendered inside the shape using the **same color as the card background**.
* **Revealed State:** Visible to all players when `isRevealed = true`.
* **Concealed State:** Face down (generic card back) when `isRevealed = false`.

### 2.2 Action Cards
* **Layout:** Centered bold title at top center; descriptive text centered below.
* **Text Color:** `#000000` (Black).
* **Background Colors:**
  * `CONCEAL`, `STEAL`, `REVEAL`, `APPEAL`: `#FFFFFF` (White background).
  * `TEAL`: `#008080` (Teal background).
* **Border:** Subtle border to distinguish from normal cards.

### 2.3 Card States
* **Selected:** Visual highlight (border glow, scale, or shadow) when clicked for rearrangement or targeting.
* **Targetable:** Visual indication when a card can be targeted by an action.
* **Disabled:** Dimmed/opacity reduced when not playable in current phase.

---

## 3. Screen Views & Page Routes

### 3.1 Home View (`/`)
* Game Title **3EAL** displayed prominently in center.
* Input box for `Room Code` + **Join Room** button.
* **Create Room** button to generate a new room code.
* Clean, minimal landing page.

### 3.2 Lobby View (`/lobby/:code`)
* Displays generated Room Code (with click-to-copy functionality).
* Player list showing joined members with names and host indicator.
* **Host Controls:** Kick member, rename room, start game.
* **Member Controls:** Leave room, rename self.
* Real-time updates when players join/leave.

### 3.3 Game Board View (`/game/:code`)
* **Header:** Game title centered, hamburger menu (upper right) with Rules and Players options.
* **Current Player Area (Top/Bottom):** Active player's hand in 3×3 grid with card rearrangement support. Players can click cards to select and swap positions.
* **Center Area:** 
  * Draw Deck (compact size, face down, shows remaining count)
  * Discard Pile (compact size, face up showing top card)
  * Current game phase status indicator (DRAW / MAIN / INTERRUPT)
* **Controls Area:** 
  * **Draw Phase:** "Draw Card" button
  * **Main Phase:** "Play Selected", "Discard Selected", "End Turn" buttons
  * **Interrupt Phase:** "Play APPEAL" button (for targeted player), countdown timer
* **Opponent Areas:** Other players' hands shown as face-down card backs with card count.

### 3.4 Hamburger Menu Pages (Overlay)
* **Rules Page:** Full game rules recap (objective, valid patterns, turn flow, action cards) with X button to return to game.
* **Players Page:** Summary list of all players showing name, card count, and host status, with X button to return.

---

## 4. Interaction Patterns

### 4.1 Card Selection & Rearrangement
1. Click a card in hand to select it (visual feedback).
2. Click another card to swap positions.
3. Click selected card again to deselect.
4. Only works during player's own turn in MAIN phase.

### 4.2 Action Card Targeting
1. Play an action card (CONCEAL/STEAL/REVEAL) from hand.
2. If targeting opponent: click target player, then click target card.
3. If CONCEAL: click own revealed card.
4. Visual feedback for valid targets (highlight, glow).
5. Confirmation before action is sent.

### 4.3 Interrupt/Appeal Flow
1. When targeted by CONCEAL/STEAL/REVEAL, game enters INTERRUPT phase.
2. Targeted player sees modal/overlay with 10-second countdown.
3. If APPEAL in hand: "Play APPEAL" button enabled.
4. If timer expires or APPEAL played: action resolves or is cancelled.
5. Game returns to MAIN phase.

### 4.4 Turn Transitions
* Smooth visual transition between phases.
* Clear indicator of whose turn it is.
* Draw animation when drawing card.
* Discard animation when discarding.

---

## 5. Responsive Design

* **Desktop:** Full 3×3 grid layout, side-by-side player areas.
* **Tablet:** Stacked layout, scrollable hand area if needed.
* **Mobile:** Single-column layout, bottom sheet for hand, tap-friendly targets (min 44px).

---

## 6. Accessibility

* **Color Contrast:** All text meets WCAG AA on dark background.
* **Focus States:** Visible focus rings for keyboard navigation.
* **Screen Readers:** Semantic HTML, ARIA labels for card states and actions.
* **Reduced Motion:** Respect `prefers-reduced-motion` for animations.

---

## 7. Implementation Status

| Component | Status |
|-----------|--------|
| Card Components (Normal, Action, Slot) | ✅ Implemented |
| Hand Grid Layout (3×3) | ✅ Implemented |
| Card Rearrangement (Click to Swap) | ✅ Implemented |
| Hamburger Menu (Rules, Players) | ✅ Implemented |
| Game Board Layout | ✅ Implemented |
| Draw Deck / Discard Pile UI | ✅ Implemented |
| Phase Indicator | ✅ Implemented |
| Action Targeting UI | 🚧 In Progress |
| Set Builder Workspace | ❌ Not Started |
| Interrupt/Appeal Timer UI | ❌ Not Started |
| Lobby/Home Views | ❌ Not Started (Phase 3) |
| Mobile Responsive | ❌ Not Started |

---

## 8. Asset Requirements

* **Card Back Design:** Generic pattern for face-down cards.
* **Shape Icons:** SVG paths for Circle, Triangle, Square, Pentagon, Hexagon.
* **Action Card Icons:** Optional small icons for each action type.
* **Sound Effects:** (Future) Draw, play, discard, win, appeal sounds.
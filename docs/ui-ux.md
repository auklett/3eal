# 3EAL — UI/UX Specifications

## 1. Global Design System

* **Main Background Color:** `#000000` (Pure Black)
* **Main Text Color:** `#FFFFFF` (Pure White)
* **Card Aspect Ratio:** `5:7` (80px × 112px) with rounded corners (`border-radius: 12px` / `rounded-xl`)
* **Table Layout:** Cards displayed in a 3×3 grid (max 9 cards — Normal + TEAL only)
* **Hand Layout:** Horizontally scrollable row / wrapping flex layout, no fixed max — grows as Action cards are drawn
* **Card Rearrangement:** Drag-and-drop, or tap-to-select then tap another slot to move/swap. Applies to the **Table** at any time. Hand ordering is cosmetic only (Action cards don't form patterns) but the same tap/drag gestures are still available for personal organization.
* **Font:** System default sans-serif, clean and legible

---

## 2. Card Visual Layouts

### 2.1 Normal & TEAL Cards
* **Normal Card Background:** Solid card color (`#C0C0FF`, `#008080`, or `#C06060`).
* **Center Shape:** Drawn in `#000000` (Black) in the center of the card.
* **Shape Number:** Rendered inside the shape using the **same color as the card background**.
* **TEAL (Wild) Card:** Background `#008080` — identical to an ordinary Teal Normal card at the color level, so it carries a distinct **wild badge** (small star/sparkle icon in a corner, or a dashed border) so it's never mistaken for a plain Teal card. No shape or number is drawn on its face — those are resolved only at set-validation time.
* **Revealed State:** Visible face-up to all players when `isRevealed = true`.
* **Concealed State:** Face down (generic card back) when `isRevealed = false`.

### 2.2 Action Cards
* **Layout:** Centered bold title at top center; descriptive text centered below.
* **Text Color:** `#000000` (Black).
* **Background Color:** `#FFFFFF` (White) for all four types — CONCEAL, STEAL, REVEAL, APPEAL. (TEAL is no longer an Action card — see 2.1.)
* **Border:** Subtle border to distinguish from Normal/TEAL cards.

### 2.3 Card States
* **Selected:** Visual highlight (border glow, scale, or shadow) when clicked for rearrangement or targeting.
  * Glow effect: 4px ring border (implemented via inline box-shadow so arbitrary colors render correctly).
  * Colored cards (Periwinkle, Teal/TEAL, Rose): **white** glow.
  * White/silver cards (`#FFFFFF`, `#C0C0FF`): **teal** (`#008080`) glow.
  * White-background action cards (CONCEAL, STEAL, REVEAL, APPEAL): **teal** (`#008080`) glow.
  * Face-down cards: **white** glow when selected/dragged.
* **Dragging:** Same glow effect (4px ring) applied during drag-and-drop.
* **Revealed Indicator:** A small **eye icon badge** (top corner) plus the existing yellow (`#FACC15`) 2px ring border. Shown wherever the card renders — including on the *owner's own* Table view. A card always looks fully "normal" to its own owner regardless of reveal state, so the eye icon is the only cue telling them which of their own cards opponents can currently see.
* **Targetable:** White outline + yellow glow when a card can be targeted by an action.
* **Disabled:** Dimmed/opacity reduced when not playable in the current phase or not a legal target (e.g. an already-Revealed card during a REVEAL targeting flow).

---

## 3. Screen Views & Page Routes

### 3.1 Home View (`/`)
* Game Title **3EAL** displayed prominently in center.
* Input box for `Room Code` + **Join Room** button.
* **Create Room** button to generate a new room code.
* **Rules** button directly below Create Room, opening the same Rules overlay used in-game (shared component — see 3.4).
* Clean, minimal landing page.

### 3.2 Lobby View (`/lobby/:code`)
* Displays generated Room Code (with click-to-copy functionality).
* Player list showing joined members with names and host indicator.
* **Host Controls:** Kick member, rename room, start game.
* **Member Controls:** Leave room, rename self.
* Real-time updates when players join/leave.

### 3.3 Game Board View (`/game/:code`)
* **Header:** Game title centered, hamburger menu (upper right) with Rules and Players options.
* **Current Player Area:** split into two zones, laid out responsively by device orientation:
  * **Landscape:** Table on the left, Hand on the right.
  * **Portrait:** Table on top, Hand on bottom.
  * **Table:** 3×3 grid, max 9 cards (Normal + TEAL), drag/drop rearrangement, each card showing Revealed/Concealed state with the eye-icon indicator where applicable.
  * **Hand:** scrollable row of Action cards, no fixed maximum.
* **Center Area:**
  * Draw Deck (compact size, face down, shows remaining count)
  * Discard Pile (compact size, face up showing top card)
  * Current game phase status indicator (DRAW / MAIN / INTERRUPT)
* **Controls Area:**
  * **Draw Phase:** "Draw Card" button
  * **Main Phase:** "Play Selected", "Discard Selected", "End Turn" buttons
  * **Interrupt Phase:** no persistent control here — replaced by the Appeal pop-up described in 4.3, which carries its own 30-second timer
* **Opponent Areas:** each opponent's **Table** rendered as a 3×3 grid — Revealed cards shown face-up (with eye icon), Concealed cards shown as face-down backs — plus a separate **Hand count badge** (Action cards; always fully hidden regardless of count).

### 3.4 Hamburger Menu Pages (Overlay)
* **Rules Page:** Full game rules recap (objective, valid patterns, turn flow, action cards), updated to reflect the current rules (3 patterns, Table/Hand zones, TEAL as a wild card). X button to return to game.
* **Players Page:** Summary list of all players showing name, **Table count** and **Hand count** (replacing the old Normal/Action breakdown), and host status, with X button to return.

---

## 4. Interaction Patterns

### 4.1 Card Selection & Rearrangement (Table only)
1. **Tap-to-Move:** Tap a Table card to select it (glow highlight appears).
2. Tap another Table slot (empty or occupied) to move/swap the card there.
3. Tap the same selected slot again to cancel the move.
4. **Drag-and-Drop:** Drag a Table card and drop onto another Table slot to swap/move.
5. Both methods work at any time (equivalent availability), allowing arrangement outside of a specific phase.

### 4.2 Action Card Targeting
1. Play an action card (CONCEAL/STEAL/REVEAL) from Hand.
2. **CONCEAL:** Opens overlay showing only the player's own Revealed Table cards (Normal or TEAL). Click to select target.
3. **STEAL:** Opens overlay → Step 1: Select target player from list. Step 2: View opponent's Table grid. Revealed cards show their true face — click directly to target. Concealed cards show a face-down back — click a slot to target it blind (you won't know what it is until the steal resolves).
4. **REVEAL:** Opens overlay → Step 1: Select target player. Step 2: View opponent's Table grid — only Concealed slots are clickable; Revealed cards are dimmed/disabled (revealing an already-Revealed card has no effect).
5. Visual feedback: Targetable cards/slots highlighted with white outline and yellow glow indicator.
6. Confirmation: Selection immediately submits the action to the server, which opens the Interrupt Phase if the action is eligible for appeal. Cancel button available to back out before confirming.
7. A stolen card keeps its Revealed/Concealed state after moving to the new owner's Table.
8. Implemented as a modal overlay with backdrop blur, matching the game's glass-panel aesthetic.

### 4.3 Interrupt / Appeal Flow
1. When CONCEAL, STEAL, or REVEAL is played, the server checks whether any eligible player currently holds an APPEAL card.
   * If **none** do, there's nothing to wait for — the action resolves immediately. No Interrupt window or pop-up is shown to anyone.
   * If **at least one** does, the Interrupt Phase begins with a **30-second** window.
2. **Only players who are both eligible *and* currently hold an APPEAL card** see a "Play APPEAL?" pop-up with **Yes / No** options:
   * STEAL / REVEAL → the single targeted opponent, if they hold one.
   * CONCEAL → each opponent who holds one, independently, each with their own pop-up.
3. Everyone else — non-eligible players, the acting player, and any eligible opponent who simply doesn't hold an APPEAL card — sees the same small, non-blocking "waiting on a decision…" notice. Nobody is shown a pop-up they can't act on, and the app never indicates *who specifically* was asked, since that would reveal who holds an APPEAL card.
4. First "Yes" the server receives wins the race: that player's APPEAL is used, the original action is cancelled, both cards go to the discard pile, and any other open pop-ups close with a "resolved" message.
5. Clicking "No" closes only that player's own pop-up early — it has no effect on other eligible players still deciding.
6. If nobody plays APPEAL within 30 seconds, all pop-ups close and the action resolves normally (skip).
7. Game returns to MAIN phase once resolved.

### 4.4 Turn Transitions
* Smooth visual transition between phases.
* Clear indicator of whose turn it is.
* Draw animation when drawing a card.
* Discard animation when discarding.

---

## 5. Responsive Design

Layout is primarily driven by **viewport orientation** (see 3.3's Table/Hand split), on top of device-specific handling:

* **Desktop:** Landscape orientation assumed; Table/Hand side by side, other players' areas arranged around the board.
* **Tablet:** Follows the same orientation rule (Table/Hand left-right in landscape, top-bottom in portrait); scrollable Hand area if it grows long.
* **Mobile:** Same orientation rule; portrait is the common case (Table top, Hand bottom, bottom-sheet style). Tap-friendly targets (min 44px) throughout, including Appeal pop-up buttons.

---

## 6. Accessibility

* **Color Contrast:** All text meets WCAG AA on dark background.
* **Focus States:** Visible focus rings for keyboard navigation.
* **Screen Readers:** Semantic HTML, ARIA labels for card states and actions. The eye icon carries an `aria-label` ("Revealed to all players") so the indicator isn't visual-only.
* **Reduced Motion:** Respect `prefers-reduced-motion` for animations.

---

## 7. Implementation Status

| Component | Status |
|-----------|--------|
| Card Components (Normal, Action, Slot) | ⚠️ Needs Update (add TEAL/Wild card visual + badge) |
| Table Grid Layout (3×3) | ⚠️ Needs Update (was "Hand Grid" — now scoped to Table only) |
| Hand Layout (unlimited, Action cards) | ❌ Not Started (new zone) |
| Card Rearrangement (Drag-and-Drop + Tap-to-Move) | ✅ Implemented (rescope to Table) |
| Card Glow Effect / Revealed Eye Icon | ⚠️ Needs Update (add eye icon) |
| Hamburger Menu (Rules, Players) | ⚠️ Needs Update (Players page: Table/Hand counts) |
| Game Board Layout (responsive Table/Hand split) | ❌ Not Started |
| Draw Deck / Discard Pile UI | ✅ Implemented |
| Phase Indicator | ✅ Implemented |
| Action Targeting UI (revealed-direct / concealed-blind) | ⚠️ Needs Rework |
| Interrupt/Appeal Pop-up (multi-responder, 30s) | ❌ Not Started |
| Home View Rules Button | ❌ Not Started |
| Lobby/Home Views | ❌ Not Started (Phase 3) |
| Mobile Responsive | ❌ Not Started |

---

## 8. Asset Requirements

* **Card Back Design:** Generic pattern for face-down cards.
* **Shape Icons:** SVG paths for Circle, Triangle, Square, Pentagon, Hexagon.
* **Wild Badge Icon:** small star/sparkle mark for TEAL cards.
* **Eye Icon:** for the Revealed indicator.
* **Action Card Icons:** Optional small icons for each action type.
* **Sound Effects:** (Future) Draw, play, discard, win, appeal sounds.
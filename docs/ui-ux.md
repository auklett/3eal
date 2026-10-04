# 3EAL — UI/UX Specifications

## 1. Global Design System

* **Main Background Color:** `#000000` (Pure Black)
* **Main Text Color:** `#FFFFFF` (Pure White)
* **Card Aspect Ratio:** `5:7` (80px × 112px) with rounded corners (`border-radius: 12px` / `rounded-xl`)
* **Table Layout:** Cards displayed in a 3×3 grid (normally max 9 cards — Normal + TEAL only); the three starting cards are face-up
* **Hand Layout:** Wrapping flex layout, no fixed max. Holds drawn cards and cards moved off the Table for end-of-turn discard; unused Action cards persist across turns.
* **Card Rearrangement:** Drag-and-drop, or tap-to-select then tap another slot to move/swap. Applies to the **Table** at any time. Reordering is local-only and is not sent to the server or synchronized to opponents.
* **Font:** System default sans-serif, clean and legible

---

## 2. Card Visual Layouts

### 2.1 Normal & TEAL Cards
* **Normal Card Background:** One of five card colors (`#C0C0FF`, `#008080`, `#C06060`, `#884488`, `#404088`).
* **Color-blind mode:** A persisted setting adds a distinct background pattern, glyph, and accessible color name.
* **Center Shape:** Drawn in `#000000` (Black) in the center of the card.
* **Shape Number:** Rendered inside the shape using the **same color as the card background**.
* **TEAL (Wild) Card:** Teal background `#008080` with the black word **TEAL** centered vertically and horizontally. No star symbols, shape, or number; its number and shape are resolved only at set-validation time.
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
* **Dragging:** Same glow effect (4px ring) applied during drag-and-drop. A card preview follows the pointer while dragging, and the original card is dimmed.
* **Revealed Indicator:** A small **eye icon badge** (top center) plus the existing yellow (`#FACC15`) 2px ring border. Shown wherever the card renders — including on the *owner's own* Table view. A card always looks fully "normal" to its own owner regardless of reveal state, so the eye icon is the only cue telling them which of their own cards opponents can currently see.
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
* Player list showing joined members with distinct names and host indicator. Names are unique in a room, ignoring surrounding whitespace and letter case.
* New players without a custom name are assigned the first available name in order: `Player 1`, `Player 2`, `Player 3`, and so on. Rejoining members retain their assigned name. A duplicate custom rename is rejected with clear feedback.
* **Host Controls:** Kick member, rename room, choose a 45/75/120-second turn limit, and start game.
* **Member Controls:** Leave room, rename self. If a room code is invalid or unavailable, offer a return-home action and a create-lobby action using the entered code.
* Player and spectator roles are selectable in the lobby; player capacity is determined by the number of starting Table cards in the deck (currently 59), with up to 8 spectators. Spectators may join an active game and see only public Tables.
* Real-time updates when players join/leave.

### 3.3 Game Board View (`/game/:code`)
* **Header:** Game title centered, hamburger menu (upper right) with Rules and Players options.
* **Current Player Area:** split into two zones, laid out responsively by device orientation:
  * **Landscape:** Table on the left, Hand on the right.
  * **Portrait:** Table on top, Hand on bottom.
  * **Table:** 3×3 grid, normally max 9 cards (a STEAL can temporarily exceed this until turn end), rearrangeable locally at any time by drag-and-drop and tap-to-select/tap-to-destination. Three cards are dealt face-up at game start; their centered eye icon signals that opponents can see them.
  * **Hand:** wrapping row with no fixed maximum. All cards are drawn here first. Normal/TEAL cards can be moved to a chosen Table slot; when the Table has 9 cards, moving one swaps with the Table card at the chosen slot. Drag a Table card into the Hand to discard it.
  * Normal and TEAL cards left in Hand at turn end are shuffled into the draw deck. Unused Action cards remain in Hand across turns.
* **Center Area:** no draw or discard pile graphics. The remaining deck count stays in the turn status area; all discarded cards are shuffled directly into the deck.
  * Current game phase status indicator (DRAW / MAIN / INTERRUPT)
* **Controls Area:**
  * **Draw Phase:** The game automatically draws one card at the start of the active player's turn.
  * **Main Phase:** "Play Selected", "Move Selected to Table" / "Swap with Selected Table Card", "Move Selected to Hand", and "End Turn" buttons
  * **Interrupt Phase:** no persistent control here — replaced by the Appeal pop-up described in 4.3, which carries the server-selected 30-second timer
* **Opponent Areas:** each opponent's **Table** rendered as a 3×3 grid — Revealed cards shown face-up (with eye icon), Concealed cards shown as face-down backs — plus online/away status. Opponent Hand counts and contents are hidden.

### 3.4 Hamburger Menu Pages (Overlay)
* **Rules Page:** Full game rules recap (objective, valid patterns, turn flow, action cards), updated to reflect the current rules (3 patterns, Table/Hand zones, TEAL as a wild card). X button to return to game.
* **Players Page:** Summary list showing name, **Table count**, only the viewer's own Hand count, and host status, with X button to return.

---

## 4. Interaction Patterns

### 4.1 Card Selection & Rearrangement (Table only)
1. **Tap-to-Move:** Tap a Table card to select it (glow highlight appears).
2. Tap another Table slot (empty or occupied) to move/swap the card there.
3. Tap the same selected slot again to cancel the move.
4. **Drag-and-Drop:** Drag a Table card and drop onto another Table slot to swap/move. The dragged-card preview follows the pointer.
5. Both methods work at any time (equivalent availability), allowing arrangement outside of a specific phase.
6. The changed Table order updates locally without a server request. Other players continue to see the authoritative card identities and do not see local rearrangement.

Hand-to-Table placement is a game action and is validated by the server. With fewer than 9 Table cards, move a selected Normal/TEAL card to a chosen slot; dropping on an occupied slot inserts the card there in the local Table layout. With 9 cards, select a Table card and move the selected Hand card, or drop on its slot; the cards swap zones. Normal/TEAL cards left in Hand are recycled at turn end; unused Action cards remain in Hand.

Cards can be dragged directly between Hand and Table as well as moved with the selection buttons. Dragging a Hand card onto a particular Table slot chooses its placement. Dragging a Table card within the Table changes only local display order.

After the winner and winning sets are shown, **Return to Lobby** opens the same room's live lobby view.

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
1. When CONCEAL, STEAL, or REVEAL is played, the server opens an interrupt window for **30 seconds**.
2. Players who are both eligible *and* currently hold an APPEAL card see a "Play APPEAL?" pop-up with **Yes / No** options:
   * STEAL / REVEAL → the single targeted opponent, if they hold one.
   * CONCEAL → each opponent who holds one, independently, each with their own pop-up.
3. Everyone else — non-eligible players, the acting player, and any eligible opponent who simply doesn't hold an APPEAL card — sees the same small, non-blocking "waiting on a decision…" notice. Nobody is shown a pop-up they can't act on, and the app never indicates *who specifically* was asked, since that would reveal who holds an APPEAL card.
4. First "Yes" the server receives wins the race: that player's APPEAL is used, the original action is cancelled, both cards are shuffled into the draw deck, and any other open pop-ups close with a "resolved" message.
5. Clicking "No" closes only that player's own pop-up early — it has no effect on other eligible players still deciding.
6. If nobody plays APPEAL before `resolveAt`, all prompts close and the action resolves normally.
7. Game returns to MAIN phase once resolved.

### 4.4 Turn Transitions
* Smooth visual transition between phases.
* Clear indicator of whether it is **your** turn or another player's turn; never rely on names alone to identify the active player. If legacy room data contains duplicate names, explicitly indicate that the active player is another account with that name.
* Automatic draw at the start of each active turn.
* Game clients heartbeat every 15 seconds. Away or expired active turns are skipped; three consecutive misses forfeit the seat. Seat recovery uses a host-approved request by unique name, with spectator fallback on decline/timeout.
* Discard animation when discarding.
* Every server-bound action immediately shows a pending state (for example, “Submitting move…”), prevents duplicate submission of that action, and then shows confirmation when accepted or a clear error if rejected. When an action is waiting on another player or a server timer, explain that wait separately from request submission.

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
| Card Components (Normal, Action, TEAL) | ✅ Implemented (TEAL word centered; no stars) |
| Table Grid Layout (3×3) | ✅ Implemented |
| Hand Layout and turn-end cleanup | ✅ Implemented (Normal/TEAL cards recycled; Action cards retained) |
| Card Rearrangement (Drag-and-Drop + Tap-to-Move) | ✅ Implemented locally; not server-synchronized |
| Unique Lobby Player Names and Numbered Defaults | ✅ Implemented |
| Pending / Confirmed / Failed Server Action Feedback | ✅ Implemented |
| Card Glow Effect / Revealed Eye Icon | ✅ Implemented |
| Hamburger Menu (Rules, Players, leave/kick) | ✅ Implemented |
| Game Board Layout (responsive Table/Hand split) | ✅ Implemented |
| Deck/discard presentation | ✅ Pile graphics removed; discards recycled directly into the deck |
| Phase Indicator | ✅ Implemented |
| Action Targeting UI (revealed-direct / concealed-blind) | ✅ Implemented |
| Interrupt/Appeal Pop-up (multi-responder, 30s) | ✅ Implemented |
| Home View Rules Button | ✅ Implemented |
| Lobby/Home Views | ✅ Implemented |
| Mobile Responsive | ✅ Responsive layout and tap targets implemented; manual device matrix remains |
| Accessibility | ⚠️ Semantic labels, focus-visible styling, and reduced-motion behavior implemented; full assistive-technology audit remains |

---

## 8. Asset Requirements

* **Card Back Design:** Generic pattern for face-down cards.
* **Shape Icons:** SVG paths for Circle, Triangle, Square, Pentagon, Hexagon.
* **TEAL Label:** the word TEAL is rendered in black at the card center.
* **Eye Icon:** for the Revealed indicator.
* **Action Card Icons:** Optional small icons for each action type.
* **Sound Effects:** (Future) Draw, play, discard, win, appeal sounds.
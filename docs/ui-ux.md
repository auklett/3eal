# 3EAL — UI/UX Specifications

## 1. Global Design System

* **Main Background Color:** `#000000` (Pure Black)
* **Main Text Color:** `#FFFFFF` (Pure White)
* **Card Aspect Ratio:** `5:7` (80px × 112px) with rounded corners (`border-radius: 12px` / `rounded-xl`)
* **Table Layout:** Cards displayed in a 3×3 grid (normally max 9 cards — Normal + TEAL only); the three starting cards are face-up
* **Hand Layout:** Wrapping flex layout, no fixed max. Holds drawn cards and cards moved off the Table; every NORMAL/TEAL card left in Hand is shuffled back into the deck at turn end, while unused Action cards persist across turns.
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
* **Revealed / Concealed State:** The reveal state belongs to the **Table slot**, not to the card. A slot is either revealed (visible face-up to all players) or concealed (face down, generic card back, identity known only to its owner).

### 2.2 Action Cards
* **Layout:** Centered bold title at top center; descriptive text centered below.
* **Text Color:** `#000000` (Black).
* **Background Color:** `#FFFFFF` (White) for all four types — CONCEAL, STEAL, REVEAL, APPEAL. (TEAL is no longer an Action card — see 2.1.)
* **Border:** Subtle border to distinguish from Normal/TEAL cards.

### 2.3 Card States
* **Selected:** A single highlight when a card is tapped for rearrangement or targeting.
  * Glow effect: exactly one 4px ring, applied via inline `box-shadow` so arbitrary card colors render correctly. The ring is **white** for TEAL, Rose, Grape Soda, French Blue, and face-down cards, and **teal** (`#008080`) for white Action cards and the light Periwinkle (`#C0C0FF`) card, where a white ring would be invisible. Exactly one card is highlighted at a time — the ring is a single layer, so a selected card never shows two rings, the slot button beneath a card adds no second ring, and a revealed card no longer draws a separate yellow outline.
* **Dragging:** The same per-background 4px ring is applied while dragging. A card preview follows the pointer and the original card is dimmed. Table rearrangement supports pointer drag (desktop) and tap-to-select (touch).
* **Revealed Indicator:** A small **eye icon badge** — a dark translucent circle containing a white eye — centered at the top of the card. It renders wherever a revealed card appears, including on the *owner's own* Table view, because a card always looks fully "normal" to its own owner and the eye is the only cue telling them which of their own cards opponents can see. The badge is suppressed on the Game Over screen, where every card is already revealed.
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
* Room codes are normalized to uppercase letters/digits and must be 4–6 characters (the digit `0` and letter `O` are distinct). A malformed code is rejected in place with a clear message and no navigation.
* If the entered code does not exist, the page offers exactly two choices in place — **Create room with this code** and **Change the code** (which clears the input) — and never navigates into a "Reconnecting…" state for a room that was never there. Creating with the code is a single atomic request; if the code is taken in the meantime it shows the conflict message (e.g. "That room code is already in use. Choose another.") and keeps both options available.

### 3.2 Lobby View (`/lobby/:code`)
* Displays generated Room Code (with click-to-copy functionality).
* Player list showing joined members with distinct names and host indicator. Names are unique in a room, ignoring surrounding whitespace and letter case.
* New players without a custom name are assigned the first available name in order: `Player 1`, `Player 2`, `Player 3`, and so on. Rejoining members retain their assigned name. A duplicate custom rename is rejected with clear feedback.
* **Host Controls:** Kick member, rename room, set a 15–180-second turn limit (default 60), and start game.
* **Member Controls:** Leave room, rename self. If the room does not exist, the lobby shows a **Room not found** panel offering **Create lobby using the entered code** and **Return home**. A genuine connection drop inside a real room instead shows **Reconnecting…**; a missing room never shows the reconnecting state.
* Player and spectator roles are selectable in the lobby. There is no configured player or spectator capacity limit — the rules are the source of truth and impose none. Spectators may join an active game and see only public Tables.
* Real-time updates when players join/leave.

### 3.3 Game Board View (`/game/:code`)
* **Header:** Game title centered, hamburger menu (upper right) with Rules and Players options. The turn-status area shows a **Pause** button to the host during play; while paused it becomes a **Game paused by host** banner with a **Resume** button (see 4.5).
* **Current Player Area:** split into two zones, laid out responsively by device orientation:
  * **Landscape:** Table on the left, Hand on the right.
  * **Portrait:** Table on top, Hand on bottom.
  * **Table:** 3×3 grid, normally max 9 cards (a STEAL can temporarily exceed this until turn end), rearrangeable locally at any time by drag-and-drop and tap-to-select/tap-to-destination. Three cards are dealt face-up at game start; their top-center eye icon signals that opponents can see them.
  * **Hand:** wrapping row with no fixed maximum. All cards are drawn here first. Normal/TEAL cards can be moved to a chosen Table slot; when the Table has 9 cards, moving one swaps with the Table card at the chosen slot. Drag a Table card into the Hand to move it there; it is shuffled back into the deck at turn end.
  * Normal and TEAL cards left in Hand at turn end are shuffled into the draw deck. All unused Action cards remain in Hand across turns.
* **Center Area:** no draw or discard pile graphics. The remaining deck count stays in the turn status area; all discarded cards are shuffled directly into the deck.
  * Current game phase status indicator (DRAW / MAIN / INTERRUPT), and a frozen countdown while paused
* **Controls Area:**
  * **Draw Phase:** The game automatically draws one card at the start of the active player's turn.
  * **Main Phase:** "Play Selected", "Move Selected to Table" / "Swap with Selected Table Card", "Move Selected to Hand", and "End Turn" buttons
  * **Interrupt Phase:** no persistent control here — replaced by the Appeal pop-up described in 4.3, which carries the server-selected 30-second timer (shown frozen while the host has the game paused)
  * **Pause / Resume (host only):** available during play and named in 4.5
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

The local layout is keyed by **card ID**, never by array index, so an incoming authoritative snapshot cannot wipe the player's arrangement. Merging a snapshot keeps a card that still exists in its current slot; a card that no longer exists drops out of the layout; and a new card takes the first empty slot, or the specific slot chosen for a Hand-to-Table placement. The layout is never reset to the server order. A Table-to-Table move is purely local — nothing is sent to the server.

Hand-to-Table placement is a game action and is validated by the server. With fewer than 9 Table cards, move a selected Normal/TEAL card to a chosen slot; dropping on an occupied slot inserts the card there in the local Table layout. With 9 cards, select a Table card and move the selected Hand card, or drop on its slot; the cards swap zones. Normal/TEAL cards left in Hand are shuffled back into the deck at turn end; unused Action cards remain in Hand.

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
6. If nobody plays APPEAL before the interrupt's `endsAt` deadline, all prompts close and the action resolves normally.
7. Game returns to MAIN phase once resolved.

### 4.4 Turn Transitions
* Smooth visual transition between phases.
* Clear indicator of whether it is **your** turn or another player's turn; never rely on names alone to identify the active player. If legacy room data contains duplicate names, explicitly indicate that the active player is another account with that name.
* Automatic draw at the start of each active turn.
* Game clients heartbeat every 15 seconds. A player disconnected for 60 seconds is marked away; their current turn and any future turns are skipped. A seat is never forfeited — it is held until the game ends. Seat recovery uses a host-approved request by a unique name, with spectator fallback on decline/timeout.
* Deck-shuffle feedback when cards return to the draw deck.
* Every server-bound action immediately shows a pending state (for example, “Submitting move…”), prevents duplicate submission of that action, and then shows confirmation when accepted or a clear error if rejected. When an action is waiting on another player or a server timer, explain that wait separately from request submission.

### 4.5 Pause & Resume
1. The host sees a **Pause** control in the turn-status area during play. Activating it sends a `pause` intent; the server is authoritative about whether it is allowed.
2. While paused, every player and spectator sees a **Game paused by host** banner. The host's control changes to **Resume**; non-hosts never see Pause or Resume.
3. Countdowns stop ticking and display their frozen values (e.g. "Paused · 30s frozen", or "timer frozen" when the frozen value is unknown). The phase label reads "Paused".
4. Game controls are disabled — the acting player cannot play cards, move cards, or end the turn, and the server rejects such attempts with "Game is paused".
5. An open Appeal pop-up stays visible, but its buttons are disabled and relabelled **APPEAL (Paused)** / **Pass (Paused)**.
6. Local Table rearrangement keeps working while paused, because it never contacts the server.
7. Resume sends a `resume` intent; the server recomputes every deadline and play continues from the frozen remaining times. The game never auto-resumes.

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
| Pending / Confirmed / Failed Server Action Feedback | ✅ Implemented (pending shown while awaiting the server, duplicate submits blocked, then confirmed or a clear error) |
| Hand/Table Move Pending Feedback | ✅ Implemented (Hand↔Table moves show pending, block duplicates, then confirm or surface the server error) |
| Configurable Turn Timer (15–180 s) | ✅ Implemented (host sets it in the lobby; default 60 s) |
| Hidden Opponent Hand Counts | ✅ Implemented (only the viewer's own hand count is shown) |
| Game Over Winning Partition | ✅ Implemented (the engine's three validated sets render as the Game Over grouping) |
| Card Glow Effect / Revealed Eye Icon | ✅ Implemented (single per-background selection ring — teal on white/Periwinkle cards, white elsewhere; dark eye badge, hidden on Game Over) |
| Home Wrong-Code Flow (exists probe + atomic create-with-code) | ✅ Implemented |
| Lobby "Room not found" vs "Reconnecting…" | ✅ Implemented |
| Host Pause / Resume (frozen timers, disabled controls) | ✅ Implemented |
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
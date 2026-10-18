# 3EAL — UI/UX Specifications

## 1. Global Design System

### 1.1 Visual language
* **Main Background Color:** `#000000` (Pure Black)
* **Main Text Color:** `#FFFFFF` (Pure White)
* **Cards are the only colourful things.** Everything else is monochrome: 1px `white/10` lines, `rounded-2xl` panels on a `white/[0.03]` fill, generous spacing, and calm sentence-case headings (no all-caps shouting). Fun comes from motion and detail, not decoration.
* **Card Aspect Ratio:** `5:7`, drawn at three sizes:
  * `md` — 80px × 112px (the Table and Hand hero size on desktop, `border-radius: 12px`).
  * `sm` — 64px × 90px (overlays, the opponent-table modal, and the Table/Hand on narrow screens).
  * `xs` — 32px × 45px (the opponents rail's mini 3×3 Table).
* **Table Layout:** 3×3 grid, normally max 9 cards (Normal + TEAL only); the three starting cards are face-up.
* **Hand Layout:** On desktop it is the column beside the Table; on mobile it is a bottom dock with a horizontal, scrollable card row. No fixed maximum. Holds drawn cards and cards moved off the Table; every NORMAL/TEAL card left in Hand is shuffled back into the deck at turn end, while unused Action cards persist across turns.
* **Card Rearrangement:** Drag-and-drop, or tap-to-select then tap another slot to move/swap. Applies to the **Table** at any time. Reordering is local-only and is not sent to the server or synchronized to opponents.

### 1.2 Design tokens (`src/index.css`, Tailwind v4 `@theme`)
| Token | Value | Used for |
|---|---|---|
| `--font-sans` | `"Outfit", ui-sans-serif, system-ui, …` | All UI text |
| `--font-mono` | `"JetBrains Mono", ui-monospace, …` | Room codes, timers, counts, `Deck`/`Sets`, turn numbers (always with `tabular-nums`) |
| `--radius-panel` | `1rem` | Panels (`rounded-2xl`) |
| `--radius-control` | `0.75rem` | Buttons, inputs, slots |
| `--color-line` | `rgb(255 255 255 / 0.1)` | All 1px borders |
| `--color-panel` | `rgb(255 255 255 / 0.03)` | Panel fill |
| `--color-accent` | `#ffffff` | Focus/active states — **never a card colour** |
| `--color-muted` | `rgb(255 255 255 / 0.55)` | Secondary text |
| `--animate-float / fade-in / fade-out / card-in / pop-in / pulse-soft / shuffle-out` | keyframes | The motion vocabulary (see 6, all disabled under `prefers-reduced-motion`) |

* **Fonts:** Outfit (UI) and JetBrains Mono (codes/timers/counts). They are referenced first in the token stacks with system fallbacks, so the app renders correctly even where the webfonts are not installed.
* **Color-blind mode** and reduced motion are honoured across every new component.

### 1.3 Shared primitives (`src/components/ui/`)
* **`Panel`** — the single surface: `rounded-2xl`, `border` `white/10`, `bg white/[0.03]`, with `padding` variants (`none` / `compact` / `normal` / `roomy`).
* **`Button`** — `primary` = white fill + black text; `secondary` = outline; `ghost` = text; `danger` = rose accent. Every size keeps a **≥ 44px** touch target and a visible focus ring.
* **`Chip`** — small monospace pill for room codes, timers, and `Deck n` / `Sets n/3`.
* **`Badge`** — tiny status label (`Host`, `You`, `Away`, `Turn`).
* **`IconButton`** — 44px square bordered icon button with a required accessible `label`.
* **`ConnectionDot`** — green when connected, amber (gently pinging) when reconnecting.
* **`SpinnerDots`** — the three-dot “waiting…” indicator.


---

## 2. Card Visual Layouts

### 2.1 Normal & TEAL Cards
* **Normal Card Background:** One of five card colors (`#C0C0FF`, `#008080`, `#C06060`, `#884488`, `#404088`).
* **Color-blind mode:** A persisted setting adds a distinct background pattern, glyph, and accessible color name.
* **Center Shape:** Drawn in `#000000` (Black) in the center of the card.
* **Shape Number:** Rendered inside the shape using the **same color as the card background**.
* **TEAL (Wild) Card:** Teal background `#008080` with the black word **TEAL** centered vertically and horizontally. No star symbols, shape, or number; its number and shape are resolved only at set-validation time.
* **Revealed / Concealed State:** The reveal state belongs to the **Table slot**, not to the card. A slot is either revealed (visible face-up to all players) or concealed (face down, generic card back, identity known only to its owner).
* **In a completed set:** When the viewer's Table already contains a completed valid set, the cards of that set get a soft white outline (`outline-2 outline-offset-2 outline-white/40` on the slot) **and** their accessible label is extended with "part of a set" — the state is never colour-only. The engine's partition helper drives a full nine-card Table; a smaller Table uses the engine's `isValidSet` for a best-effort grouping. If only a count were available, only the `Sets n/3` chip would be shown.

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

### 2.4 Card Back
* A face-down card is a near-black panel (`#131316`) with a 1px `#3a3a40` border, a subtle 45° hairline pattern, an inset hairline frame, and a faint `3EAL` monogram. It reads instantly as face-down at every size (`xs` in the opponents rail through `md` on the Table) and carries `aria-label="Concealed card"`.

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
A single centered column (max ~520px) using the same glass-panel feel as Home, built entirely from the shared primitives.
* **Room code hero:** the code is large JetBrains Mono, letter-spaced, and click-to-copy; a brief inline **Copied** confirmation appears under it (no toast). A small **connection dot** (green connected / amber reconnecting) replaces the old "connected" text; a real drop also shows a **Reconnecting…** label.
* **Players list:** one row per member — a neutral monochrome avatar circle (first letter), the name, a **Host** badge, and a **You** badge for the viewer, plus an **Away** badge when applicable. New members animate in and leavers fade out. Spectators live in a collapsed-by-default **Spectators (n)** group.
* **Your name:** edited inline (Edit → input → Save/Cancel) rather than in a separate section. A rejected rename shows the server's message inline under the field and keeps the current name. The unique numbered `Player N` default behaviour is unchanged.
* **Role switch:** a two-option segmented control (**Player** / **Spectator**) that sends `setRole`.
* **Host controls (host only, one panel):** a **Turn timer** slider (15–180 s, step 5) with a mono `Ns` readout and the existing validation (default 60); **Start game** as the primary white full-width button, disabled with a one-line reason when there are fewer than two players or the connection is down; **Kick** rows use a two-step confirm (Kick → Kick/Cancel) instead of a tiny link. Non-hosts instead see **Waiting for host to start** with an animated dots indicator.
* **Leave room:** a ghost button at the bottom.
* **Room not found** and **Reconnecting…** keep their exact distinct behaviour (a missing room never shows reconnecting). A missing room renders a centered card offering **Create lobby using the entered code** and **Return home**.
* A subtle floating trio of decorative cards sits above the panel, echoing Home.
* Player list updates in real time as members join/leave; names stay unique (whitespace/case-insensitive) and default to `Player 1`, `Player 2`, …
* Player and spectator roles are selectable in the lobby. There is no configured capacity limit. Spectators may join an active game and see only public Tables.
* **Rename room** is intentionally omitted: the protocol has no rename-room message and the redesign is presentation-only. Every other host control is present.

### 3.3 Game Board View (`/game/:code`)
* **Top bar (sticky):** a small `3EAL` wordmark, a mono room-code **chip**, the **connection dot**, and `Players` / `Leave` buttons. Compact on mobile.
* **Turn banner (below the top bar):**
  * Left: an explicit **"Your turn"** or **"{Name}'s turn"** with a phase chip (**Main** / **Interrupt** / **Paused**). The active player's identity never rests on the name alone; if legacy data contains duplicate names, the banner says it is *another player with that name*.
  * Right: the turn timer as a thin progress bar plus a mono `Ns` (the bar grows to a gentle pulse under 10s), mono chips `Deck n` and `Sets n/3`, and — for the host — **Pause** (or **Resume** while paused).
  * While an interrupt is open the turn timer is marked **Turn paused** and the 30-second appeal timer is shown separately.
  * While paused the banner reads **Game paused by host** and every countdown shows its frozen value.
  * The viewer's own area and the banner get a soft white ring/glow when it is their turn.
* **Opponents rail:** a horizontally scrollable row under the banner (a grid on wide screens) so every opponent's Table is visible without scrolling. Each opponent is a compact panel: name, away/online dot, an active-**Turn** badge, a mono `Table n` chip, and a **mini 3×3 Table** at `xs` size — revealed cards face-up with the tiny eye badge, concealed cards as the generic back, empty slots as faint dashed outlines. Tapping the opponent's name opens a larger view of their Table for reading cards. The host's **Kick** lives inside a host-only (⋯) overflow menu in that modal, not as a visible link. Opponent hand size/holdings are never shown.
  * *Opponent `Sets n/3` is not shown:* set membership depends on concealed card identities the viewer is not allowed to know, so the rail shows only the public Table count.
* **Your area:**
  * **Table:** the visual hero — a centered 3×3 grid (`md` cards on desktop, `sm` on narrow screens). Header **"Your Table"** with a mono `n/9`. Empty slots are dashed rounded outlines with a subtle `+` on hover/tap. A small info control reveals "Tap two slots to swap · drag to rearrange (local only)" in a popover, plus a one-time dismissible first-use hint. Completed valid sets get the soft outline described in 2.1. Steering hint: the board never relies on a tiny line of text.
  * **Hand:** a dock. Portrait mobile fixes it to the bottom as a horizontally scrollable row with a Show/Hide handle; desktop places it beside the Table. Header **"Your Hand"** with a mono count. The empty state is a single subtle line. Action cards are grouped to the right behind a small **Action** divider; Normal/TEAL cards sit left of it with the hint "returns to deck at turn end".
  * **Controls:** an "End turn" primary button sits with the Hand header, and the contextual **Move Selected to Table / Move Selected to Hand** buttons appear (just under the Table) only when a card is selected and the action is legal — otherwise hidden. Pending ("Submitting move…"), confirmation, and inline recoverable errors are shown exactly as before (4.4).
  * Selected/dragging ring and eye-badge placement are unchanged (2.3).
* **Center area:** no draw or discard pile graphics. The remaining deck count stays in the turn banner; all discarded cards shuffle straight into the deck.
* **Opponent Areas:** rendered in the opponents rail and in the per-opponent modal (see above); opponent Hand counts and contents are hidden.
* **Game over:** the title reads **Game over** with **"{Name} wins"**, the three winning sets render as three labelled groups of three cards (all face-up, eye badges suppressed), with a subtle card-pop animation (off under reduced motion) and a primary **Return to Lobby** button.
* **Players overlay:** accessible from the top bar; rows show name, mono Table count, and host/away badges, and only the viewer's own Hand count. Rules are reachable from this overlay.

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
8. **Presentation:** targeting stays on the live board rather than behind a blocking modal. Selecting a CONCEAL/STEAL/REVEAL card shows a slim, non-blocking step indicator above the Table — **"1 Choose player → 2 Choose card"** — with a visible **Cancel**; targetable cards get the white-outline + yellow-glow treatment from 2.3 and illegal ones are dimmed. The board is deliberately *not* covered, because local Table rearrangement must keep working during an action flow (it never contacts the server). A separate per-opponent modal (opened from the opponents rail) is used for reading an opponent's Table.

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
8. **Presentation (4.3):** the prompt is a **bottom sheet on mobile / centered card on desktop**: the APPEAL card art, a large 30-second ring countdown with mono seconds, and big (≥ 44px) **Yes / No** buttons. It is rendered **non-modally** (a `pointer-events-none` backdrop with an interactive sheet) so it never blocks the rest of the board. As specified in 4.5, while paused the buttons are disabled and relabelled **APPEAL (Paused)** / **Pass (Paused)**. Everyone else sees only the same small, non-blocking "Waiting on a decision…" notice, so who holds APPEAL is never revealed.
9. Short interrupt results (for example "STEAL was appealed") appear inline in the turn banner and dismiss themselves.

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

The board is driven by the breakpoint `md` (768px): below it the layout is the portrait/compact arrangement, at and above it the desktop arrangement.

* **Desktop / landscape:** Table on the left, Hand dock on the right; the opponents rail runs across the top as a grid. Everything (Table, Hand, controls, and every opponent Table) fits without page scrolling in a 2–4 player game.
* **Mobile / portrait (down to 360px):** compact top bar, the opponents rail scrolls horizontally, the Table uses `sm` cards and scales to the viewport width, and the Hand is a fixed bottom dock with the controls in its header and a Show/Hide handle. There is no horizontal page scroll. Cards are `sm` so the Table stays reachable; a short vertical scroll may be needed to see the lowest Table row behind the bottom dock, which is inherent to putting a 3×3 Table and a Hand on a 360px screen.
* **Touch targets:** ≥ 44px everywhere (buttons, slots, appeal buttons, icon buttons).
* **Tablet:** falls between the two — same `md` rule, side-by-side in landscape and stacked in portrait.

---

## 6. Accessibility

* **Color Contrast:** All text meets WCAG AA on dark background.
* **Focus States:** Visible white focus rings for keyboard navigation (`:focus-visible` is the single white accent; never a card colour).
* **Keyboard:** full tab order; **Escape** closes every overlay; focus is trapped inside a modal (`useDialog`) and restored to the previously focused element on close.
* **Screen Readers:** Semantic HTML and ARIA labels for card states and actions. Table-slot labels include revealed/concealed state and "part of a set" where relevant; the eye icon carries `aria-label="Revealed to all players"`; the selection ring is decorative only. Turn changes, interrupt open/close, pause/resume, and errors are announced through an `aria-live="polite"` region built into the board.
* **Never colour-only:** completed sets use an outline plus a label, the active turn uses a ring plus the explicit "Your turn" text, and away/connection state uses a dot plus a badge/label.
* **Reduced Motion:** every new animation is `motion-safe:`-gated and additionally disabled by the global `prefers-reduced-motion` rule.
* **Color-blind mode:** the glyph/pattern/label treatment from 2.1 is preserved across all card sizes.

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
| Hamburger Menu (Rules, Players, leave/kick) | ✅ Implemented (top-bar **Players** overlay + per-opponent modal with a host-only Kick; Rules reachable from the overlay) |
| Game Board Layout (responsive Table/Hand split) | ✅ Implemented |
| Shared Design System (tokens + `Panel`/`Button`/`Chip`/`Badge`/`IconButton`/`ConnectionDot`/`SpinnerDots`) | ✅ Implemented; reused on Home, Lobby, Game, and Rules |
| Fonts (Outfit + JetBrains Mono, tabular figures) | ✅ Implemented via `@theme` tokens with system fallbacks |
| Lobby Redesign (code hero, players/spectators, inline name edit, role switch, host controls, waiting state) | ✅ Implemented |
| Opponents Rail + per-opponent Table modal | ✅ Implemented (mini `xs` Tables; opponent Sets counts intentionally omitted as they depend on hidden information) |
| Completed-set outline on the viewer's Table | ✅ Implemented (engine partition for 9 cards, `isValidSet` grouping otherwise; always paired with a text/aria label) |
| Appeal bottom sheet (card art + 30s ring + Yes/No) | ✅ Implemented (non-modal; paused labels per 4.5) |
| Motion vocabulary (draw, shuffle, steal, banner crossfade, active pulse) | ✅ Implemented behind `motion-safe` + `prefers-reduced-motion` |
| Accessibility pass (aria-live announcements, focus trap + restore, Escape) | ✅ Implemented; full assistive-technology audit remains |
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

* **Card Back Design:** Generic pattern for face-down cards — ✅ implemented (2.4): near-black panel, hairline diagonal pattern, inset frame, faint `3EAL` monogram.
* **Shape Icons:** SVG paths for Circle, Triangle, Square, Pentagon, Hexagon.
* **TEAL Label:** the word TEAL is rendered in black at the card center.
* **Eye Icon:** for the Revealed indicator.
* **Action Card Icons:** Optional small icons for each action type.
* **Sound Effects:** (Future) Draw, play, discard, win, appeal sounds.
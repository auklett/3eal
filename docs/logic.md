# 3EAL — Logic & State Engine

## 1. Core Data Schemas

### 1.1 Card Schema
```typescript
type Color = 'periwinkle' | 'teal' | 'rose' | 'grape' | 'frenchBlue';
type Shape = 'circle' | 'triangle' | 'square' | 'pentagon' | 'hexagon';
type NumberValue = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type ActionKind = 'CONCEAL' | 'STEAL' | 'REVEAL' | 'APPEAL';

type NormalCard = { id: string; kind: 'normal'; color: Color; number: NumberValue; shape: Shape };
type TealCard   = { id: string; kind: 'teal' };                        // the wild card
type ActionCard = { id: string; kind: 'action'; action: ActionKind };
type Card       = NormalCard | TealCard | ActionCard;
```

Reveal state is **not** stored on the card. It lives on the Table slot as `{ card: TableCard; revealed: boolean }`, because the same card can be concealed on one Table and then revealed on another after a STEAL. Only NORMAL and TEAL cards can sit on a Table; ACTION cards only ever exist in a Hand.

### 1.2 Player Schema
```typescript
type RoomPlayer = {
  id: string;            // Public participant ID; never used as a session credential
  sessionIds: string[];  // Private reconnect credentials; never included in views
  name: string;          // Unique within a room, after trimming and case folding
  connected: boolean;
  away: boolean;
  awayAt: number | null; // When the away clock started, or null while present
  kicked: boolean;
  table: { card: TableCard; revealed: boolean }[]; // NORMAL + TEAL only, max 9
  hand: Card[];          // Private authoritative hand; clients see only their own
};
```

### 1.3 Lobby Display Names

- Every room has distinct player names, compared case-insensitively after trimming whitespace.
- New players without a custom name receive the first available default in the sequence `Player 1`, `Player 2`, `Player 3`, and so on.
- When a player leaves, their Player N number becomes available for reuse by future players joining with the default name.
- A returning member keeps their existing name rather than receiving a new default.
- An explicit rename to a name already used in that room is rejected with a clear message; the current name remains unchanged.
- Name uniqueness is enforced by the server inside the room transaction so concurrent joins cannot create duplicates.

### 1.4 Lobby & Game State Schema
```typescript
type RoomState = {
  roomCode: string;                        // 4-6 uppercase alphanumeric characters, generated or chosen by the creator
  phase: 'lobby' | 'playing' | 'finished';
  hostId: string;
  players: RoomPlayer[];
  spectators: RoomSpectator[];             // no configured capacity limit; see rules.md
  turnDurationSeconds: number;             // 15–180, default 60
  deck: Card[];                            // draw deck; discards are shuffled straight back in
  activePlayerId: string | null;
  turnNumber: number;
  turnEndsAt: number | null;               // absolute deadline, or null while paused
  turnRemainingMs: number | null;          // frozen turn time captured on pause
  pendingAction: { actionCard: ActionCard; interrupt: InterruptState } | null;
  lastInterruptResult: LastInterruptResult | null;
  winnerId: string | null;
  winningSets: string[][] | null;          // card IDs of the three validated sets, grouped 3×3
  paused: boolean;
  pauseRemaining: PauseRemaining | null;   // frozen turn/interrupt/away/rejoin countdowns
  randomSeed: string;                      // seeded RNG; stays in Durable Object state
  randomCounter: number;
  rejoinRequests: RejoinRequest[];
  skipAfterInterrupt: boolean;
};

type PauseRemaining = {
  turn: number | null;                     // ms left on the turn timer
  interrupt: number | null;                // ms left on the appeal window
  away: Record<string, number>;            // playerId -> ms left before away skip
  rejoin: Record<string, number>;          // requestId -> ms left before timeout
};
```

While `paused` is true every absolute deadline is cleared (so an alarm cannot fire) and each countdown's remaining time is stored in `pauseRemaining`. Resuming sets each deadline back to `now + remaining` and reschedules the room's single alarm to the earliest one.

Interrupt eligibility is deliberately **not** stored as a broadcastable list. Whether a player is a legal target is public; whether that player also holds an APPEAL card is private and is re-checked per socket from the authoritative hand, never serialized into a view.

## 2. Deck Generation & Combinations

- **Normal Deck:** Color (5) × Number (7) × Shape (5) = **175 Normal Cards**
- **Wild Deck:** **3 TEAL Cards** — fixed color, flexible number/shape
- **Action Deck:** 10 copies × 4 types = **40 Action Cards**
- **Total Deck Size:** **218 Cards**

### Normal Card Colors:
- `C0C0FF` — Periwinkle
- `008080` — Teal
- `C06060` — Rose
- `884488` — Grape Soda
- `404088` — French Blue

### Normal Card Numbers: 1–7

### Normal Card Shapes: Circle, Triangle, Square, Pentagon, Hexagon

### Action Card Types (10 copies each):
1. **CONCEAL** — Hide one of your own Revealed Table cards
2. **STEAL** — Take a Normal or TEAL card from an opponent's Table
3. **REVEAL** — Force a Concealed card on an opponent's Table to become Revealed
4. **APPEAL** — Block an opponent's CONCEAL, STEAL, or REVEAL

### Wild Card:
- **TEAL** — fixed Teal color (`008080`), flexible shape/number. Drawn into Hand first, then may be moved to the Table during Main.

## 3. Action Handlers & Rules Engine

### 3.1 CONCEAL
- **Target:** Player's own revealed Table card (Normal or TEAL).
- **Effect:** Marks that Table slot concealed (`revealed = false`).
- **Eligible to APPEAL:** Any other player — a CONCEAL benefits its user against the whole table, so everyone has standing to contest it.
- **Phase:** Played during MAIN phase, triggers INTERRUPT phase.

### 3.2 STEAL
- **Target:** Any Normal or TEAL card on an opponent's Table.
  - If the target is Revealed, the acting player selects it directly.
  - If the target is Concealed, the acting player selects a slot blind — the server resolves which card it is; the result is known only to the acting player and the original owner until/unless it's Revealed later.
- **Effect:** Moves the card from the opponent's Table to the acting player's Table, **preserving its Revealed/Concealed state**.
- **Restrictions:** Action cards can never be targeted (they live in Hand, not Table — structurally unreachable). Cards inside a completed set are **not** protected; nothing on the Table is safe from STEAL.
- **Eligible to APPEAL:** Only the targeted player.
- **Phase:** Played during MAIN phase, triggers INTERRUPT phase.

### 3.3 REVEAL
- **Target:** A Concealed card on an opponent's Table, selected blind. (Targeting an already-Revealed card is not allowed — there's no effect to gain.)
- **Effect:** Marks that Table slot revealed (`revealed = true`, visible to all players).
- **Eligible to APPEAL:** Only the targeted player.
- **Phase:** Played during MAIN phase, triggers INTERRUPT phase.

### 3.4 APPEAL
- **Trigger:** During the INTERRUPT phase, by a player eligible under the action's targeting rule and holding an APPEAL card. Eligibility is checked against private server state and is not broadcast as a player list.
- **Effect:** Cancels `pendingAction`; both the original action card and the APPEAL card are shuffled straight back into the draw deck.
- **Race Resolution:** If multiple eligible players attempt APPEAL (only possible for CONCEAL, which can have several eligible players), the first appeal the server receives wins and is recorded as the interrupt outcome (`appealed`, with `appealedBy`); later attempts are rejected.
- **Window:** At most 30 seconds from action creation. The window closes as soon as an APPEAL wins or all eligible players pass; players without APPEAL pass automatically. The turn timer is paused until the interrupt resolves, and a host pause freezes the appeal window too (see §4).

### 3.5 TEAL (Wild Card — not an action)
- Lives on the Table alongside Normal cards; dealt and drawn the same way.
- Fixed color: `008080` (Teal).
- Number and shape are left unset on the card itself and are resolved dynamically, per-set, whenever the validation engine checks whether a group of 3 Table cards forms a valid set.
- Targetable exactly like a Normal Table card — STEAL, REVEAL, and CONCEAL all apply to it the same way.

## 4. Game Flow & Turn Phases

### Phase Sequence:
1. **DRAW** — At the start of each turn, the active player automatically draws 1 card from the deck. Discarded cards are shuffled straight back into that same deck, so the deck only runs out when every card is in play; if no card is available, none is drawn. Every card initially goes to Hand.
2. **MAIN** — Player may, in any order, any number of times:
   - Move NORMAL/TEAL cards from Hand to an open Table slot; at 9 cards this swaps with a selected Table card and returns the replaced card to Hand.
   - Move any number of NORMAL/TEAL cards from their Table to Hand (they are shuffled back into the deck at turn end).
   - Play CONCEAL, STEAL, or REVEAL from their Hand — each triggers INTERRUPT.
   - Rearrange their own Table freely. Arrangement is purely local presentation order: it never contacts the server and is not synchronized to opponents.
3. **INTERRUPT** — Eligible player(s) have 30 seconds to play APPEAL; if none do, the action resolves and phase returns to MAIN.
4. **End Turn** — All unused Action cards remain in Hand; every other card left in Hand is shuffled straight back into the deck. If a STEAL left more than 9 cards on the Table, move cards into Hand until it is back to nine (Action cards are never moved this way). Then check for a win; the server records the valid partition it finds in `winningSets`, and the turn passes to the next player. The default turn timer is 60 seconds and the host may set it to 15–180 seconds in the lobby.

### Pausing
The host may pause and resume at any time while `phase === 'playing'`; pause controls are unavailable in the lobby and after the game ends. On pause the engine clears every absolute deadline, stores each remaining time in `pauseRemaining`, sets `paused = true`, and stops scheduling an alarm. While paused `reduceRoom` rejects every game intent with `Game is paused` (placing, moving, ending a turn, appealing, passing, targeting, role changes); host management (kick, approve/decline rejoin) is handled outside the pure game reducer and stays available. Players may still rearrange their own Table because that path never reaches the server. Resume recomputes each deadline and re-arms the room alarm. The game never auto-resumes, including when host ownership transfers; the new host receives the controls.

## 5. Win Condition Validation (Pattern Engine)

A player wins when their **Table** holds **3 complete sets of 3 cards** (9 cards total).

A set of 3 Table cards is valid if it meets **at least one** of these patterns:

| Pattern | Description |
|---------|-------------|
| **Same Color** | All 3 cards share identical color (TEAL counts as `008080`) |
| **Same Number** | All 3 cards share identical number (TEAL adopts any number) |
| **Same Shape** | All 3 cards share identical shape (TEAL adopts any shape) |

*(Consecutive Numbers has been removed as a valid pattern.)*

### TEAL Card Behavior in Patterns:
- **Color:** Always counts as `008080` (Teal)
- **Number:** Can adopt any number 1–7 to complete a pattern
- **Shape:** Can adopt any shape to complete a pattern

### Validation Logic:
- Only Table cards (Normal + TEAL) are ever considered; Action cards and unplaced Normal/TEAL cards in Hand are excluded.
- Requires exactly 3 cards per set, and exactly 3 disjoint sets covering all 9 Table cards to win.
- Checks all 3 patterns — any single match validates a set.
- **Resolved (previously an open question):** earlier drafts worried about a tie-break for "the" completed set when multiple valid groupings exist. That question only mattered for *protecting* set cards from STEAL — and since STEAL can already target any Table card regardless of set membership (see the zones/visibility rules in `rules.md`), there's nothing left to protect, so no tie-break is needed for correctness.
  - `checkWinCondition()` only needs to confirm *some* valid partition of the 9 Table cards into 3 sets exists — an existence check, not an identification of specific groupings.
  - Mid-game progress display (e.g. "2/3 sets" on the Players overlay) only needs a count — `completeSetCount()` finds the maximum number of disjoint valid sets in the current Table via a greedy/max-matching search. Which exact cards land in which set doesn't need to be pinned down before the win moment.
  - The pure shared engine searches all 280 ways to partition nine cards into three sets and accepts any valid partition. At the winning turn it records the partition it found in `winningSets` (each set as an array of card IDs), which is persisted and included in the public Game Over snapshot so every client renders the same three groups.

## 6. Implementation Files

Table-card arrangement is presentation order only: a player may move or swap their own Table cards at any time using tap-to-select/tap-to-destination or drag-and-drop. The order is local to that browser and never calls the server or changes what opponents see. The client keeps this order in a local layout keyed by card ID and merges each incoming authoritative snapshot onto it, so a card the player moved stays where they put it while new/removed cards resolve around it.

Client commands should provide immediate pending feedback while waiting on the authoritative server response, then show a confirmed result or a recoverable error. A pending indicator acknowledges that a request was sent; it must not claim that the state has already changed.

Discards have no separate pile: `discardToDeck` shuffles discarded cards straight back into the draw deck, which is done deterministically through the seeded RNG so replays and tests remain reproducible.

The Cloudflare Worker routes each room to its SQLite-backed `GameRoom` Durable Object. It persists authoritative state in one row and broadcasts a full, role-filtered snapshot. Public participant IDs and private session IDs are separate; views never contain session IDs, hands, deck order, or concealed card identities belonging to another player. Spectators receive the same public data as opponents.

| File | Purpose |
|------|---------|
| `game/packages/engine/src/deck.ts` | Seeded deck generation and shuffling |
| `game/packages/engine/src/sets.ts` | Set validation, maximum complete-set count, and the 9-card partition search |
| `game/packages/engine/src/room.ts` | Pure room lifecycle, turn, timer, pause/resume, away, and rejoin reducers |
| `game/packages/engine/src/interrupts.ts` | Appeal eligibility, automatic pass, and interrupt resolution |
| `game/src/logic/tableLayout.ts` | Local-only Table layout merge/move helpers |
| `game/src/logic/createRoom.ts` | Room-code validation, exists probe, and atomic create-with-code |
| `game/worker/gameRoom.ts` | Durable Object persistence, WebSocket views, alarms, and the internal exists check |
| `game/worker/views.ts` | Player/spectator filtering of authoritative state |

## 7. Protocol Notes

Every client/server message is Zod-validated in `src/shared/protocol.ts`.

- **Pause / resume intents:** the host sends `{ t: 'pause' }` and `{ t: 'resume' }`. The server is authoritative about whether the host may pause; the resulting state arrives as a filtered `view` snapshot with `paused`, `pauseRemaining`, and null deadlines.
- **Interrupt deadline:** the current interrupt's appeal deadline is the `endsAt` field (`number | null`). It is `null` while the game is paused, with the frozen remaining time in `pauseRemaining.interrupt`.
- **`winningSets`:** the FINISHED snapshot carries `winningSets: string[][] | null` — the card IDs of the three validated sets (grouped 3×3) the engine found — so every client renders the same Game Over grouping.
- **Rejection error:** while `paused` is true the server rejects game intents (placing, moving, ending a turn, appealing, passing, targeting) and answers with the error message `Game is paused`.

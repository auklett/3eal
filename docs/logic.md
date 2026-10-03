# 3EAL — Logic & State Engine

## 1. Core Data Schemas

### 1.1 Card Schema
```typescript
type CardCategory = 'NORMAL' | 'WILD' | 'ACTION';
type CardColor = 'C0C0FF' | '008080' | 'C06060';
type CardShape = 'circle' | 'triangle' | 'square' | 'pentagon' | 'hexagon';
type ActionType = 'CONCEAL' | 'STEAL' | 'REVEAL' | 'APPEAL';

interface Card {
  id: string; // Unique instance ID (e.g., "card_042")
  category: CardCategory;
  isRevealed: boolean; // Only meaningful for NORMAL/WILD cards while on a Table

  // Normal & Wild Card Attributes (undefined for pure ACTION cards)
  color?: CardColor;   // WILD is always '008080'
  number?: number;     // 1-7; unset for WILD until resolved at set-check time
  shape?: CardShape;   // unset for WILD until resolved at set-check time

  // Action Card Attributes (undefined for NORMAL/WILD cards)
  actionType?: ActionType;
  title?: string;
  description?: string;
}
```

### 1.2 Player Schema
```typescript
interface Player {
  id: string;
  name: string; // Unique within a room, compared after trimming and case folding
  isHost: boolean;
  table: Card[]; // NORMAL + WILD cards only, max 9
  hand: Card[];  // Private zone for drawn cards and Table cards pending discard
  sets: Array<{ cards: Card[] }>; // Firestore-safe representation of the winning partition
}
```

### 1.3 Lobby Display Names

- Every room has distinct player names, compared case-insensitively after trimming whitespace.
- New players without a custom name receive the first available default in the sequence `Player 1`, `Player 2`, `Player 3`, and so on.
- A returning member keeps their existing name rather than receiving a new default.
- An explicit rename to a name already used in that room is rejected with a clear message; the current name remains unchanged.
- Name uniqueness is enforced by the server inside the room transaction so concurrent joins cannot create duplicates.

### 1.4 Lobby & Game State Schema
```typescript
interface RoomState {
  roomCode: string; // 4-6 alphanumeric random string
  status: 'LOBBY' | 'IN_GAME' | 'FINISHED';
  players: Record<string, Player>; // Keyed by Player ID
  hostId: string;

  // Active Game State
  game?: {
    deck: Card[];
    discardPile: Card[];
    activePlayerId: string;
    turnPhase: 'DRAW' | 'MAIN' | 'INTERRUPT';
    pendingAction?: {
      sourcePlayerId: string;
      actionType: 'CONCEAL' | 'STEAL' | 'REVEAL';
      actionCardId: string;
      targetPlayerId: string;  // = sourcePlayerId for CONCEAL (self-target)
      targetCardId: string;    // known to the server even when blind
      wasBlindTarget: boolean; // true if the targeted card was Concealed at selection time
      appealWindowEndsAt: number; // timestamp, creation + 30s
      resolvedByPlayerId?: string; // set once an APPEAL wins the race
      // No `eligibleAppealPlayerIds` here by design — see §3.4. Who's
      // eligible by targeting rule is public; who ALSO holds an APPEAL
      // card is private and must never be broadcast as a list, or it
      // leaks hand contents to the rest of the room.
    };
    winnerId: string | null;
  };
}
```

## 2. Deck Generation & Combinations

- **Normal Deck:** Color (3) × Number (7) × Shape (5) = **105 Normal Cards**
- **Wild Deck:** **3 TEAL Cards** — fixed color, flexible number/shape
- **Action Deck:** 3 copies × 4 types = **12 Action Cards**
- **Total Deck Size:** **120 Cards**

### Normal Card Colors:
- `C0C0FF` — Periwinkle
- `008080` — Teal
- `C06060` — Rose

### Normal Card Numbers: 1–7

### Normal Card Shapes: Circle, Triangle, Square, Pentagon, Hexagon

### Action Card Types (3 copies each):
1. **CONCEAL** — Hide one of your own Revealed Table cards
2. **STEAL** — Take a Normal or WILD card from an opponent's Table
3. **REVEAL** — Force a Concealed card on an opponent's Table to become Revealed
4. **APPEAL** — Block an opponent's CONCEAL, STEAL, or REVEAL

### Wild Card:
- **TEAL** — fixed Teal color (`008080`), flexible shape/number. Drawn into Hand first, then may be moved to the Table during Main; any TEAL left in Hand at turn end is discarded.

## 3. Action Handlers & Rules Engine

### 3.1 CONCEAL
- **Target:** Player's own Revealed Table card (Normal or WILD).
- **Effect:** Sets `card.isRevealed = false`.
- **Eligible to APPEAL:** Any other player — a CONCEAL benefits its user against the whole table, so everyone has standing to contest it.
- **Phase:** Played during MAIN phase, triggers INTERRUPT phase.

### 3.2 STEAL
- **Target:** Any Normal or WILD card on an opponent's Table.
  - If the target is Revealed, the acting player selects it directly.
  - If the target is Concealed, the acting player selects a slot blind — the server resolves which card it is; the result is known only to the acting player and the original owner until/unless it's Revealed later.
- **Effect:** Moves the card from the opponent's Table to the acting player's Table, **preserving its Revealed/Concealed state**.
- **Restrictions:** Action cards can never be targeted (they live in Hand, not Table — structurally unreachable). Cards inside a completed set are **not** protected; nothing on the Table is safe from STEAL.
- **Eligible to APPEAL:** Only the targeted player.
- **Phase:** Played during MAIN phase, triggers INTERRUPT phase.

### 3.3 REVEAL
- **Target:** A Concealed card on an opponent's Table, selected blind. (Targeting an already-Revealed card is not allowed — there's no effect to gain.)
- **Effect:** Sets `card.isRevealed = true` (visible to all players).
- **Eligible to APPEAL:** Only the targeted player.
- **Phase:** Played during MAIN phase, triggers INTERRUPT phase.

### 3.4 APPEAL
- **Trigger:** During the INTERRUPT phase, by a player eligible under the action's targeting rule and holding an APPEAL card. Eligibility is checked against private server state and is not broadcast as a player list.
- **Effect:** Cancels `pendingAction`; both the original action card and the APPEAL card move to the discard pile.
- **Race Resolution:** If multiple eligible players attempt APPEAL (only possible for CONCEAL, which can have several eligible players), resolve via an atomic transaction — the first write wins and sets `pendingAction.resolvedByPlayerId`; subsequent attempts are rejected server-side.
- **Window:** 30 seconds from `pendingAction` creation. If it elapses with no successful APPEAL, `pendingAction` resolves normally (skip) and `turnPhase` returns to `MAIN`.

### 3.5 TEAL (Wild Card — not an action)
- Lives on the Table alongside Normal cards; dealt and drawn the same way.
- Fixed color: `008080` (Teal).
- Number and shape are left unset on the card itself and are resolved dynamically, per-set, whenever the validation engine checks whether a group of 3 Table cards forms a valid set.
- Targetable exactly like a Normal Table card — STEAL, REVEAL, and CONCEAL all apply to it the same way.

## 4. Game Flow & Turn Phases

### Phase Sequence:
1. **DRAW** — At the start of each turn, the active player automatically draws 1 card from the deck (reshuffling the discard pile if empty). Every card initially goes to Hand.
2. **MAIN** — Player may, in any order, any number of times:
   - Move Normal/WILD cards from Hand to an open Table slot; at 9 cards this swaps with a selected Table card and returns the replaced card to Hand.
   - Discard any number of Normal/WILD cards from their Table.
   - Play CONCEAL, STEAL, or REVEAL from their Hand — each triggers INTERRUPT.
3. **INTERRUPT** — Eligible player(s) have 30 seconds to play APPEAL; if none do, the action resolves and phase returns to MAIN.
4. **End Turn** — All cards left in Hand are discarded automatically. If a STEAL left more than 9 cards on the Table, move cards into Hand to discard them. Check for a win, then pass the turn.

## 5. Win Condition Validation (Pattern Engine)

A player wins when their **Table** holds **3 complete sets of 3 cards** (9 cards total).

A set of 3 Table cards is valid if it meets **at least one** of these patterns:

| Pattern | Description |
|---------|-------------|
| **Same Color** | All 3 cards share identical color (WILD counts as `008080`) |
| **Same Number** | All 3 cards share identical number (WILD adopts any number) |
| **Same Shape** | All 3 cards share identical shape (WILD adopts any shape) |

*(Consecutive Numbers has been removed as a valid pattern.)*

### WILD Card Behavior in Patterns:
- **Color:** Always counts as `008080` (Teal)
- **Number:** Can adopt any number 1–7 to complete a pattern
- **Shape:** Can adopt any shape to complete a pattern

### Validation Logic:
- Only Table cards (Normal + WILD) are ever considered; Action cards and unplaced Normal/WILD cards in Hand are excluded.
- Requires exactly 3 cards per set, and exactly 3 disjoint sets covering all 9 Table cards to win.
- Checks all 3 patterns — any single match validates a set.
- **Resolved (previously an open question):** earlier drafts worried about a tie-break for "the" completed set when multiple valid groupings exist. That question only mattered for *protecting* set cards from STEAL — and since STEAL can already target any Table card regardless of set membership (rules.md §9), there's nothing left to protect, so no tie-break is needed for correctness.
  - `checkWinCondition()` only needs to confirm *some* valid partition of the 9 Table cards into 3 sets exists — an existence check, not an identification of specific groupings.
  - Mid-game progress display (e.g. "2/3 sets" on the Players page) only needs a count — `completeSetCount()` finds the maximum number of disjoint valid sets in the current Table via a greedy/max-matching search. Which exact cards land in which set doesn't need to be pinned down until the win moment.
  - `findBestPartition()` identifies a winning partition. It is stored as an array of `{ cards: Card[] }` objects because Firestore does not support nested arrays.

## 6. Implementation Files

Table-card arrangement is presentation order only: a player may move or swap their own Table cards at any time using tap-to-select/tap-to-destination or drag-and-drop. The order is local to that browser and never calls the server or changes what opponents see.

Client commands should provide immediate pending feedback while waiting on the authoritative server response, then show a confirmed result or a recoverable error. A pending indicator acknowledges that a request was sent; it must not claim that the state has already changed.

Active-game leave and host-kick operations transactionally discard the departing player's cards, remove their sanitized view, and hand host status to the earliest remaining member. If the departing player was active, the next remaining member starts a DRAW phase. A single remaining player may continue; removing the final member deletes the room and private state.

| File | Purpose |
|------|---------|
| `src/logic/deck.ts` | Deck generation (105 Normal + 3 WILD + 12 Action), shuffling |
| `src/logic/validation.ts` | `validateSet()`, `findBestPartition()`, `checkWinCondition()`, pattern matchers |
| `src/logic/gameEngine.ts` | State machine: `initializeGame`, `drawCard`, `moveCardToTable`, `playCard`, `resolveAction`, `playAppeal` (atomic), `endTurn` |
| `src/types/index.ts` | All TypeScript type definitions |
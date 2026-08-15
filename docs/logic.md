# 3EAL — Logic & State Engine

## 1. Core Data Schemas

### 1.1 Card Schema
```typescript
type CardColor = 'C0C0FF' | '008080' | 'C06060';
type CardShape = 'circle' | 'triangle' | 'square' | 'pentagon' | 'hexagon';
type ActionType = 'CONCEAL' | 'STEAL' | 'REVEAL' | 'APPEAL' | 'TEAL';

interface Card {
  id: string; // Unique instance ID (e.g., "card_042")
  isActionCard: boolean;
  isRevealed: boolean; // Tracking for Reveal / Conceal effects
  
  // Normal Card Attributes (null if action card)
  color?: CardColor;
  number?: number; // 1 - 7
  shape?: CardShape;

  // Action Card Attributes (null if normal card)
  actionType?: ActionType;
  title?: string;
  description?: string;
}
```

### 1.2 Player Schema
```typescript
interface Player {
  id: string;
  name: string;
  isHost: boolean;
  hand: Card[];
  sets: Card[][]; // Completed sets (up to 3 sets of 3)
}
```

### 1.3 Lobby & Game State Schema
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
    turnPhase: 'DRAW' | 'MAIN' | 'DISCARD' | 'INTERRUPT';
    pendingAction?: {
      sourcePlayerId: string;
      targetPlayerId: string;
      actionCard: Card;
      targetCardId?: string;
      canAppealUntil: number; // Timestamp for Appeal window
    };
    winnerId: string | null;
  };
}
```

## 2. Deck Generation & Combinations

- **Normal Deck:** Exactly 1 card per combination of Color (3) × Number (7) × Shape (5) = **105 Normal Cards**
- **Action Deck:** Exactly 3 copies per Action Type (5 types) = **15 Action Cards**
- **Total Deck Size:** **120 Cards**

### Normal Card Colors:
- `C0C0FF` — Periwinkle
- `008080` — Teal (also used for TEAL wild cards)
- `C06060` — Rose

### Normal Card Numbers: 1–7

### Normal Card Shapes: Circle, Triangle, Square, Pentagon, Hexagon

### Action Card Types (3 copies each):
1. **CONCEAL** — Hide one of your own revealed cards
2. **STEAL** — Take a normal card from an opponent's hand
3. **REVEAL** — Force an opponent to reveal a card
4. **APPEAL** — Block an opponent's CONCEAL, STEAL, or REVEAL
5. **TEAL** — Wild card (Teal color, flexible shape/number)

## 3. Action Handlers & Rules Engine

### 3.1 CONCEAL
- **Target:** Player's own revealed card.
- **Effect:** Sets `card.isRevealed = false`. Can be blocked by APPEAL.
- **Phase:** Played during MAIN phase, triggers INTERRUPT phase.

### 3.2 STEAL
- **Target:** Chosen normal card (including TEAL) from an opponent's hand only. Cannot target action cards or completed sets.
- **Effect:** Transfers target Card from opponent's hand to active player's hand. Can be blocked by APPEAL.
- **Phase:** Played during MAIN phase, triggers INTERRUPT phase.

### 3.3 REVEAL
- **Target:** Chosen card from an opponent's hand.
- **Effect:** Sets `card.isRevealed = true` (visible to all players). Can be blocked by APPEAL.
- **Phase:** Played during MAIN phase, triggers INTERRUPT phase.

### 3.4 APPEAL
- **Trigger:** Interrupt step when targeted by CONCEAL, STEAL, or REVEAL.
- **Effect:** Cancels opponent's action card and sends both action cards to the discard pile.
- **Phase:** Only playable during INTERRUPT phase by the targeted player.

### 3.5 TEAL
- **Behavior:** Functions as a wild card. Fixed color: `008080` (Teal). Shape and number can match any value needed for set completion. Counts as a normal card for targeting purposes (can be stolen, revealed, etc.).
- **Note:** TEAL is not "played" as an action — it stays in hand as a wild normal card.

## 4. Game Flow & Turn Phases

### Phase Sequence:
1. **DRAW** — Active player draws 1 card from deck (reshuffles discard if empty)
2. **MAIN** — Player may:
   - Discard unlimited normal cards to discard pile
   - Play unlimited action cards (CONCEAL, STEAL, REVEAL, TEAL)
   - Each targeted action (CONCEAL/STEAL/REVEAL) triggers INTERRUPT phase
3. **INTERRUPT** — Targeted player has 10 seconds to play APPEAL to block the action
4. **End Turn** — Player discards down to max 9 cards, win condition checked

## 5. Win Condition Validation (Pattern Engine)

A player wins when they possess **3 complete sets of 3 cards** (9 cards total in valid sets).

A set of 3 cards is valid if it meets **at least one pattern** across all 3 cards:

| Pattern | Description |
|---------|-------------|
| **Same Color** | All 3 cards share identical color (TEAL wild = `008080`) |
| **Same Number** | All 3 cards share identical number (TEAL adopts any number) |
| **Same Shape** | All 3 cards share identical shape (TEAL adopts any shape) |
| **Consecutive Numbers** | Card numbers form a sequence (e.g., 2, 3, 4 or 5, 6, 7) |

### TEAL Wild Card Behavior in Patterns:
- **Color:** Always counts as `008080` (Teal)
- **Number:** Can adopt any number 1–7 to complete a pattern
- **Shape:** Can adopt any shape to complete a pattern
- **Consecutive:** Can fill gaps in sequences (e.g., [2, TEAL, 4] or [TEAL, 3, 4])

### Validation Logic:
- Filters out action cards (except TEAL which acts as wild)
- Requires exactly 3 valid cards per set
- Checks all 4 patterns — any single match validates the set
- Win check tests all combinations of 3 sets from 9+ cards

## 6. Implementation Files

| File | Purpose |
|------|---------|
| `src/logic/deck.ts` | Deck generation (105 normal + 15 action), shuffling |
| `src/logic/validation.ts` | `validateSet()`, `checkWinCondition()`, pattern matchers |
| `src/logic/gameEngine.ts` | State machine: `initializeGame`, `drawCard`, `playCard`, `resolveAction`, `playAppeal`, `endTurn` |
| `src/types/index.ts` | All TypeScript type definitions |
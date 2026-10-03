# 3EAL — Official Game Rules

## 1. Game Objective

Be the first player to build **3 complete sets of 3 cards** (9 cards total, all on your Table, matching valid patterns) to win.

---

## 2. Card Categories

Three kinds of cards exist:

| Category | Count | Lives In | Notes |
|---|---|---|---|
| **Normal** | 105 | Hand, then Table | 3 colors × 7 numbers × 5 shapes |
| **TEAL** | 3 | Hand, then Table | Wild card — fixed Teal color; any number, any shape |
| **Action** | 12 | Hand | 3 copies each of CONCEAL, STEAL, REVEAL, APPEAL |

**Total: 120 cards.**

> The TEAL card keeps the game's naming convention (3EAL — every action-adjacent card ends in "-EAL": CONCEAL, STEAL, REVEAL, APPEAL, TEAL). It's a distinct card from the ordinary Teal-colored Normal cards — those are 35 plain cards that happen to be Teal (fixed number and shape, no wildness). TEAL the card is the one wild card: always Teal-colored, but flexible on number and shape. Functionally it belongs to its own **Wild** category, separate from Normal and Action.

---

## 3. Zones

Each player has two separate zones:

- **Table** — the public play area. Holds Normal cards and the TEAL card only. Normally holds at most 9 cards; a STEAL can temporarily exceed that until end-of-turn cleanup. Cards here are either **Revealed** (visible to all players) or **Concealed** (hidden, visible only to the owner) — see Section 9.
- **Hand** — The private area. Holds Action cards and any Normal/TEAL cards drawn this turn but not yet moved to the Table. **No maximum size.** Always private; cards in Hand can never be targeted by another player's action.

---

## 4. Setup

1. Each player is dealt **3 cards to their Table** and **0 cards to their Hand** at the start of the game.
2. The remaining cards form the draw deck in the center.
3. First player is randomly selected as the starting active player.

---

## 5. Valid Set Patterns

A set = 3 cards on your Table satisfying **any one** of these 3 criteria:

* **Same Color:** 3 cards of color `C0C0FF` (Periwinkle), `008080` (Teal), or `C06060` (Rose)
* **Same Number:** 3 cards sharing the same digit (1 to 7)
* **Same Shape:** 3 cards sharing the same shape (Circle, Triangle, Square, Pentagon, or Hexagon)

### Special: TEAL Cards
TEAL cards are the game's wild cards — always Teal in color, but they can adopt **any number and any shape** to complete a Same Number or Same Shape set. They don't add anything extra to a Same Color set beyond simply being Teal, same as any other Teal-colored Normal card.

---

## 6. Turn Flow

On your turn, execute the following phases in order:

### 6.1 Draw Phase
The game automatically draws **1 card** when your turn begins. It always goes to your **Hand** first. During Main, move a Normal or TEAL card from your Hand to your Table; if your Table already has 9 cards, choose a Table card to swap out, and the replaced card returns to your Hand.

If the deck is empty, the discard pile is shuffled to form a new deck.

### 6.2 Main Phase
You may perform the following actions **in any order, unlimited times**:

* **Discard a Table Card:** Move a Normal/TEAL card from your Table into your Hand. It will be discarded at turn end.
* **Move Normal/TEAL to Table:** Move a Normal or TEAL card from your Hand onto an open Table slot. With 9 cards on the Table, choose a Table card to swap out; the replaced card goes to your Hand.
* **Play Action Cards** from your Hand:
  * **CONCEAL** — Target one of your own Revealed Table cards to conceal it again.
  * **STEAL** — Take a Normal card or the TEAL card from an opponent's Table. If the target is Revealed, choose it directly. If it's Concealed, you choose blindly — you won't know what it is until the steal resolves.
  * **REVEAL** — Force a Concealed card on an opponent's Table to become Revealed. Chosen blindly.
* **Interrupt Window:** Playing CONCEAL, STEAL, or REVEAL opens the Interrupt Phase.

### 6.3 Interrupt Phase (Triggered by CONCEAL, STEAL, or REVEAL)
* **STEAL / REVEAL:** only the targeted opponent may play APPEAL.
* **CONCEAL:** any opponent may play APPEAL — a CONCEAL benefits its user against everyone at the table, so anyone has standing to contest it. If more than one opponent attempts to APPEAL, the first one the game receives wins the race; that's the APPEAL card that gets used.
* The eligible player(s) have **30 seconds** to respond:
  * **Play APPEAL** — Sends both the original action card and the APPEAL card to the discard pile. The action is cancelled.
  * **Do Nothing** — If no APPEAL is played within 30 seconds, the action resolves normally.

### 6.4 End Phase
1. **Hand cleanup:** Every card still in your Hand, including Action cards, is discarded automatically.
2. **Table Size Limit:** If your Table has more than 9 cards (for example, after a STEAL), move enough cards to your Hand to reduce the Table to 9. They are discarded with the rest of your Hand.
3. **Win Check:** If your Table holds 9 cards forming 3 valid sets, you win immediately.
4. Otherwise, the turn passes to the next player, who begins their Draw Phase.

---

## 7. Action Cards

| Card | Description |
|------|-------------|
| **CONCEAL** | Target one of your own Revealed Table cards to hide it again. Any opponent may play APPEAL against it. |
| **STEAL** | Take a Normal card or the TEAL card from an opponent's Table — Revealed (chosen directly) or Concealed (chosen blindly). Only the targeted opponent may APPEAL. |
| **REVEAL** | Force a Concealed card on an opponent's Table to become Revealed. Chosen blindly. Only the targeted opponent may APPEAL. |
| **APPEAL** | Play during the Interrupt Phase to block an opponent's CONCEAL, STEAL, or REVEAL. Both cards are discarded. |

---

## 8. Deck Composition

* **105 Normal Cards:** 3 colors × 7 numbers × 5 shapes = 105 unique combinations
* **3 TEAL Cards:** the wild card, fixed Teal color, flexible number/shape
* **12 Action Cards:** 3 copies each of CONCEAL, STEAL, REVEAL, APPEAL
* **Total: 120 cards**

---

## 9. Additional Notes

* **Revealed / Concealed:** Table cards start Concealed. REVEAL exposes a card to all players; CONCEAL hides it again. Hand cards (Action cards) have no such state — they are simply always private, since only Table cards can ever be targeted.
* **Targeting Restrictions:** STEAL, REVEAL, and CONCEAL can only affect Normal cards or the TEAL card on a Table. Action cards in a Hand can never be targeted — this follows automatically from the zone structure. This includes Table cards that are part of a completed set: nothing on the Table is protected from STEAL.
* **Discard Pile:** Cards moved from Table to Hand, cards left in Hand at turn end, and played/appealed Action cards go here. Used to reshuffle when the draw deck empties.
* **Hand cleanup:** Action cards must be used during the current turn or they are discarded along with any other cards left in Hand.
* **Table arrangement:** Reordering your own cards is local presentation only. It does not call the server or change the order shown to other players.

## 10. Current Implementation Notes

* Active-game departures discard the departing player's cards. If only one player remains, they may continue playing alone.

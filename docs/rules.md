# 3EAL — Official Game Rules

## 1. Game Objective

Be the first player to build **3 complete sets of 3 cards** (9 cards total, all on your Table, matching valid patterns) to win.

---

## 2. Card Categories

Three kinds of cards exist:

| Category | Count | Lives In | Notes |
|---|---|---|---|
| **Normal** | 105 | Table | 3 colors × 7 numbers × 5 shapes |
| **TEAL** | 3 | Table | Wild card — fixed Teal color; any number, any shape |
| **Action** | 12 | Hand | 3 copies each of CONCEAL, STEAL, REVEAL, APPEAL |

**Total: 120 cards.**

> The TEAL card keeps the game's naming convention (3EAL — every action-adjacent card ends in "-EAL": CONCEAL, STEAL, REVEAL, APPEAL, TEAL). It's a distinct card from the ordinary Teal-colored Normal cards — those are 35 plain cards that happen to be Teal (fixed number and shape, no wildness). TEAL the card is the one wild card: always Teal-colored, but flexible on number and shape. Functionally it belongs to its own **Wild** category, separate from Normal and Action.

---

## 3. Zones

Each player has two separate zones:

- **Table** — the public play area. Holds Normal cards and the TEAL card only. **Maximum 9 cards.** Cards here are either **Revealed** (visible to all players) or **Concealed** (hidden, visible only to the owner) — see Section 9.
- **Hand** — the private area. Holds Action cards only. **No maximum size.** Always private; cards in Hand can never be targeted by any other player's action.

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
Draw **1 card** from the deck.
* Normal or TEAL card → goes to your **Table**.
* Action card → goes to your **Hand**.

If the deck is empty, the discard pile is shuffled to form a new deck.

### 6.2 Main Phase
You may perform the following actions **in any order, unlimited times**:

* **Discard Table Cards:** Discard any number of Normal/TEAL cards from your Table.
* **Play Action Cards** from your Hand:
  * **CONCEAL** — Target one of your own Revealed Table cards to conceal it again.
  * **STEAL** — Take a Normal card or the TEAL card from an opponent's Table. If the target is Revealed, choose it directly. If it's Concealed, you choose blindly — you won't know what it is until the steal resolves.
  * **REVEAL** — Force a Concealed card on an opponent's Table to become Revealed. Chosen blindly.
* **Interrupt Window:** Playing CONCEAL, STEAL, or REVEAL opens the Interrupt Phase.

### 6.3 Interrupt Phase (Triggered by CONCEAL, STEAL, or REVEAL)
* **STEAL / REVEAL:** only the targeted opponent may play APPEAL.
* **CONCEAL:** any opponent may play APPEAL — a CONCEAL benefits its user against everyone at the table, so anyone has standing to contest it. If more than one opponent attempts to APPEAL, the first one the game receives wins the race; that's the APPEAL card that gets used.
* The eligible player(s) have **10 seconds** to respond:
  * **Play APPEAL** — Sends both the original action card and the APPEAL card to the discard pile. The action is cancelled.
  * **Do Nothing** — If no APPEAL is played within 10 seconds, the action resolves normally.

### 6.4 End Phase
1. **Table Size Limit:** You must discard down until you have a **maximum of 9 cards** on your Table. (Hand has no size limit.)
2. **Win Check:** If your Table now holds 9 cards forming 3 valid sets, you win immediately!
3. Turn passes to the next player, who begins their Draw Phase.

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
* **Discard Pile:** All discarded Table cards and played/appealed Action cards go here. Used to reshuffle when the draw deck empties.
* **Hoarding:** There is no limit on Hand size, so a player may accumulate and sit on scarce Action cards (e.g. APPEAL) indefinitely. This is intentional and treated as a valid strategy, not an exploit.

---

## 10. Open Questions (for future revisions / other docs)

* Can a player voluntarily discard an unwanted Action card from their Hand, or are they committed to it once drawn?
* Exact targeting-UI behavior for blind (Concealed) targeting — deferred to `ui-ux.md`.
* When a Table has more cards than strictly needed, or multiple overlapping card groupings are possible, what's the tie-break for which specific cards count as "the" completed set? This matters for continuous automatic set-detection, and for what's shown as protected/complete.
* In a multi-opponent APPEAL race against a CONCEAL, does a *losing* attempt still consume that player's APPEAL card, or only the winning one?

# 3EAL — Official Game Rules

## 1. Objective

Be the first player to build **3 complete sets of 3 cards** (9 cards total) on your Table.

## 2. Cards

| Category | Count | Where it goes | Description |
|---|---:|---|---|
| **Normal** | 175 | Hand, then Table | 5 colors × 7 numbers × 5 shapes |
| **TEAL wild** | 3 | Hand, then Table | Always Teal; can match any number or shape |
| **Action** | 40 | Hand | 10 copies each of CONCEAL, STEAL, REVEAL, and APPEAL |

**Total: 218 cards.**

Normal colors are Lavender (`C0C0FF`), Teal (`008080`), Coral (`C06060`), Purple (`884488`), and Indigo (`404088`). Shapes are Circle, Triangle, Square, Pentagon, and Hexagon. Optional color-blind mode adds distinct patterns and glyphs.

### Action cards

| Card | Effect |
|---|---|
| **CONCEAL** | Hide one of your own revealed Table cards. Any opponent may APPEAL. |
| **STEAL** | Take a Normal or TEAL card from an opponent's Table. Revealed cards are selected directly; concealed cards are selected blindly. Only the target may APPEAL. |
| **REVEAL** | Reveal a concealed card on an opponent's Table, selected blindly. Only the target may APPEAL. |
| **APPEAL** | During an interrupt, cancel CONCEAL, STEAL, or REVEAL. Both action cards are shuffled into the draw deck. |

## 3. Zones

- **Table:** Public area for Normal and TEAL cards. It normally holds up to 9 cards. A STEAL may temporarily take it above 9 until the active player removes extras. Table cards start revealed; the eye icon at the top of a card indicates that everyone can see it. CONCEAL can hide a card again.
- **Hand:** Private area with no size limit. Drawn cards go here first. Action cards remain in your Hand across turns until played. Normal and TEAL cards left in your Hand at the end of your turn are discarded.
- **Draw deck:** All discarded cards are shuffled directly into the draw deck. There is no discard pile.

## 4. Setup

1. Each player is dealt **3 revealed cards to their Table** and starts with an empty Hand.
2. The remaining cards form the draw deck. The host selects a 45-, 75-, or 120-second turn limit before starting.
3. The starting player is selected at random.

## 5. Valid sets

A set is 3 cards on your Table that share **one** of the following:

- **Same color:** all three colors match.
- **Same number:** all three numbers match (1–7).
- **Same shape:** all three shapes match.

For example, three Teal cards with different numbers and shapes make a same-color set. Three 5s with different colors and shapes make a same-number set. Three pentagons with different colors and numbers make a same-shape set. Consecutive numbers do not count as a pattern.

TEAL is always Teal for same-color sets. For same-number or same-shape sets, it can adopt any number or shape needed to complete the set.

## 6. Turn flow

### Draw phase

At the start of your turn, draw 1 card from the deck into your Hand.

### Main phase

You may perform these actions in any order:

- Move a Normal or TEAL card from your Hand to an open Table slot. If you already have 9 cards, swap it with a selected Table card; the replaced card returns to your Hand.
- Move a Table card to your Hand to discard it at turn end.
- Play CONCEAL, STEAL, or REVEAL from your Hand. Each action opens an interrupt window.

### Interrupt phase

Every interrupt window lasts **30 seconds**. Only the target may appeal STEAL or REVEAL; any opponent may appeal CONCEAL. An APPEAL cancels the action and returns both cards to the draw deck. If no APPEAL is played before the window ends, the action resolves.

### End phase

1. Normal and TEAL cards remaining in your Hand are shuffled into the draw deck. **Action cards stay in your Hand.**
2. If a STEAL left you with more than 9 Table cards, move extras to your Hand; they are shuffled into the draw deck with the rest.
3. If your Table has 9 cards that form 3 valid sets, you win.
4. Otherwise, the turn passes to the next player.

## 7. Disconnects and rejoining

The game sends a connection heartbeat every 15 seconds. An away active player's turn is skipped. Three consecutive missed turns forfeit that seat; the host is handed to a connected player when needed. A returning player can request to reclaim an existing seat by their unique in-game name, subject to host approval. Requests time out to spectator status when capacity permits. Rooms allow up to 8 spectators, who see public Tables but never private Hands.

The host chooses a 45-, 75-, or 120-second turn limit before starting. Players heartbeat every 15 seconds; an expired turn is skipped and counts toward the three-miss forfeit rule. A forfeit frees the player seat and hands the host role to a connected player when needed.

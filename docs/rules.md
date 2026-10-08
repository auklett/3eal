# 3EAL — Official Game Rules

## Objective

Be the first player to build three valid sets of three cards (nine cards total) on your Table.

## Cards

The 218-card deck contains:

| Category | Count | Notes |
|---|---:|---|
| Normal | 175 | 5 colors × 7 numbers × 5 shapes |
| TEAL wild | 3 | Always Teal for color sets; may adopt any number or shape |
| Action | 40 | 10 each of CONCEAL, STEAL, REVEAL, and APPEAL |

Normal-card colors are Periwinkle (`C0C0FF`), Teal (`008080`), Rose (`C06060`), Grape Soda (`884488`), and French Blue (`404088`). Shapes are Circle, Triangle, Square, Pentagon, and Hexagon. Normal numbers range from 1 to 7.

TEAL is a distinct wild card, not an ordinary Teal-colored Normal card. For a Same Color set it is always Teal. For Same Number or Same Shape sets it can adopt whatever value completes the set.

## Zones and visibility

- **Table:** Holds Normal and TEAL cards. Cards are either revealed (visible to everyone) or concealed (identity visible only to their owner). A STEAL may temporarily take a table above nine cards until end-of-turn cleanup.
- **Hand:** Private and unbounded. Unplayed APPEAL cards remain in Hand across turns until played; all other cards left at turn end are discarded. No card in a Hand can be targeted.
- Public views show every player's hand size, never hand contents. Players see their own hand and concealed cards. Spectators receive exactly the same public information as an opponent, with no private-card privileges.
- Card IDs are random and must not encode card identity. Stealing preserves the card's reveal/conceal state; the thief can see it in their own private view.

## Valid sets and winning

A valid set has exactly three Normal/TEAL cards that share a color, number, or shape. A TEAL card's color is fixed as Teal, but it can adopt any number or shape. Action cards cannot be part of a set.

The win check searches for any valid partition of all nine Table cards into three valid sets. A nine-card table has 280 possible partitions; the game must not require a particular grouping or arrangement.

## Setup

The room supports at least two players and has no configured maximum player count. Starting still requires enough Normal/TEAL cards to deal three Table cards to every player. New users join as players by default while the game is in the lobby; they can switch to spectator there. If the game has started, they join as spectators. Player joining is not capped by a configured limit.

Deal three cards to each player's Table, all concealed, and no cards to their Hand. The remaining cards form the draw deck. Choose the first active player randomly.

## Turn flow

Each turn has a default 60-second timer. The room owner may change it in the lobby before the game starts, from 15 through 180 seconds.

### Draw

At turn start, draw one card into your Hand. If the deck is empty, shuffle the discard pile into a new deck. If both are empty, no card is drawn.

### Main

You may perform these actions in any order and as often as desired:

- Move a Normal or TEAL card from your Hand to an open Table position.
- If your Table has nine cards, swap a Hand Normal/TEAL card for a Table card; the replaced card goes to your Hand.
- Move a Table card to your Hand. It is discarded at turn end.
- Play CONCEAL, STEAL, or REVEAL from your Hand. This opens an interrupt unless it is immediately resolved because no eligible player holds APPEAL.
- End your turn.

### Interrupts

Playing CONCEAL, STEAL, or REVEAL opens an interrupt with a maximum duration of 30 seconds. The turn timer pauses and resumes with its remaining time once the interrupt ends.

- For STEAL or REVEAL, only the target may respond.
- For CONCEAL, any opponent may respond.
- An eligible player holding APPEAL may play it or pass. An eligible player without APPEAL passes automatically.
- The interrupt ends immediately when someone appeals, all eligible APPEAL holders have passed, or the 30-second maximum expires. The first appeal received by the server wins.
- APPEAL cancels the pending action; both action cards are discarded. APPEAL cannot itself be appealed.
- Fast passing may reveal whether someone holds APPEAL; the game intentionally adds no random or fixed wait to hide that information.
- REVEAL with no concealed cards on the target's Table is rejected and does not consume its action card.

CONCEAL targets one of the actor's own revealed Table cards. STEAL takes a Normal/TEAL card from an opponent's Table, selected directly if revealed and blindly if concealed. REVEAL selects a concealed card on an opponent's Table blindly and makes it revealed when resolved.

### End

Keep any APPEAL cards in your Hand for future interrupts and discard every other card left there. If a STEAL left your Table above nine cards, move cards to your Hand until it is back to nine; those cards are discarded in cleanup unless they are APPEAL cards. Then check whether the nine cards form three valid sets. If so, the player wins and all cards are revealed to everyone. Otherwise, the turn passes to the next player.

## Spectators, disconnects, and rejoin

There is no chat, including spectator chat. Spectators see concealed cards face-down, public hand sizes, interrupt countdowns, and interrupt outcomes.

A new session may request to rejoin by entering a player's name. The host approves or declines; the requester receives no game data before approval. A declined request or one unanswered for about 60 seconds becomes a spectator. Approval disconnects any old socket for that seat. Names are trimmed and unique case-insensitively.

Player seats, names, Tables, and action cards are held through disconnect until the game ends. After 60 seconds away, mark the player away and skip their current turn; future turns for that player are skipped immediately. If the host disconnects, host ownership transfers to the next connected player. The original host must request rejoin and be approved like any other returning player.

The host can kick players and spectators. After a game ends, players may rematch.

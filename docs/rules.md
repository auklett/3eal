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

- **Table:** Holds at most nine Normal and TEAL cards. Cards are either revealed (visible to everyone) or concealed (identity visible only to their owner). The three starting Table cards are dealt revealed, so everyone can see them; CONCEAL can hide one later.
- **Hand:** Private and unbounded. Every player starts with one each of CONCEAL, STEAL, REVEAL, and APPEAL in Hand. All unused Action cards remain in Hand across turns until played; all other cards left at turn end are shuffled straight back into the deck. A STEAL that resolves while the actor already has nine Table cards puts the stolen card in their Hand, where it has no reveal state. No card in a Hand can be targeted.
- Public views never include another player's hand size or contents. A player's own view includes their own Hand; opponents and spectators see only their Table. Players see their own concealed cards. Spectators receive exactly the same public information as an opponent, with no private-card privileges.
- Card IDs are random and must not encode card identity. Stealing preserves the card's reveal/conceal state; the thief can see it in their own private view.

## Valid sets and winning

A valid set has exactly three Normal/TEAL cards that share a color, number, or shape. A TEAL card's color is fixed as Teal, but it can adopt any number or shape. Action cards cannot be part of a set.

The win check searches for any valid partition of all nine Table cards into three valid sets. A nine-card table has 280 possible partitions; the game must not require a particular grouping or arrangement. The server records the actual valid partition it finds, and the Game Over screen shows those three groups of three cards.

## Setup

The room supports 2–10 players. The 10-player cap matches the ten copies of each Action card in the deck. New users join as players by default while the game is in the lobby; they can switch to spectator there. If the game has started, they join as spectators.

Deal one CONCEAL, one STEAL, one REVEAL, and one APPEAL to each player's Hand, then deal three Normal/TEAL cards to each player's Table, all revealed. These starting cards are taken from the 218-card deck without reshuffling the remainder, so the draw deck holds `218 − 7 × players` cards before the first draw. Choose the first active player randomly.

## Turn flow

Each turn has a default 60-second timer. The room owner may change it in the lobby before the game starts, from 15 through 180 seconds.

### Draw

At turn start, draw one card into your Hand. Discarded cards are shuffled straight back into the draw deck, so the deck only runs out when every card is in play; if no card is available, none is drawn.

### Main

You may perform these actions in any order and as often as desired:

- Move a Normal or TEAL card from your Hand to an open Table position.
- If your Table has nine cards, swap a Hand Normal/TEAL card for a Table card; the replaced card goes to your Hand.
- Move a Table card to your Hand. At turn end it is shuffled back into the deck.
- Play CONCEAL, STEAL, or REVEAL from your Hand. This opens an interrupt unless it is immediately resolved because no eligible player holds APPEAL.
- End your turn.

### Interrupts

Playing CONCEAL, STEAL, or REVEAL opens an interrupt with a maximum duration of 30 seconds. The turn timer pauses and resumes with its remaining time once the interrupt ends.

- For STEAL or REVEAL, only the target may respond.
- For CONCEAL, any opponent may respond.
- An eligible player holding APPEAL may play it or pass. An eligible player without APPEAL passes automatically.
- The interrupt ends immediately when someone appeals, all eligible APPEAL holders have passed, or the 30-second maximum expires. The first appeal received by the server wins.
- APPEAL cancels the pending action; both action cards are shuffled straight back into the deck. APPEAL cannot itself be appealed.
- Fast passing may reveal whether someone holds APPEAL; the game intentionally adds no random or fixed wait to hide that information.
- REVEAL with no concealed cards on the target's Table is rejected and does not consume its action card. Because every Table starts revealed, REVEAL has no legal target until a card is concealed.
- During an open interrupt, the targeted player sees which Table card is targeted, even if they do not hold APPEAL. For a blind STEAL/REVEAL this identity is private to the card's owner; for CONCEAL the actor's own revealed target is shown to the other players. The actor on a blind target, uninvolved players, and spectators do not receive the card identity, and no APPEAL-holder list is revealed.

CONCEAL targets one of the actor's own revealed Table cards. STEAL takes a Normal/TEAL card from an opponent's Table, selected directly if revealed and blindly if concealed. If the actor has fewer than nine cards when STEAL resolves, the stolen card moves to their Table and keeps its revealed/concealed state; at nine cards, it goes to their Hand. A card placed from Hand later enters concealed. REVEAL selects a concealed card on an opponent's Table blindly and makes it revealed when resolved.

### End

Keep any unused Action cards in your Hand for future turns and shuffle every other card left there back into the deck. Tables never exceed nine cards; if the server encounters an over-limit Table, an explicit End Turn is rejected rather than trimming the Table during cleanup. Then check whether nine Table cards form three valid sets. If so, the player wins and all cards are revealed to everyone. Otherwise, the turn passes to the next player.

### Pausing the game

The host may pause and resume at any time while a game is in progress; pause controls are unavailable in the lobby and after the game ends. If host ownership transfers, the new host gains the controls and the old host loses them.

- Pausing freezes every server deadline: the turn timer, the interrupt (appeal) timer, away timers, and pending rejoin-request timers. Nothing expires, is skipped, or auto-resolves while paused.
- While paused the server rejects all game actions (placing or moving cards, ending a turn, appealing, passing, or choosing an action target) with a "Game is paused" error. Host management — kicking participants and approving or declining rejoin requests — remains available, and local Table rearrangement still works because it never contacts the server.
- All players and spectators see a "Game paused by host" banner. The host sees a Resume control; countdowns show their frozen values rather than ticking.
- An appeal prompt stays visible while paused, but its APPEAL and Pass buttons are disabled and labelled "Paused" until play resumes.
- Heartbeats continue, but nobody is marked away and no turn is skipped while paused. On resume, away clocks continue from their stored remaining time.
- There is no maximum pause length. If the host disconnects, leaves, or is kicked while paused, the game stays paused until the new host resumes it; it never auto-resumes.

## Spectators, disconnects, and rejoin

There is no chat, including spectator chat. Spectators see concealed cards face-down, Table counts, interrupt countdowns, and interrupt outcomes. No viewer ever sees another player's hand size.

A new session may request to rejoin by entering a player's name. The host approves or declines; the requester receives no game data before approval. A declined request or one unanswered for about 60 seconds becomes a spectator. Approval disconnects any old socket for that seat. Names are trimmed and unique case-insensitively.

Player seats, names, Tables, and action cards are held through disconnect until the game ends. After 60 seconds away, mark the player away and skip their current turn; future turns for that player are skipped immediately. A seat is never forfeited — it is held until the game ends. If the host disconnects, host ownership transfers to the first remaining connected, non-left, non-kicked member in list order, with players considered before spectators. The original host must request rejoin and be approved like any other returning player.

The host can kick players and spectators, or transfer host ownership to another connected, non-left, non-kicked player or spectator. A transfer is allowed in the lobby, during play, while paused, and after the game ends. The old host keeps their seat and role; the game, pause state, timers, and pending rejoin requests are unchanged. The new host receives host controls and any pending rejoin requests.

## After the game

When a game ends, the winner's three sets stay visible. The host sees **Return to Lobby**; every member sees **Leave Lobby**. Rematch is no longer a separate action.

- **Return to Lobby** is host-only. It resets the room directly to the lobby, clears every Table, Hand, deck, turn, pause, winner, and rejoin-request state, and keeps the room code and turn-timer setting.
- Members who are disconnected, away, left, or kicked are removed by the reset, and their names and default `Player N` numbers become available again. Present players keep their seats; present spectators stay spectators.
- The next Start uses a fresh seed, so it produces a new deal. Starting again requires 2–10 players.
- **Leave Lobby** is available only after the game ends. A non-winner is removed immediately. A winner who leaves is kept as a left record until the reset so the remaining players can still see the Game Over result; their seat no longer accepts play.
- If the host leaves, ownership passes to the first remaining connected, non-left, non-kicked member in list order (players first, then spectators). If nobody remains, the room is deleted.
- Leaving during a live game is not available through **Leave Lobby**. The top-bar **Leave** control closes the game view and uses the normal disconnect and rejoin flow; the seat is held until the game ends.

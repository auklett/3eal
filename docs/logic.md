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

Reveal state is **not** stored on the card. It lives on the Table slot as `{ card: TableCard; revealed: boolean }`, because the same card can be concealed on one Table and then revealed on another after a STEAL. Only NORMAL and TEAL cards can sit on a Table; ACTION cards exist in a Hand, or temporarily in `pendingAction` while an interrupt chain is still deciding whether the original action resolves. Each player's three starting Table cards are dealt already revealed (`revealed: true`); a card later moved from Hand to the Table is concealed (`revealed: false`) until a REVEAL makes it public.

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
  left: boolean;         // True after Leave Lobby; purged by the next lobby reset
  table: { card: TableCard; revealed: boolean }[]; // NORMAL + TEAL only, max 9
  hand: Card[];          // Private authoritative hand; clients see only their own
};

type RoomSpectator = {
  id: string;
  sessionIds: string[];
  name: string;
  connected: boolean;
  left: boolean;
};

type LastInterruptResult = {
  kind: 'CONCEAL' | 'STEAL' | 'REVEAL';
  outcome: 'appealed' | 'resolved' | 'expired';
  resolvedAt: number;    // server timestamp used as the client notice key
  appealDepth: number;   // appeals in the chain; odd => cancelled, even => resolved
  appealedBy: string | null; // decisive / last appealer, or null when resolved/expired
  stolenToHandBy?: string | null; // private STEAL-actor marker
};

type InterruptState = {
  id: string;
  kind: 'CONCEAL' | 'STEAL' | 'REVEAL';
  actorId: string;
  targetId: string;
  targetCardId: string;
  endsAt: number | null; // current link deadline; null while paused
  appeals: { playerId: string; cardId: string }[]; // oldest first; depth = length
  responderIds: string[]; // depth-0 APPEAL holders only
  passedIds: string[];    // depth-0 passers for a CONCEAL race
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
  spectators: RoomSpectator[];             // no capacity limit; players are capped at start
  turnDurationSeconds: number;             // 15–180, default 60
  deck: Card[];                            // draw deck; discards are shuffled straight back in
  activePlayerId: string | null;
  turnNumber: number;
  turnEndsAt: number | null;               // absolute deadline, or null while paused
  turnRemainingMs: number | null;          // frozen turn time captured on pause
  pendingAction: {
    actionCard: ActionCard;
    interrupt: InterruptState;
    appealCards: Card[];                  // chain cards held out of play until it ends
  } | null;
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

`MAX_STARTING_PLAYERS` is **10**, matching the ten copies of each Action card. A Start with more than ten players is rejected with `Up to 10 players can start a game. Move extras to Spectator.` The engine does not cap how many people may join a lobby; the cap applies only when the host starts.

`lastInterruptResult` belongs to the turn in which the interrupt resolved. `beginTurn` and `finishTurn` clear it, so clients hide the transient result notice when the turn changes. `resolvedAt` is the server timestamp used to key that notice.

Interrupt eligibility is deliberately **not** stored as a broadcastable list. Whether a player is a legal target is public; whether that player also holds an APPEAL card is private and is re-checked per socket from the authoritative hand, never serialized into a view. The public interrupt exposes only `appealDepth` and `appealPlayers` (the IDs of players who have already played an APPEAL, oldest first). `responderIds`, `passedIds`, and whether any player still holds an unplayed APPEAL are never serialized. Clients derive later-link eligibility from the depth parity and `appealPlayers`.

On the first link, `you.interruptCard` contains the targeted card only for viewers allowed to see its identity: the target for STEAL/REVEAL, and every non-actor player for CONCEAL (the actor's own revealed card). The actor, uninvolved players, and spectators receive `null`. On a later link it instead contains the APPEAL face just played against the one currently eligible responder; every other player and every spectator receives `null`. This is still independent of who holds an unplayed APPEAL.

Rejoin requests remain authoritative server state in `rejoinRequests`. They are serialized only into the host's private player view as `you.rejoinRequests: Array<{ requestId, name }>`; every other player view and every spectator view receives an empty list. The host UI derives its notice strip from snapshots rather than a separate request message.

## 2. Deck Generation & Combinations

- **Normal Deck:** Color (5) × Number (7) × Shape (5) = **175 Normal Cards**
- **Wild Deck:** **3 TEAL Cards** — fixed color, flexible number/shape
- **Action Deck:** 10 copies × 4 types = **40 Action Cards**
- **Total Deck Size:** **218 Cards**

### Starting Deal

Each player takes one CONCEAL, one STEAL, one REVEAL, and one APPEAL from the already-shuffled deck into Hand, in that fixed order. Each player then takes three Normal/TEAL cards from the same deck onto their Table, all revealed. The remaining deck is **not** reshuffled, so after setup it holds `218 − 7 × playerCount` cards and the first active player's draw makes their Hand five cards. The same seed reproduces the same deal.

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
4. **APPEAL** — Cancel an opponent's CONCEAL, STEAL, REVEAL, or a later APPEAL in the same chain

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
- **Effect:** If the acting player's Table has fewer than 9 cards when STEAL resolves, the card moves to their Table and **preserves its Revealed/Concealed state**. If their Table has exactly 9 cards, the stolen card goes to their Hand instead. Cards in Hand have no reveal state; if later placed on the Table, the card enters concealed like any other Hand card.
- A stolen card that goes to Hand follows normal end-turn cleanup: it returns to the deck unless it is swapped or placed on the Table before the turn ends.
- **Restrictions:** Action cards can never be targeted (they live in Hand, not Table — structurally unreachable). Cards inside a completed set are **not** protected; nothing on the Table is safe from STEAL.
- **Eligible to APPEAL:** Only the targeted player.
- **Phase:** Played during MAIN phase, triggers INTERRUPT phase.

### 3.3 REVEAL
- **Target:** A Concealed card on an opponent's Table, selected blind. (Targeting an already-Revealed card is not allowed — there's no effect to gain. Because every Table starts revealed, REVEAL has no legal target until some card is concealed; such a play is rejected without consuming the action card.)
- **Effect:** Marks that Table slot revealed (`revealed = true`, visible to all players).
- **Eligible to APPEAL:** Only the targeted player.
- **Phase:** Played during MAIN phase, triggers INTERRUPT phase.

### 3.4 APPEAL
- **Trigger:** During the INTERRUPT phase, by the player eligible for the current link and holding an APPEAL card. Eligibility is checked against private server state and is not broadcast as a player list.
  - Depth 0 follows the action's targeting rule: the STEAL/REVEAL target, or any opponent for CONCEAL.
  - Depth 1 belongs to the action's actor; depth 2 belongs to the first appealer; later depths alternate between the actor and the first appealer. There is no depth cap.
- **Effect:** Appends a link to the chain and opens a fresh 30-second window for the next eligible player. The chain is resolved by parity: an odd number of APPEALs cancels the original action; an even number (including zero) lets it resolve. Expiry at depth 0 (`expired`) resolves the action; expiry on a later link follows the same parity rule.
- **Race Resolution:** At depth 0 a CONCEAL may have several eligible players. Once one of them appeals, only the actor can answer, and the other depth-0 responders drop out. `responderIds` and `passedIds` only govern that first link.
- **Auto-pass:** If the next eligible player holds no APPEAL, the chain ends immediately as if that player passed. A depth-0 responder without APPEAL never enters `responderIds`.
- **Window:** Each link lasts at most 30 seconds from the latest APPEAL. The turn timer stays paused for the whole chain; a host pause freezes the current link in `pauseRemaining.interrupt` (see §4).
- **Cards:** The original action card and every APPEAL in the chain are held in `pendingAction.appealCards` and stay out of play until the chain ends. They are then shuffled back into the deck together via the seeded RNG.

### 3.5 TEAL (Wild Card — not an action)
- Lives on the Table alongside Normal cards; dealt and drawn the same way.
- Fixed color: `008080` (Teal).
- Number and shape are left unset on the card itself and are resolved dynamically, per-set, whenever the validation engine checks whether a group of 3 Table cards forms a valid set.
- Targetable exactly like a Normal Table card — STEAL, REVEAL, and CONCEAL all apply to it the same way.

## 4. Game Flow & Turn Phases

### Phase Sequence:
1. **DRAW** — At the start of each turn, the active player automatically draws 1 card from the deck. Discarded cards are shuffled straight back into that same deck, so the deck only runs out when every card is in play; if no card is available, none is drawn. Starting Table cards are dealt directly to the Table; every later draw goes to Hand.
2. **MAIN** — Player may, in any order, any number of times:
   - Move NORMAL/TEAL cards from Hand to an open Table slot; at 9 cards this swaps with a selected Table card and returns the replaced card to Hand.
   - Move any number of NORMAL/TEAL cards from their Table to Hand (they are shuffled back into the deck at turn end).
   - Play CONCEAL, STEAL, or REVEAL from their Hand — each triggers INTERRUPT.
   - Rearrange their own Table freely. Arrangement is purely local presentation order: it never contacts the server and is not synchronized to opponents.
3. **INTERRUPT** — The current eligible player has 30 seconds to play APPEAL or pass. Each link alternates the eligible player and resets the window; the chain ends when a player passes or a link expires, then parity decides whether the action resolves and phase returns to MAIN.
4. **End Turn** — All unused Action cards remain in Hand; every other card left in Hand is shuffled straight back into the deck. Tables never exceed 9 cards; if a Table is ever over the limit, the server rejects an explicit End Turn with a clear error rather than moving cards during cleanup. Then check for a win; the server records the valid partition it finds in `winningSets`, and the turn passes to the next player. Timer expiry uses the same cleanup without trimming a Table. `lastInterruptResult` is cleared when the turn ends or the next turn begins, so its transient notice never carries over. The default turn timer is 60 seconds and the host may set it to 15–180 seconds in the lobby.

### Pausing
The host may pause and resume at any time while `phase === 'playing'`; pause controls are unavailable in the lobby and after the game ends. On pause the engine clears every absolute deadline, stores each remaining time in `pauseRemaining`, sets `paused = true`, and stops scheduling an alarm. While paused `reduceRoom` rejects every game intent with `Game is paused` (placing, moving, ending a turn, appealing, passing, targeting, role changes); host management (kick, approve/decline rejoin) is handled outside the pure game reducer and stays available. Players may still rearrange their own Table because that path never reaches the server. Resume recomputes each deadline and re-arms the room alarm. The game never auto-resumes, including when host ownership transfers; the new host receives the controls.

### End of Game and Lobby Reset

Two engine helpers sit outside `RoomIntent` because the Worker must supply a fresh random seed and may need to delete the room:

- `returnToLobby(state, actorId, freshSeed)` requires `actorId === hostId` and `phase === 'finished'`. It clones the room, keeps the host plus every connected, non-away, non-left, non-kicked player, keeps every connected, non-left spectator, and drops everyone else. It clears the deck, Tables, Hands, turn state, pending action, pause state, winner, winning sets, rejoin requests, and interrupt result. It resets `randomSeed` to `freshSeed` and `randomCounter` to 0, keeps the room code and `turnDurationSeconds`, and returns the room directly to `lobby`. Dropped names and default `Player N` numbers become available again.
- `leaveRoom(state, actorId)` is available in `lobby` and `finished`, never in `playing`. A non-winner is removed immediately. During `finished`, a winner is retained with `left: true`, `connected: false`, and no session IDs so the Game Over result stays renderable until the reset. The helper returns `{ result, removedId?, roomDeleted? }`; `roomDeleted` is true when no non-left, non-kicked members remain.

Host succession runs for both disconnect transfer and explicit leaving. It selects the first remaining connected, non-left, non-kicked member in list order, with `players` considered before `spectators`. A left winner never inherits. The Worker closes the leaving member's sockets after sending `{ t: 'left' }`; when `roomDeleted` is true it deletes all storage and closes every remaining socket. On `returnToLobby`, sockets for dropped members are closed without `left`; if they reconnect, normal lobby join rules treat them as new members.

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
  - `findWinningPartition()` only needs to confirm *some* valid partition of the 9 Table cards into 3 sets exists — an existence check, not an identification of specific groupings.
  - The win check is server-authoritative: it runs in the room reducer at end of turn, never in the browser. Clients receive no set-progress data during play and do not compute set validity or set counts.
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
| `game/packages/engine/src/room.ts` | Pure room lifecycle, turn, timer, pause/resume, away, rejoin, lobby reset, and leave reducers |
| `game/packages/engine/src/interrupts.ts` | Appeal eligibility, automatic pass, and interrupt resolution |
| `game/src/shared/protocol.ts` | Zod-validated messages and public/private view schemas |
| `game/src/logic/tableLayout.ts` | Local-only Table layout merge/move helpers |
| `game/src/logic/createRoom.ts` | Room-code validation, exists probe, and atomic create-with-code |
| `game/worker/gameRoom.ts` | Durable Object persistence, WebSocket views, alarms, and the internal exists check |
| `game/worker/views.ts` | Player/spectator filtering of authoritative state |
| `game/src/components/game/MemberActionsMenu.tsx` | Shared host-management menu used in the lobby and game views |
| `game/src/components/game/YourTurnPopup.tsx` | Per-turn, private five-second active-player notice |

## 7. Protocol Notes

Every client/server message is Zod-validated in `src/shared/protocol.ts`.

- **Pause / resume intents:** the host sends `{ t: 'pause' }` and `{ t: 'resume' }`. The server is authoritative about whether the host may pause; the resulting state arrives as a filtered `view` snapshot with `paused`, `pauseRemaining`, and null deadlines.
- **Host transfer:** `{ t: 'transferHost', playerId }` is a Zod-validated, host-only management message handled outside the pure game reducer. It is valid in every phase, including while paused or finished, and accepts another connected, non-left, non-kicked player or spectator. It changes only `hostId`: seats, phase, pause state, timers, and rejoin requests remain unchanged. The new host receives the private rejoin-request list and pause/resume controls; the previous host keeps their seat and role.
- **Interrupt chain:** the public `interrupt` carries `appealDepth` and `appealPlayers` (already-played appealers only). `responderIds`, `passedIds`, and unplayed APPEAL ownership stay server-private.
- **Interrupt deadline:** the current link's deadline is the `endsAt` field (`number | null`). It is `null` while the game is paused, with the frozen remaining time in `pauseRemaining.interrupt`. Each APPEAL resets `endsAt` to `now + 30_000`; the room alarm always targets the earliest deadline.
- **Targeted-card view:** `you.interruptCard` is private and defaults to `null`. On the first link STEAL/REVEAL expose the card to its owner only; CONCEAL exposes the actor's public revealed card to non-actor players. Actors on blind targets, uninvolved players, and spectators receive `null`. On a later link only the currently eligible responder sees the APPEAL face just played against them. No APPEAL-holder or responder list is included.
- **`winningSets`:** the FINISHED snapshot carries `winningSets: string[][] | null` — the card IDs of the three validated sets (grouped 3×3) the engine found — so every client renders the same Game Over grouping.
- **End-of-game intents:** `{ t: 'returnToLobby' }` is host-only and only valid while `phase === 'finished'`; the Worker generates the fresh seed. `{ t: 'leaveRoom' }` is available in the lobby and after the game ends. Both are Zod-validated before reaching the engine helpers.
- **Leave confirmation:** after a successful `leaveRoom`, the Worker sends `{ t: 'left' }` to the leaving member and closes their socket. The client stops reconnecting and navigates home. The host's `returnToLobby` produces an ordinary lobby `view` snapshot; no `left` message is sent to the host.
- **Transient interrupt result:** `lastInterruptResult` includes `resolvedAt` (server milliseconds), `appealDepth`, and `appealedBy` (the decisive last appealer, or `null` when the action resolved). Clients key the five-second result notice on `kind + outcome + resolvedAt` and remember it in `sessionStorage`, so the same snapshot does not re-show the notice after a reconnect or reload. The wording distinguishes an odd (cancelled) chain from an even (countered then resolved) chain.
- **Host-only rejoin requests:** only the host's player `view.data.you.rejoinRequests` contains pending request IDs and names; all other views get `[]`.
- **Rejection error:** while `paused` is true the server rejects game intents (placing, moving, ending a turn, appealing, passing, targeting) and answers with the error message `Game is paused`.

import {
  publicInterrupt,
  type RoomPlayer,
  type RoomState
} from '@3eal/engine';
import type { PublicPlayer, PublicView, View } from '../src/shared/protocol';

function publicPlayers(players: RoomPlayer[], phase: RoomState['phase']): PublicPlayer[] {
  return players.map((player) => ({
    id: player.id,
    name: player.name,
    connected: player.connected,
    away: player.away,
    table: player.table.map((slot) => slot.revealed || phase === 'finished'
      ? { state: 'revealed' as const, card: slot.card }
      : { state: 'concealed' as const, cardId: slot.card.id }),
    handCount: player.hand.length
  }));
}

export function publicView(room: RoomState): PublicView {
  const view: PublicView = {
    roomCode: room.roomCode,
    phase: room.phase,
    hostId: room.hostId,
    players: publicPlayers(room.players, room.phase),
    spectators: room.spectators.map(({ id, name, connected }) => ({ id, name, connected })),
    spectatorCount: room.spectators.length,
    activePlayerId: room.activePlayerId,
    turnEndsAt: room.turnEndsAt,
    turnRemainingMs: room.turnRemainingMs,
    turnDurationSeconds: room.turnDurationSeconds,
    turnNumber: room.turnNumber,
    interrupt: publicInterrupt(room.pendingAction?.interrupt ?? null),
    lastInterruptResult: room.lastInterruptResult,
    deckCount: room.deck.length,
    discardCount: room.discardPile.length,
    winnerId: room.winnerId
  };
  if (room.phase === 'finished') {
    view.reveal = {
      players: Object.fromEntries(room.players.map((player) => [
        player.id,
        {
          table: player.table.map((slot) => slot.card),
          hand: player.hand
        }
      ])),
      deck: room.deck,
      discardPile: room.discardPile
    };
  }
  return view;
}

export function spectatorView(room: RoomState): View {
  return { role: 'spectator', data: publicView(room) };
}

export function playerView(room: RoomState, playerId: string): View {
  const player = room.players.find((candidate) => candidate.id === playerId);
  if (!player) return spectatorView(room);
  const data = publicView(room);
  const concealedOwn = Object.fromEntries(
    player.table.filter((slot) => !slot.revealed).map((slot) => [slot.card.id, slot.card])
  );
  return {
    role: 'player',
    data: {
      ...data,
      you: { id: player.id, hand: player.hand, concealedOwn }
    }
  };
}

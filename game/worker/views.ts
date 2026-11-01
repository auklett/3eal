import {
  publicInterrupt,
  type InterruptState,
  type RoomPlayer,
  type RoomState,
  type TableCard
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
      : { state: 'concealed' as const, cardId: slot.card.id })
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
    paused: room.paused,
    pauseRemaining: room.pauseRemaining
      ? { turn: room.pauseRemaining.turn, interrupt: room.pauseRemaining.interrupt }
      : null,
    interrupt: publicInterrupt(room.pendingAction?.interrupt ?? null),
    // `stolenToHandBy` is private to the actor: its public form only says that
    // an action resolved, never where a card went.
    lastInterruptResult: room.lastInterruptResult
      ? {
          kind: room.lastInterruptResult.kind,
          outcome: room.lastInterruptResult.outcome,
          resolvedAt: room.lastInterruptResult.resolvedAt
        }
      : null,
    deckCount: room.deck.length,
    winnerId: room.winnerId,
    winningSets: room.winningSets
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
      deck: room.deck
    };
  }
  return view;
}

/**
 * The targeted card is private. A STEAL or REVEAL reveals it to the owner of
 * the card only; a CONCEAL reveals it to the players who may appeal it. The
 * actor and every other viewer receive `null`, so a concealed identity never
 * travels to anyone who should not already know it.
 */
function viewerInterruptCard(
  room: RoomState,
  viewerId: string
): { cardId: string; card: TableCard; revealed: boolean } | null {
  const interrupt: InterruptState | undefined = room.pendingAction?.interrupt;
  if (!interrupt) return null;
  if (interrupt.kind === 'CONCEAL') {
    // The card is the actor's own revealed Table card, so every non-actor may
    // be shown it. Filtering by responderIds would reveal who holds APPEAL.
    if (viewerId === interrupt.actorId) return null;
  } else if (viewerId !== interrupt.targetId) {
    return null;
  }
  const target = room.players.find((player) => player.id === interrupt.targetId);
  const slot = target?.table.find((candidate) => candidate.card.id === interrupt.targetCardId);
  if (!slot) return null;
  return { cardId: slot.card.id, card: slot.card, revealed: slot.revealed };
}

export function spectatorView(room: RoomState, viewerId: string): View {
  return {
    role: 'spectator',
    data: {
      ...publicView(room),
      // Spectators can also be appointed host, so they need to know their own
      // participant ID without seeing the host-only controls.
      you: { id: viewerId }
    }
  };
}

export function playerView(room: RoomState, playerId: string): View {
  const player = room.players.find((candidate) => candidate.id === playerId);
  if (!player) return spectatorView(room, playerId);
  const data = publicView(room);
  const concealedOwn = Object.fromEntries(
    player.table.filter((slot) => !slot.revealed).map((slot) => [slot.card.id, slot.card])
  );
  return {
    role: 'player',
    data: {
      ...data,
      you: {
        id: player.id,
        hand: player.hand,
        concealedOwn,
        interruptCard: viewerInterruptCard(room, player.id),
        // Private confirmation for the STEAL actor whose card went to Hand.
        stolenToHandAt: room.lastInterruptResult?.stolenToHandBy === player.id
          ? room.lastInterruptResult.resolvedAt
          : null,
        rejoinRequests: player.id === room.hostId
          ? room.rejoinRequests.map((request) => ({ requestId: request.id, name: request.name }))
          : []
      }
    }
  };
}

export type CardColor = 'C0C0C0' | '008080' | 'C06060';
export type CardShape = 'circle' | 'triangle' | 'square' | 'pentagon' | 'hexagon';
export type ActionType = 'CONCEAL' | 'STEAL' | 'REVEAL' | 'APPEAL' | 'TEAL';

export type Card = {
  id: string;
  isActionCard: boolean;
  isRevealed: boolean;

  color?: CardColor;
  number?: number;
  shape?: CardShape;

  actionType?: ActionType;
  title?: string;
  description?: string;
}

export type Player = {
  id: string;
  name: string;
  isHost: boolean;
  // Fixed 9-slot grid; null entries are empty slots so cards can occupy any
  // position while leaving gaps (e.g. a card in slot 9 with slots 1-3 filled).
  hand: (Card | null)[];
  sets: Card[][];
}

export type TurnPhase = 'DRAW' | 'MAIN' | 'DISCARD' | 'INTERRUPT';
export type RoomStatus = 'LOBBY' | 'IN_GAME' | 'FINISHED';

export type PendingAction = {
  sourcePlayerId: string;
  targetPlayerId: string;
  actionCard: Card;
  targetCardId?: string;
  canAppealUntil: number;
}

export type GameState = {
  deck: Card[];
  discardPile: Card[];
  activePlayerId: string;
  turnPhase: TurnPhase;
  pendingAction?: PendingAction;
  winnerId: string | null;
}

export type RoomState = {
  roomCode: string;
  status: RoomStatus;
  players: Record<string, Player>;
  hostId: string;
  game?: GameState;
}

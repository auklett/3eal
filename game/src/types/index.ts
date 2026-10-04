export type CardColor = 'C0C0FF' | '008080' | 'C06060' | '884488' | '404088';
export type CardShape = 'circle' | 'triangle' | 'square' | 'pentagon' | 'hexagon';
export type ActionType = 'CONCEAL' | 'STEAL' | 'REVEAL' | 'APPEAL';
export type CardCategory = 'NORMAL' | 'WILD' | 'ACTION';

export type Card = {
  id: string;
  category: CardCategory;
  isRevealed: boolean;

  color?: CardColor;
  number?: number;
  shape?: CardShape;

  actionType?: ActionType;
  title?: string;
  description?: string;
};

export type Player = {
  id: string;
  name: string;
  isHost: boolean;
  table: Card[];
  hand: Card[];
  sets: Array<{ cards: Card[] }>;
};

export type TurnPhase = 'DRAW' | 'MAIN' | 'INTERRUPT';
export type RoomStatus = 'LOBBY' | 'IN_GAME' | 'FINISHED';

export type PendingAction = {
  sourcePlayerId: string;
  targetPlayerId: string;
  actionCard: Card;
  actionType: Exclude<ActionType, 'APPEAL'>;
  targetCardId: string;
  wasBlindTarget: boolean;
  resolveAt: number;
  turnTimeRemainingMs?: number;
  resolvedByPlayerId?: string;
};

export type GameState = {
  deck: Card[];
  activePlayerId: string;
  turnNumber?: number;
  version: number;
  randomSeed: number;
  turnDurationMs: number;
  turnEndsAt?: number;
  consecutiveMissedTurns?: Record<string, number>;
  forfeitedPlayerIds?: string[];
  turnPhase: TurnPhase;
  pendingAction?: PendingAction;
  winnerId: string | null;
};

export type RoomState = {
  roomCode: string;
  status: RoomStatus;
  players: Record<string, Player>;
  hostId: string;
  game?: GameState;
};

export const COLORS = ['periwinkle', 'teal', 'rose', 'grape', 'frenchBlue'] as const;
export type Color = (typeof COLORS)[number];

export const COLOR_HEX = {
  periwinkle: 'C0C0FF',
  teal: '008080',
  rose: 'C06060',
  grape: '884488',
  frenchBlue: '404088'
} satisfies Record<Color, string>;

export const SHAPES = ['circle', 'triangle', 'square', 'pentagon', 'hexagon'] as const;
export type Shape = (typeof SHAPES)[number];

export const NUMBERS = [1, 2, 3, 4, 5, 6, 7] as const;
export type NumberValue = (typeof NUMBERS)[number];

export const ACTIONS = ['CONCEAL', 'STEAL', 'REVEAL', 'APPEAL'] as const;
export type ActionKind = (typeof ACTIONS)[number];
export type InterruptAction = Exclude<ActionKind, 'APPEAL'>;

export type CardId = string;
export type NormalCard = {
  id: CardId;
  kind: 'normal';
  color: Color;
  number: NumberValue;
  shape: Shape;
};
export type TealCard = { id: CardId; kind: 'teal' };
export type ActionCard = { id: CardId; kind: 'action'; action: ActionKind };
export type Card = NormalCard | TealCard | ActionCard;
export type TableCard = NormalCard | TealCard;
export type Set = [TableCard, TableCard, TableCard];

export type AppealLink = { playerId: CardId; cardId: CardId };

export type InterruptActionIntent = {
  id: string;
  kind: InterruptAction;
  actorId: string;
  targetId: string;
  targetCardId: CardId;
};

export type InterruptState = InterruptActionIntent & {
  /** Absolute deadline, or `null` while the host has the game paused. */
  endsAt: number | null;
  /** Appeals played in this chain, oldest first. `depth` is its length. */
  appeals: AppealLink[];
  /** Depth-0 initial eligibles (APPEAL holders only). */
  responderIds: string[];
  /** Depth-0 passers (CONCEAL multi-responder race). */
  passedIds: string[];
};

export type InterruptOutcome =
  | { status: 'open'; interrupt: InterruptState }
  | { status: 'resolved'; reason: 'no-appeal-available' | 'all-passed' | 'appealed' | 'expired'; appealedBy?: string };

export type InterruptResponse =
  | { status: 'open'; interrupt: InterruptState }
  | { status: 'resolved'; reason: 'all-passed' | 'appealed' | 'expired'; appealedBy?: string };

export type InterruptParticipant = {
  id: string;
  hand: Card[];
};

/** The players currently eligible to respond, given the chain depth. */
export function eligibleResponders(interrupt: InterruptState): string[] {
  const depth = interrupt.appeals.length;
  if (depth === 0) return interrupt.responderIds;
  if (depth % 2 === 1) return [interrupt.actorId];
  return [interrupt.appeals[depth - 2]!.playerId];
}

export type RandomSource = () => number;

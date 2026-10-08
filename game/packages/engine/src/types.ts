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

export type InterruptActionIntent = {
  id: string;
  kind: InterruptAction;
  actorId: string;
  targetId: string;
  targetCardId: CardId;
};

export type InterruptState = InterruptActionIntent & {
  endsAt: number;
  responderIds: string[];
  passedIds: string[];
};

export type InterruptOutcome =
  | { status: 'open'; interrupt: InterruptState }
  | { status: 'resolved'; reason: 'no-appeal-available' | 'all-passed' | 'appealed' | 'expired'; appealedBy?: string };

export type InterruptResponse =
  | { status: 'open'; interrupt: InterruptState }
  | { status: 'resolved'; reason: 'all-passed' | 'appealed'; appealedBy?: string };

export type InterruptParticipant = {
  id: string;
  hand: Card[];
};

export type RandomSource = () => number;

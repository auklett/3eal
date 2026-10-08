import { z } from 'zod';
import { ACTIONS, COLORS, SHAPES, type Card, type InterruptAction, type TableCard } from '@3eal/engine';

const nameSchema = z.string().trim().min(1).max(24);
const spectatorNameSchema = z.string().trim().min(1).max(64);
const cardIdSchema = z.string().min(1).max(64);
const playerIdSchema = z.string().uuid();
const slotSchema = z.number().int().min(0).max(217);

export const ClientMsgSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('join'), name: nameSchema, sessionId: playerIdSchema, role: z.enum(['player', 'spectator']).default('player') }).strict(),
  z.object({ t: z.literal('setRole'), role: z.enum(['player', 'spectator']) }).strict(),
  z.object({ t: z.literal('setTurnTimer'), seconds: z.number().int().min(15).max(180) }).strict(),
  z.object({ t: z.literal('start') }).strict(),
  z.object({ t: z.literal('place'), cardId: cardIdSchema, slot: slotSchema }).strict(),
  z.object({ t: z.literal('toHand'), slot: slotSchema }).strict(),
  z.object({
    t: z.literal('action'),
    cardId: cardIdSchema,
    kind: z.enum(['CONCEAL', 'STEAL', 'REVEAL']),
    targetId: playerIdSchema,
    slot: slotSchema
  }).strict(),
  z.object({ t: z.literal('appeal'), cardId: cardIdSchema }).strict(),
  z.object({ t: z.literal('pass') }).strict(),
  z.object({ t: z.literal('endTurn') }).strict(),
  z.object({ t: z.literal('rejoin'), name: nameSchema, sessionId: playerIdSchema }).strict(),
  z.object({ t: z.literal('rejoinDecision'), requestId: z.string().uuid(), accept: z.boolean() }).strict(),
  z.object({ t: z.literal('kick'), targetId: playerIdSchema }).strict(),
  z.object({ t: z.literal('rematch') }).strict()
]);

export const CreateRoomSchema = z.object({
  name: nameSchema,
  turnstileToken: z.string().min(1).max(4096)
}).strict();

const NormalCardSchema = z.object({
  id: cardIdSchema,
  kind: z.literal('normal'),
  color: z.enum(COLORS),
  number: z.union([
    z.literal(1), z.literal(2), z.literal(3), z.literal(4),
    z.literal(5), z.literal(6), z.literal(7)
  ]),
  shape: z.enum(SHAPES)
}).strict();
const TealCardSchema = z.object({ id: cardIdSchema, kind: z.literal('teal') }).strict();
const ActionCardSchema = z.object({ id: cardIdSchema, kind: z.literal('action'), action: z.enum(ACTIONS) }).strict();
const TableCardSchema = z.discriminatedUnion('kind', [NormalCardSchema, TealCardSchema]);
export const CardSchema = z.discriminatedUnion('kind', [NormalCardSchema, TealCardSchema, ActionCardSchema]);

const PublicSlotSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('revealed'), card: TableCardSchema }).strict(),
  z.object({ state: z.literal('concealed'), cardId: cardIdSchema }).strict()
]);

const PublicPlayerSchema = z.object({
  id: playerIdSchema,
  name: nameSchema,
  connected: z.boolean(),
  away: z.boolean(),
  table: z.array(PublicSlotSchema),
  handCount: z.number().int().nonnegative()
}).strict();

const PublicSpectatorSchema = z.object({
  id: playerIdSchema,
  name: spectatorNameSchema,
  connected: z.boolean()
}).strict();

const PublicInterruptSchema = z.object({
  id: z.string(),
  kind: z.enum(['CONCEAL', 'STEAL', 'REVEAL']),
  actorId: playerIdSchema,
  targetId: playerIdSchema,
  targetCardId: cardIdSchema,
  endsAt: z.number().int()
}).strict();

const LastInterruptResultSchema = z.object({
  kind: z.enum(['CONCEAL', 'STEAL', 'REVEAL']),
  outcome: z.enum(['appealed', 'resolved', 'expired'])
}).strict();

const PublicViewSchema = z.object({
  roomCode: z.string().regex(/^[A-Z0-9]{4,6}$/),
  phase: z.enum(['lobby', 'playing', 'finished']),
  hostId: playerIdSchema,
  players: z.array(PublicPlayerSchema),
  spectators: z.array(PublicSpectatorSchema),
  spectatorCount: z.number().int().nonnegative(),
  activePlayerId: playerIdSchema.nullable(),
  turnEndsAt: z.number().int().nullable(),
  turnRemainingMs: z.number().int().nonnegative().nullable(),
  turnDurationSeconds: z.number().int().min(15).max(180),
  turnNumber: z.number().int().nonnegative(),
  interrupt: PublicInterruptSchema.nullable(),
  lastInterruptResult: LastInterruptResultSchema.nullable(),
  deckCount: z.number().int().nonnegative(),
  discardCount: z.number().int().nonnegative(),
  winnerId: playerIdSchema.nullable(),
  reveal: z.object({
    players: z.record(z.string(), z.object({ table: z.array(CardSchema), hand: z.array(CardSchema) })),
    deck: z.array(CardSchema),
    discardPile: z.array(CardSchema)
  }).optional()
}).strict();

export const ViewSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('player'),
    data: PublicViewSchema.extend({
      you: z.object({
        id: playerIdSchema,
        hand: z.array(CardSchema),
        concealedOwn: z.record(z.string(), TableCardSchema)
      }).strict()
    })
  }).strict(),
  z.object({ role: z.literal('spectator'), data: PublicViewSchema }).strict()
]);

export const ServerMsgSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('view'), view: ViewSchema }).strict(),
  z.object({ t: z.literal('rejoinPending') }).strict(),
  z.object({ t: z.literal('rejoinRequest'), requestId: z.string().uuid(), name: nameSchema }).strict(),
  z.object({ t: z.literal('rejoinResult'), accepted: z.boolean(), role: z.enum(['player', 'spectator']) }).strict(),
  z.object({ t: z.literal('error'), code: z.string(), message: z.string() }).strict()
]);

export type ClientMsg = z.infer<typeof ClientMsgSchema>;
export type ServerMsg = z.infer<typeof ServerMsgSchema>;
export type PublicSlot =
  | { state: 'revealed'; card: Card }
  | { state: 'concealed'; cardId: string };
export type PublicPlayer = z.infer<typeof PublicPlayerSchema>;
export type PublicSpectator = z.infer<typeof PublicSpectatorSchema>;
export type PublicView = z.infer<typeof PublicViewSchema>;
export type PlayerView = PublicView & {
  you: { id: string; hand: Card[]; concealedOwn: Record<string, TableCard> };
};
export type View =
  | { role: 'player'; data: PlayerView }
  | { role: 'spectator'; data: PublicView };
export type { Card, InterruptAction };

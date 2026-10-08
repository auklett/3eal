import { z } from 'zod';
import { ACTIONS, COLORS, SHAPES } from '@3eal/engine';

const normalCardSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('normal'),
  color: z.enum(COLORS),
  number: z.union([
    z.literal(1), z.literal(2), z.literal(3), z.literal(4),
    z.literal(5), z.literal(6), z.literal(7)
  ]),
  shape: z.enum(SHAPES)
}).strict();
const tealCardSchema = z.object({ id: z.string().min(1), kind: z.literal('teal') }).strict();
const actionCardSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('action'),
  action: z.enum(ACTIONS)
}).strict();
const cardSchema = z.discriminatedUnion('kind', [normalCardSchema, tealCardSchema, actionCardSchema]);

const tableCardSchema = z.discriminatedUnion('kind', [normalCardSchema, tealCardSchema]);

const interruptSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['CONCEAL', 'STEAL', 'REVEAL']),
  actorId: z.string().uuid(),
  targetId: z.string().uuid(),
  targetCardId: z.string().min(1),
  endsAt: z.number().int(),
  responderIds: z.array(z.string().uuid()),
  passedIds: z.array(z.string().uuid())
}).strict();

export const persistedRoomSchema = z.object({
  roomCode: z.string().regex(/^[A-Z0-9]{4,6}$/),
  phase: z.enum(['lobby', 'playing', 'finished']),
  hostId: z.string().uuid(),
  players: z.array(z.object({
    id: z.string().uuid(),
    sessionIds: z.array(z.string().uuid()),
    name: z.string().trim().min(1).max(24),
    connected: z.boolean(),
    away: z.boolean(),
    awayAt: z.number().int().nullable(),
    kicked: z.boolean(),
    table: z.array(z.object({
      card: tableCardSchema,
      revealed: z.boolean()
    }).strict()),
    hand: z.array(cardSchema)
  }).strict()),
  spectators: z.array(z.object({
    id: z.string().uuid(),
    sessionIds: z.array(z.string().uuid()),
    name: z.string().trim().min(1).max(64),
    connected: z.boolean()
  }).strict()),
  turnDurationSeconds: z.number().int().min(15).max(180),
  deck: z.array(cardSchema),
  discardPile: z.array(cardSchema),
  activePlayerId: z.string().uuid().nullable(),
  turnNumber: z.number().int().nonnegative(),
  turnEndsAt: z.number().int().nullable(),
  turnRemainingMs: z.number().int().nonnegative().nullable(),
  pendingAction: z.object({
    actionCard: actionCardSchema,
    interrupt: interruptSchema
  }).strict().nullable(),
  lastInterruptResult: z.object({
    kind: z.enum(['CONCEAL', 'STEAL', 'REVEAL']),
    outcome: z.enum(['appealed', 'resolved', 'expired'])
  }).strict().nullable(),
  winnerId: z.string().uuid().nullable(),
  randomSeed: z.string().min(1),
  randomCounter: z.number().int().nonnegative(),
  rejoinRequests: z.array(z.object({
    id: z.string().uuid(),
    requesterId: z.string().uuid(),
    spectatorId: z.string().uuid(),
    playerId: z.string().uuid(),
    name: z.string().trim().min(1).max(24),
    expiresAt: z.number().int()
  }).strict()),
  skipAfterInterrupt: z.boolean()
}).strict();

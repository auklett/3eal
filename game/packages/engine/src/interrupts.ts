import type {
  InterruptActionIntent,
  InterruptOutcome,
  InterruptParticipant,
  InterruptResponse,
  InterruptState
} from './types';
import { eligibleResponders } from './types';

export const MAX_INTERRUPT_DURATION_MS = 30_000;

export function openInterrupt(
  action: InterruptActionIntent,
  participants: readonly InterruptParticipant[],
  now: number
): InterruptOutcome {
  if (!Number.isFinite(now)) throw new RangeError('Interrupt start time must be finite');

  const eligibleIds = action.kind === 'CONCEAL'
    ? participants.filter((participant) => participant.id !== action.actorId).map((participant) => participant.id)
    : participants.filter((participant) => participant.id === action.targetId).map((participant) => participant.id);
  const responderIds = eligibleIds.filter((id) =>
    participants.find((participant) => participant.id === id)?.hand.some(
      (card) => card.kind === 'action' && card.action === 'APPEAL'
    )
  );

  if (responderIds.length === 0) {
    return { status: 'resolved', reason: 'no-appeal-available' };
  }

  return {
    status: 'open',
    interrupt: {
      ...action,
      endsAt: now + MAX_INTERRUPT_DURATION_MS,
      appeals: [],
      responderIds,
      passedIds: []
    }
  };
}

export function respondToInterrupt(
  interrupt: InterruptState,
  playerId: string,
  response: 'appeal' | 'pass',
  now: number,
  cardId?: string
): InterruptResponse {
  if (interrupt.endsAt !== null && now >= interrupt.endsAt) return { status: 'resolved', reason: 'expired' };
  const eligible = eligibleResponders(interrupt);
  if (!eligible.includes(playerId)) {
    throw new Error('Player is not eligible to respond to this interrupt');
  }
  if (interrupt.appeals.length === 0 && interrupt.passedIds.includes(playerId)) {
    throw new Error('Player has already passed this interrupt');
  }

  if (response === 'appeal') {
    const appeals = [...interrupt.appeals, { playerId, cardId: cardId ?? '' }];
    return {
      status: 'open',
      interrupt: { ...interrupt, appeals, endsAt: now + MAX_INTERRUPT_DURATION_MS }
    };
  }

  const passedIds = [...interrupt.passedIds, playerId];
  if (interrupt.appeals.length === 0) {
    if (passedIds.length === interrupt.responderIds.length) {
      return { status: 'resolved', reason: 'all-passed' };
    }
    return { status: 'open', interrupt: { ...interrupt, passedIds } };
  }
  return { status: 'resolved', reason: 'all-passed' };
}

export function expireInterrupt(interrupt: InterruptState, now: number): InterruptResponse {
  if (interrupt.endsAt === null || now < interrupt.endsAt) return { status: 'open', interrupt };
  return { status: 'resolved', reason: 'expired' };
}

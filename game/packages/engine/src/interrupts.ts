import type {
  InterruptActionIntent,
  InterruptOutcome,
  InterruptParticipant,
  InterruptResponse,
  InterruptState
} from './types';

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
      responderIds,
      passedIds: []
    }
  };
}

export function respondToInterrupt(
  interrupt: InterruptState,
  playerId: string,
  response: 'appeal' | 'pass',
  now: number
): InterruptResponse {
  if (now >= interrupt.endsAt) return { status: 'resolved', reason: 'all-passed' };
  if (!interrupt.responderIds.includes(playerId)) {
    throw new Error('Player is not eligible to respond to this interrupt');
  }
  if (interrupt.passedIds.includes(playerId)) {
    throw new Error('Player has already passed this interrupt');
  }
  if (response === 'appeal') return { status: 'resolved', reason: 'appealed', appealedBy: playerId };

  const passedIds = [...interrupt.passedIds, playerId];
  if (passedIds.length === interrupt.responderIds.length) {
    return { status: 'resolved', reason: 'all-passed' };
  }
  return { status: 'open', interrupt: { ...interrupt, passedIds } };
}

export function expireInterrupt(interrupt: InterruptState, now: number): InterruptResponse {
  if (now < interrupt.endsAt) return { status: 'open', interrupt };
  return { status: 'resolved', reason: 'all-passed' };
}

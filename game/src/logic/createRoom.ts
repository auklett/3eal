export interface CreateRoomResult {
  roomCode: string;
  sessionId?: string;
}

/**
 * Requests room creation from the Worker. When `roomCode` is supplied the
 * server creates that exact code atomically and rejects if it is already in
 * use (HTTP 409).
 */
export async function requestRoomCreation(
  name: string,
  turnstileToken: string,
  roomCode?: string
): Promise<CreateRoomResult> {
  const response = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(roomCode ? { name, turnstileToken, roomCode } : { name, turnstileToken })
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload
      ? String(payload.error)
      : 'Unable to create a room.';
    throw new Error(message);
  }
  if (typeof payload !== 'object' || payload === null
    || !('roomCode' in payload) || typeof payload.roomCode !== 'string'
    || !('sessionId' in payload) || typeof payload.sessionId !== 'string') {
    throw new Error('The room service returned an invalid response.');
  }
  return { roomCode: payload.roomCode, sessionId: payload.sessionId };
}

/** Checks whether a room exists without creating or mutating any room state. */
export async function roomExists(roomCode: string): Promise<boolean> {
  const response = await fetch(`/api/rooms/${encodeURIComponent(roomCode)}/exists`);
  if (!response.ok) throw new Error('Room lookup failed.');
  const payload = await response.json() as { exists?: boolean };
  return payload.exists === true;
}

export const ROOM_CODE_PATTERN = /^[A-Z0-9]{4,6}$/;

/** Uppercases only. The letter O and the digit 0 are intentionally distinct. */
export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase();
}

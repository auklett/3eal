import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ServerMsgSchema,
  type ClientMsg,
  type View
} from '../shared/protocol';
import { roomExists } from '../logic/createRoom';

type RoomCommand = Exclude<ClientMsg, { t: 'join' } | { t: 'rejoin' }>;
type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'awaitingApproval' | 'notFound' | 'closed';

/** Copy shown while a server-bound action is in flight, and once it is accepted. */
export type SendFeedback = { pending: string; confirmation: string };

interface UseRoomOptions {
  name: string;
  role?: 'player' | 'spectator';
}

function getSessionId(roomCode: string): string {
  const key = `3eal-session:${roomCode}`;
  const stored = sessionStorage.getItem(key);
  if (stored) return stored;
  const sessionId = crypto.randomUUID();
  sessionStorage.setItem(key, sessionId);
  return sessionId;
}

function applyOptimistic(view: View, message: RoomCommand): View {
  if (view.role !== 'player') return view;
  const data = structuredClone(view.data);
  const own = data.players.find((player) => player.id === data.you.id);
  if (!own) return view;

  if (message.t === 'place') {
    const handIndex = data.you.hand.findIndex((card) => card.id === message.cardId);
    const card = data.you.hand[handIndex];
    if (handIndex < 0 || !card || (card.kind !== 'normal' && card.kind !== 'teal')) return view;
    const placed = { state: 'concealed' as const, cardId: card.id };
    if (own.table.length >= 9) {
      const replaced = own.table[message.slot];
      if (!replaced) return view;
      const replacedCard = replaced.state === 'revealed'
        ? replaced.card
        : data.you.concealedOwn[replaced.cardId];
      if (replacedCard) data.you.hand[handIndex] = replacedCard;
      else data.you.hand.splice(handIndex, 1);
      own.table[message.slot] = placed;
    } else {
      data.you.hand.splice(handIndex, 1);
      own.table.splice(message.slot, 0, placed);
    }
    delete data.you.concealedOwn[message.cardId];
    data.you.concealedOwn[message.cardId] = card;
    return { role: 'player', data };
  }

  if (message.t === 'toHand') {
    const slot = own.table[message.slot];
    if (!slot) return view;
    const card = slot.state === 'revealed' ? slot.card : data.you.concealedOwn[slot.cardId];
    if (card) data.you.hand.push(card);
    if (slot.state === 'concealed') delete data.you.concealedOwn[slot.cardId];
    own.table.splice(message.slot, 1);
    return { role: 'player', data };
  }

  if (message.t === 'action') {
    data.you.hand = data.you.hand.filter((card) => card.id !== message.cardId);
    return { role: 'player', data };
  }

  if (message.t === 'appeal') {
    data.you.hand = data.you.hand.filter((card) => card.id !== message.cardId);
    data.interrupt = null;
    return { role: 'player', data };
  }

  if (message.t === 'endTurn') {
    data.you.hand = [];
    return { role: 'player', data };
  }

  // The lobby keeps the slider/field in local state until the server confirms,
  // so an optimistic view would make a rejected timer look accepted.
  return view;
}

export function useRoom(roomCode: string, options: UseRoomOptions) {
  const [view, setView] = useState<View | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [left, setLeft] = useState(false);
  const canonicalView = useRef<View | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const leftRef = useRef(false);
  const pendingConfirmation = useRef<string | null>(null);
  const confirmationTimer = useRef<number | undefined>(undefined);

  // Clears the in-flight action once the server answers: an accepted snapshot
  // shows the confirmation, a rejection just stops the pending state (the
  // server's error is surfaced through `error`).
  const settlePending = useCallback((accepted: boolean) => {
    if (pendingConfirmation.current === null) return;
    const text = pendingConfirmation.current;
    pendingConfirmation.current = null;
    setPending(null);
    if (!accepted) return;
    setConfirmation(text);
    if (confirmationTimer.current !== undefined) window.clearTimeout(confirmationTimer.current);
    confirmationTimer.current = window.setTimeout(() => setConfirmation(null), 2500);
  }, []);

  useEffect(() => {
    let stopped = false;
    let retryTimer: number | undefined;
    let retryCount = 0;
    const sessionId = getSessionId(roomCode);
    const normalizedName = options.name.trim() || 'Player';

    const connect = () => {
      if (stopped) return;
      setStatus(retryCount === 0 ? 'connecting' : 'reconnecting');
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${protocol}//${location.host}/api/rooms/${roomCode}/ws`);
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        if (stopped) return socket.close();
        setError('');
        socket.send(JSON.stringify({
          t: 'join',
          name: normalizedName,
          role: options.role ?? 'player',
          sessionId
        }));
      });

      socket.addEventListener('message', (event: MessageEvent<unknown>) => {
        if (typeof event.data !== 'string') {
          setView(canonicalView.current);
          setError('The room sent an invalid update.');
          return;
        }
        let json: unknown;
        try {
          json = JSON.parse(event.data);
        } catch {
          setView(canonicalView.current);
          setError('The room sent invalid JSON.');
          return;
        }
        const parsed = ServerMsgSchema.safeParse(json);
        if (!parsed.success) {
          setView(canonicalView.current);
          setError('The room sent an update that does not match the protocol.');
          return;
        }
        const message = parsed.data;
        if (message.t === 'view') {
          retryCount = 0;
          canonicalView.current = message.view;
          setView(message.view);
          setStatus('connected');
          setError('');
          settlePending(true);
        } else if (message.t === 'error') {
          setView(canonicalView.current);
          setError(message.message);
          if (message.code === 'kicked') setStatus('closed');
          settlePending(false);
        } else if (message.t === 'rejoinPending') {
          setStatus('awaitingApproval');
          setError('Waiting for the host to approve your rejoin request.');
        } else if (message.t === 'rejoinResult') {
          setStatus('connected');
          setError(message.accepted ? '' : 'The host declined. You joined as a spectator.');
        } else if (message.t === 'left') {
          // A confirmed Leave Lobby: stop reconnecting and let the page navigate.
          leftRef.current = true;
          setLeft(true);
          setStatus('closed');
          setError('');
          settlePending(true);
        }
      });

      socket.addEventListener('close', () => {
        if (socketRef.current === socket) socketRef.current = null;
        if (stopped || leftRef.current) return;
        setView(canonicalView.current);
        const scheduleRetry = () => {
          retryCount += 1;
          const delay = Math.min(500 * (2 ** Math.min(retryCount - 1, 5)), 15_000);
          setStatus('reconnecting');
          retryTimer = window.setTimeout(connect, delay);
        };
        // If we never received a view, the room may simply not exist. Probe it
        // so a missing room shows "Room not found" instead of "Reconnecting…".
        if (!canonicalView.current) {
          void roomExists(roomCode)
            .then((exists) => {
              if (stopped) return;
              if (exists) {
                scheduleRetry();
              } else {
                setStatus('notFound');
                setError('Room not found.');
              }
            })
            .catch(() => {
              if (stopped) return;
              scheduleRetry();
            });
          return;
        }
        scheduleRetry();
      });

      socket.addEventListener('error', () => {
        setError('Connection interrupted. Reconnecting…');
      });
    };

    connect();
    return () => {
      stopped = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (confirmationTimer.current !== undefined) window.clearTimeout(confirmationTimer.current);
      socketRef.current?.close(1000, 'component-unmounted');
      socketRef.current = null;
      setStatus('closed');
    };
  }, [roomCode, options.name, options.role, settlePending]);

  const send = useCallback((message: RoomCommand, feedback?: SendFeedback) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError('Not connected to the room. Please wait for reconnection.');
      return false;
    }
    setError('');
    if (feedback) {
      // Optimistically show the in-flight state; the server snapshot (or its
      // error) resolves it in the message handler above.
      pendingConfirmation.current = feedback.confirmation;
      setConfirmation(null);
      setPending(feedback.pending);
      if (confirmationTimer.current !== undefined) window.clearTimeout(confirmationTimer.current);
    }
    setView((current) => current ? applyOptimistic(current, message) : current);
    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch (sendError) {
      setView(canonicalView.current);
      setError(sendError instanceof Error ? sendError.message : 'Could not send the room action.');
      if (feedback) {
        pendingConfirmation.current = null;
        setPending(null);
      }
      return false;
    }
  }, []);

  const clearError = useCallback(() => setError(''), []);
  return { view, status, error, clearError, send, pending, confirmation, left };
}

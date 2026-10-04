import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ActionType, Card, Player } from '../types';
import { completeSetCount } from '../logic/validation';
import {
  ensurePlayerId,
  cancelRejoinRequest,
  checkRejoinStatus,
  isRoomMember,
  kickPlayer,
  leaveRoom,
  rejoinRoom,
  respondToRejoinRequest,
  sendGameCommand,
  subscribeToRejoinRequests,
  subscribeToPlayerView,
  type GameViewPlayer,
  type PlayerGameView,
  type RejoinRequest
} from '../lib/rooms';
import CardComponent from '../components/cards/CardComponent';
import HamburgerMenu from '../components/game/HamburgerMenu';
import ActionOverlay from '../components/game/ActionOverlay';

type Zone = 'table' | 'hand';

const buttonStyle: React.CSSProperties = {
  minHeight: 44,
  padding: '12px 20px',
  borderRadius: 12,
  color: '#FFFFFF',
  backgroundColor: '#000000',
  border: '2px solid #FFFFFF',
  cursor: 'pointer'
};

const disabledButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  opacity: 0.4,
  cursor: 'not-allowed'
};

function tableSlots(player: Pick<GameViewPlayer, 'table'>, preferredOrder: Array<string | null> = []): Array<string | null> {
  const cards = new Set(player.table.map((card) => card.id));
  const slots = Array.from({ length: Math.max(9, player.table.length) }, (_, index) => {
    const id = preferredOrder[index];
    return id && cards.has(id) ? id : null;
  });
  const included = new Set(slots.filter((id): id is string => id !== null));
  for (const card of player.table) {
    if (included.has(card.id)) continue;
    const emptyIndex = slots.indexOf(null);
    if (emptyIndex >= 0) slots[emptyIndex] = card.id;
    else slots.push(card.id);
  }
  return slots;
}

interface GameBoardProps {
  roomCode: string;
  onLeave: () => void;
  onReturnToLobby: () => void;
}

export default function GameBoard({ roomCode, onLeave, onReturnToLobby }: GameBoardProps) {
  const [view, setView] = useState<PlayerGameView | null>(null);
  const [localTableOrder, setLocalTableOrder] = useState<Array<string | null>>([]);
  const [dragPreview, setDragPreview] = useState<{ card: Card; x: number; y: number } | null>(null);
  const [dropSlotIndex, setDropSlotIndex] = useState<number | null>(null);
  const [selection, setSelection] = useState<{ zone: Zone; cardId: string } | null>(null);
  const [pendingActionType, setPendingActionType] = useState<Exclude<ActionType, 'APPEAL'> | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [appealDismissed, setAppealDismissed] = useState(false);
  const [canRejoin, setCanRejoin] = useState(false);
  const [rejoinRequested, setRejoinRequested] = useState(false);
  const [rejoinRequests, setRejoinRequests] = useState<RejoinRequest[]>([]);
  const [rejoinName, setRejoinName] = useState(() => sessionStorage.getItem('3eal-player-name') ?? '');
  const [isRejoining, setIsRejoining] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [turnSecondsLeft, setTurnSecondsLeft] = useState(0);
  const pendingCommandRef = useRef(false);
  const dragRef = useRef<{ card: Card; zone: Zone; pointerId: number; x: number; y: number; started: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const autoDrawTurnRef = useRef('');
  const pendingResolution = useRef('');
  const nextResolutionAttempt = useRef(0);
  const pendingTablePlacement = useRef<{ cardId: string; targetIndex: number } | null>(null);
  const viewRef = useRef<PlayerGameView | null>(null);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;
    void ensurePlayerId().then((id) => {
      if (!mounted) return;
      return subscribeToPlayerView(
        roomCode,
        id,
        (nextView) => {
          if (!mounted) return;
          viewRef.current = nextView;
          startTransition(() => setView(nextView));
          if (nextView?.pendingAction) setAppealDismissed(false);
          if (!nextView) {
            void isRoomMember(roomCode).then((isMember) => {
              if (!mounted) return;
              if (!isMember) {
                setCanRejoin(true);
                setError('Request your seat using your unique in-game name after the player has been away for 45 seconds. The host must approve.');
              } else {
                setError('Your private game view is not available. Return to the lobby and ask the host to start the game.');
              }
            }).catch((membershipError: unknown) => {
              if (mounted) setError(membershipError instanceof Error ? membershipError.message : 'Unable to verify your game membership.');
            });
          }
        },
        (subscriptionError) => {
          if (!mounted) return;
          void isRoomMember(roomCode).then((isMember) => {
            if (!mounted) return;
            if (!isMember) {
              setCanRejoin(true);
              setError('Request your seat using your unique in-game name after the player has been away for 45 seconds. The host must approve.');
              return;
            }
            setError(subscriptionError.message);
          }).catch((membershipError: unknown) => {
            if (mounted) {
              setError(membershipError instanceof Error ? membershipError.message : subscriptionError.message);
            }
          });
        }
      ).then((stop) => {
        if (mounted) unsubscribe = stop;
        else stop();
      });
    }).catch((connectionError: unknown) => {
      if (mounted) setError(connectionError instanceof Error ? connectionError.message : 'Unable to connect to the game.');
    });
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [roomCode, onLeave]);

  const heartbeatSelfId = view?.selfId;
  const heartbeatWinnerId = view?.winnerId;
  useEffect(() => {
    if (!heartbeatSelfId || heartbeatWinnerId) return;
    const heartbeat = () => {
      void sendGameCommand(roomCode, 'heartbeat').catch((heartbeatError: unknown) => {
        setError(heartbeatError instanceof Error ? heartbeatError.message : 'Connection heartbeat failed.');
      });
    };
    heartbeat();
    const interval = window.setInterval(heartbeat, 15_000);
    return () => window.clearInterval(interval);
  }, [roomCode, heartbeatSelfId, heartbeatWinnerId]);

  const isHost = Boolean(view?.players[view.selfId]?.isHost);
  useEffect(() => {
    if (!isHost) {
      setRejoinRequests([]);
      return;
    }
    return subscribeToRejoinRequests(
      roomCode,
      setRejoinRequests,
      (subscriptionError) => setError(subscriptionError.message)
    );
  }, [isHost, roomCode]);

  useEffect(() => {
    if (!rejoinRequested) return;
    const checkStatus = () => {
      void checkRejoinStatus(roomCode).then(({ status }) => {
        if (status === 'PLAYER' || status === 'SPECTATOR') {
          window.location.reload();
        } else if (status === 'EXPIRED' || status === 'NOT_FOUND') {
          setRejoinRequested(false);
          setError(status === 'EXPIRED'
            ? 'The request expired. You can try again or return to the main screen.'
            : 'The host dismissed your request. You can try again or return to the main screen.');
        }
      }).catch((statusError: unknown) => {
        setError(statusError instanceof Error ? statusError.message : 'Could not check your rejoin request.');
      });
    };
    checkStatus();
    const interval = window.setInterval(checkStatus, 2_500);
    return () => window.clearInterval(interval);
  }, [rejoinRequested, roomCode]);

  const send = useCallback(async (
    action: 'draw' | 'play' | 'appeal' | 'discard' | 'moveToTable' | 'moveToHand' | 'endTurn' | 'resolve',
    payload: Record<string, unknown> = {}
  ) => {
    if (pendingCommandRef.current) return false;
    pendingCommandRef.current = true;
    setPendingCommand(action);
    setError('');
    if (action !== 'resolve') {
      const label = action === 'endTurn' ? 'End turn' : action[0].toUpperCase() + action.slice(1);
      setMessage(`${label} sent. Waiting for the server…`);
    }
    try {
      await sendGameCommand(roomCode, action, payload);
      if (action !== 'resolve') setMessage('Action accepted. Waiting for the game state to sync…');
      else setMessage('Interrupt expired. Action resolved.');
      return true;
    } catch (commandError) {
      setError(commandError instanceof Error ? commandError.message : 'The move could not be completed.');
      setMessage('');
      return false;
    } finally {
      pendingCommandRef.current = false;
      setPendingCommand(null);
    }
  }, [roomCode]);

  const pendingAction = view?.pendingAction;
  useEffect(() => {
    if (!pendingAction) {
      setSecondsLeft(30);
      pendingResolution.current = '';
      nextResolutionAttempt.current = 0;
      return;
    }
    const resolutionKey = `${pendingAction.actionType}:${pendingAction.sourcePlayerId}:${pendingAction.resolveAt}`;
    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((pendingAction.resolveAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0 && pendingResolution.current !== resolutionKey && Date.now() >= nextResolutionAttempt.current) {
        pendingResolution.current = resolutionKey;
        nextResolutionAttempt.current = Date.now() + 1_000;
        void send('resolve').then((resolved) => {
          if (!resolved && pendingResolution.current === resolutionKey) pendingResolution.current = '';
        });
      }
    };
    updateTimer();
    const timer = window.setInterval(updateTimer, 250);
    return () => window.clearInterval(timer);
  }, [pendingAction, send]);

  useEffect(() => {
    if (!view?.turnEndsAt || view.winnerId || view.turnPhase === 'INTERRUPT') {
      setTurnSecondsLeft(0);
      return;
    }
    const updateTimer = () => setTurnSecondsLeft(Math.max(0, Math.ceil((view.turnEndsAt! - Date.now()) / 1_000)));
    updateTimer();
    const timer = window.setInterval(updateTimer, 250);
    return () => window.clearInterval(timer);
  }, [view?.turnEndsAt, view?.turnPhase, view?.winnerId]);

  const players = useMemo(() => view?.players ?? {}, [view?.players]);
  const self = view ? players[view.selfId] : undefined;
  const activePlayer = view ? players[view.activePlayerId] : undefined;
  const opponents = useMemo(
    () => Object.values(players).filter((player) => player.id !== view?.selfId),
    [players, view?.selfId]
  );
  const sameNameOpponent = Boolean(self && opponents.some((player) =>
    player.name.trim().toLocaleLowerCase() === self.name.trim().toLocaleLowerCase()
  ));
  const handSelection = selection?.zone === 'hand'
    ? self?.hand.find((card) => card.id === selection.cardId)
    : undefined;
  const tableSelection = selection?.zone === 'table'
    ? self?.table.find((card) => card.id === selection.cardId)
    : undefined;
  const isMyTurn = Boolean(view && view.activePlayerId === view.selfId && !view.winnerId);
  const appealCard = view?.canAppeal ? self?.hand.find((card) => card.actionType === 'APPEAL') : undefined;
  const selfTable = self?.table;
  const actionReady = isMyTurn && view?.turnPhase === 'MAIN';

  useEffect(() => {
    if (!self || !view || view.winnerId || view.turnPhase !== 'DRAW' || view.activePlayerId !== view.selfId) return;
    const turnKey = `${view.selfId}:${view.activePlayerId}:${view.turnNumber}`;
    if (autoDrawTurnRef.current === turnKey) return;
    autoDrawTurnRef.current = turnKey;
    void send('draw').then((drawn) => {
      if (!drawn) setMessage('Automatic draw failed. Check the error above and reload to retry.');
    });
  }, [pendingCommand, self, send, view]);

  useEffect(() => {
    if (!selfTable) return;
    const normalized = tableSlots({ table: selfTable }, localTableOrder);
    if (normalized.some((id, index) => id !== localTableOrder[index]) || normalized.length !== localTableOrder.length) {
      setLocalTableOrder(normalized);
    }
  }, [selfTable, localTableOrder]);

  useEffect(() => {
    const placement = pendingTablePlacement.current;
    if (!selfTable || !placement || !selfTable.some((card) => card.id === placement.cardId)) return;
    setLocalTableOrder((currentOrder) => {
      const slots = tableSlots({ table: selfTable }, currentOrder);
      const cardIndex = slots.indexOf(placement.cardId);
      if (cardIndex < 0) return slots;
      slots.splice(cardIndex, 1);
      slots.splice(placement.targetIndex, 0, placement.cardId);
      return slots.slice(0, Math.max(9, selfTable.length));
    });
    pendingTablePlacement.current = null;
  }, [selfTable]);

  const runCommand = (action: 'appeal' | 'endTurn', payload: Record<string, unknown> = {}) => {
    if (pendingCommandRef.current) return;
    void send(action, payload);
    setSelection(null);
  };

  const moveTableCard = useCallback((cardId: string, targetIndex: number) => {
    if (!self) return;
    const slots = tableSlots(self, localTableOrder);
    const sourceIndex = slots.indexOf(cardId);
    if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= slots.length || sourceIndex === targetIndex) return;
    const nextSlots = [...slots];
    nextSlots[sourceIndex] = slots[targetIndex];
    nextSlots[targetIndex] = cardId;
    setLocalTableOrder(nextSlots);
    setSelection(null);
  }, [self, localTableOrder]);

  const moveHandCardToTable = useCallback((cardId: string, targetIndex: number, replaceCardId?: string) => {
    if (!actionReady) return;
    void send('moveToTable', {
      cardId,
      ...(replaceCardId ? { replaceCardId } : {})
    }).then((moved) => {
      if (!moved) return;
      setSelection(null);
      pendingTablePlacement.current = { cardId, targetIndex };
      const latestView = viewRef.current;
      const latestSelf = latestView?.players[latestView.selfId];
      if (latestSelf?.table.some((card) => card.id === cardId)) {
        setLocalTableOrder((currentOrder) => {
          const slots = tableSlots(latestSelf, currentOrder);
          const cardIndex = slots.indexOf(cardId);
          if (cardIndex < 0) return slots;
          slots.splice(cardIndex, 1);
          slots.splice(targetIndex, 0, cardId);
          return slots.slice(0, Math.max(9, latestSelf.table.length));
        });
        pendingTablePlacement.current = null;
      }
    });
  }, [actionReady, send]);

  const moveTableCardToHand = useCallback((cardId: string) => {
    if (!actionReady) return;
    void send('moveToHand', { cardId }).then((moved) => {
      if (moved) setSelection(null);
    });
  }, [actionReady, send]);

  const beginCardDrag = (event: React.PointerEvent<HTMLButtonElement>, zone: Zone, cardId: string) => {
    if (event.button !== 0 || pendingCommandRef.current) return;
    const card = zone === 'table'
      ? self?.table.find((tableCard) => tableCard.id === cardId)
      : self?.hand.find((handCard) => handCard.id === cardId);
    if (!card || (zone === 'hand' && (!actionReady || card.category === 'ACTION'))) return;
    dragRef.current = { card, zone, pointerId: event.pointerId, x: event.clientX, y: event.clientY, started: false };
  };

  const handleLeaveGame = async () => {
    if (pendingCommandRef.current) return;
    pendingCommandRef.current = true;
    setPendingCommand('leave');
    try {
      await leaveRoom(roomCode);
      onLeave();
    } catch (leaveError) {
      setError(leaveError instanceof Error ? leaveError.message : 'Could not leave the game.');
    } finally {
      pendingCommandRef.current = false;
      setPendingCommand(null);
    }
  };

  const handleRejoin = async () => {
    setIsRejoining(true);
    setError('');
    try {
      const name = rejoinName.trim().slice(0, 24);
      const result = await rejoinRoom(roomCode, name);
      sessionStorage.setItem('3eal-player-name', name);
      if (result.status === 'PENDING') {
        setRejoinRequested(true);
        setError('Your request is waiting for the host. If it expires, you will join as a spectator when a spectator spot is available.');
      } else {
        window.location.reload();
      }
    } catch (rejoinError) {
      setError(rejoinError instanceof Error ? rejoinError.message : 'Could not rejoin the game.');
      setIsRejoining(false);
    }
  };

  const handleCancelRejoin = async () => {
    try {
      await cancelRejoinRequest(roomCode);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Could not cancel the rejoin request.');
    } finally {
      onLeave();
    }
  };

  const handleKickPlayer = async (playerId: string) => {
    if (pendingCommandRef.current) return;
    pendingCommandRef.current = true;
    setPendingCommand('kick');
    try {
      await kickPlayer(roomCode, playerId);
      setMessage('Player removed from the game.');
    } catch (kickError) {
      setError(kickError instanceof Error ? kickError.message : 'Could not remove the player.');
    } finally {
      pendingCommandRef.current = false;
      setPendingCommand(null);
    }
  };

  const handleRejoinResponse = async (requesterId: string, approve: boolean) => {
    try {
      await respondToRejoinRequest(roomCode, requesterId, approve);
      setMessage(approve ? 'Player rejoined the game.' : 'Request declined; the player can watch as a spectator.');
    } catch (responseError) {
      setError(responseError instanceof Error ? responseError.message : 'Could not respond to the rejoin request.');
    }
  };

  const handleTableSlotClick = (slotIndex: number) => {
    if (suppressClickRef.current || !self || pendingCommandRef.current) return;
    const slots = tableSlots(self, localTableOrder);
    const movingId = selection?.zone === 'table' ? selection.cardId : null;
    const tappedId = slots[slotIndex];
    if (selection?.zone === 'hand' && handSelection && handSelection.category !== 'ACTION' && actionReady) {
      if (self.table.length >= 9 && tappedId) moveHandCardToTable(handSelection.id, slotIndex, tappedId);
      else if (self.table.length < 9) moveHandCardToTable(handSelection.id, slotIndex);
      return;
    }
    if (!movingId) {
      setSelection(tappedId ? { zone: 'table', cardId: tappedId } : null);
      return;
    }
    if (movingId === tappedId) {
      setSelection(null);
      return;
    }
    moveTableCard(movingId, slotIndex);
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.started && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 8) return;
      if (!drag.started) {
        drag.started = true;
        setDraggingCardId(drag.card.id);
      }
      setDragPreview({ card: drag.card, x: event.clientX, y: event.clientY });
      const slotTarget = document.elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>('[data-table-slot]');
      const targetIndex = slotTarget ? Number(slotTarget.dataset.tableSlot) : NaN;
      setDropSlotIndex(Number.isInteger(targetIndex) ? targetIndex : null);
      event.preventDefault();
    };
    const finishPointer = (event: PointerEvent, cancelled = false) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setDraggingCardId(null);
      setDragPreview(null);
      setDropSlotIndex(null);
      if (!cancelled && drag.started) {
        const dropTarget = document.elementFromPoint(event.clientX, event.clientY);
        const tableTarget = dropTarget?.closest<HTMLElement>('[data-table-slot]');
        if (drag.zone === 'table' && tableTarget) {
          const targetIndex = Number(tableTarget.dataset.tableSlot);
          if (Number.isInteger(targetIndex)) moveTableCard(drag.card.id, targetIndex);
        } else if (drag.zone === 'hand' && tableTarget && self) {
          const targetIndex = Number(tableTarget.dataset.tableSlot);
          const slots = tableSlots(self, localTableOrder);
          const targetId = slots[targetIndex];
          if (Number.isInteger(targetIndex) && self.table.length >= 9 && targetId) {
            moveHandCardToTable(drag.card.id, targetIndex, targetId);
          } else if (Number.isInteger(targetIndex) && self.table.length < 9) {
            moveHandCardToTable(drag.card.id, targetIndex);
          }
        } else if (drag.zone === 'table' && dropTarget?.closest('[data-hand-zone]')) {
          moveTableCardToHand(drag.card.id);
        }
        suppressClickRef.current = true;
        window.setTimeout(() => { suppressClickRef.current = false; }, 100);
      }
    };
    const handlePointerUp = (event: PointerEvent) => finishPointer(event);
    const handlePointerCancel = (event: PointerEvent) => finishPointer(event, true);
    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [localTableOrder, moveHandCardToTable, moveTableCard, moveTableCardToHand, self]);

  const handlePlay = () => {
    if (!handSelection || handSelection.category !== 'ACTION' || !handSelection.actionType) return;
    if (handSelection.actionType === 'APPEAL') {
      setError('APPEAL can only be played during an interrupt.');
      return;
    }
    setError('');
    setPendingActionType(handSelection.actionType);
  };

  const handleConfirmTarget = async (targetPlayerId: string, targetCardId: string) => {
    if (!pendingActionType || !handSelection) return;
    const succeeded = await send('play', {
      cardId: handSelection.id,
      targetPlayerId,
      targetCardId
    });
    if (succeeded) {
      setPendingActionType(null);
      setSelection(null);
    }
  };

  const handleCardClick = (zone: Zone, card: Card) => {
    if (suppressClickRef.current || pendingCommandRef.current) return;
    if (zone === 'hand' && !isMyTurn) return;
    if (selection?.zone === zone && selection.cardId === card.id) setSelection(null);
    else setSelection({ zone, cardId: card.id });
  };

  if (canRejoin) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-black p-8 text-center text-white">
        <section className="w-full max-w-md rounded-2xl border border-white/25 bg-white/[0.05] p-6">
          <h1 className="mb-2 text-2xl font-bold">Rejoin 3EAL</h1>
          <p className="mb-5 text-sm text-white/70">{error}</p>
          <label className="mb-4 block text-left">
            <span className="mb-2 block text-sm">Your unique in-game name</span>
            <input
              value={rejoinName}
              maxLength={24}
              onChange={(event) => setRejoinName(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-white/30 bg-black px-3 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400"
            />
          </label>
          <div className="flex justify-center gap-3">
            <button type="button" style={buttonStyle} onClick={() => void (rejoinRequested ? handleCancelRejoin() : onLeave())}>
              {rejoinRequested ? 'Cancel Request' : 'Return Home'}
            </button>
            <button type="button" style={buttonStyle} disabled={isRejoining || rejoinRequested || !rejoinName.trim()} onClick={() => void handleRejoin()}>
              {isRejoining ? 'Sending…' : rejoinRequested ? 'Waiting for Host…' : 'Request to Rejoin'}
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (view?.viewerRole === 'SPECTATOR') {
    return (
      <main className="min-h-screen bg-black px-4 pb-10 pt-6 text-white sm:px-6">
        <HamburgerMenu
          players={Object.values(players)}
          selfId={view.selfId}
          roomCode={roomCode}
          onLeaveGame={() => void handleLeaveGame()}
          onKickPlayer={(playerId) => void handleKickPlayer(playerId)}
        />
        <header className="mx-auto mb-6 flex max-w-6xl items-center justify-between">
          <div>
            <h1 className="m-0 text-3xl font-bold tracking-wide">3EAL · Spectator</h1>
            <p className="text-sm text-white/60">Room {roomCode}</p>
          </div>
          <button type="button" style={buttonStyle} onClick={() => void handleLeaveGame()}>Leave Game</button>
        </header>
        <section className="mx-auto mb-6 max-w-6xl rounded-xl border border-white/25 bg-white/[0.06] p-4">
          <p className="text-lg">
            {view.winnerId
              ? `${players[view.winnerId]?.name ?? 'A player'} wins!`
              : `Watching ${players[view.activePlayerId]?.name ?? 'the next player'} · ${view.turnPhase}`}
          </p>
          <p className="text-sm text-white/70">Cards remaining: {view.deckCount}</p>
        </section>
        {error && <p className="mx-auto mb-4 max-w-6xl text-center text-sm text-rose-300" role="alert">{error}</p>}
        {isHost && rejoinRequests.length > 0 && (
          <section className="mx-auto mb-5 max-w-6xl rounded-xl border border-amber-200/30 bg-amber-950/20 p-4">
            <h2 className="mb-3 font-semibold">Rejoin requests</h2>
            {rejoinRequests.map((request) => (
              <div key={request.requesterId} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span>{request.name} wants to reclaim their seat.</span>
                <div className="flex gap-2">
                  <button type="button" style={buttonStyle} onClick={() => void handleRejoinResponse(request.requesterId, true)}>Approve</button>
                  <button type="button" style={buttonStyle} onClick={() => void handleRejoinResponse(request.requesterId, false)}>Decline as spectator</button>
                </div>
              </div>
            ))}
          </section>
        )}
        <section className="mx-auto grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Object.values(players).filter((player) => player.role === 'PLAYER').map((player) => (
            <article key={player.id} className="rounded-2xl border border-white/20 bg-white/[0.04] p-4">
              <h2 className="mb-3 font-semibold">
                {player.name}{player.id === view.activePlayerId ? ' · Active' : ''}
                <span className="ml-2 text-xs text-white/60">{player.isOnline ? 'Online' : 'Away'}</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {player.table.map((card) => (
                  <CardComponent key={card.id} card={card} faceDown={!card.isRevealed} />
                ))}
              </div>
            </article>
          ))}
        </section>
        {view.winnerId && (
          <p className="mt-8 text-center text-2xl font-bold" role="status">
            {players[view.winnerId]?.name} wins!
          </p>
        )}
      </main>
    );
  }

  if (!view || !self || !activePlayer) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-black p-8 text-center text-white">
        <p role={error ? 'alert' : 'status'}>{error || 'Connecting to the authoritative game…'}</p>
        {error && <button type="button" style={buttonStyle} onClick={onLeave}>Return Home</button>}
      </main>
    );
  }

  const exposedPlayers = Object.values(players) as Player[];
  const exposedSelf = self as Player;
  return (
    <main className="min-h-screen bg-black px-4 pb-10 pt-3 text-white sm:px-6">
      <HamburgerMenu
        players={Object.values(players)}
        selfId={view.selfId}
        roomCode={roomCode}
        onLeaveGame={() => void handleLeaveGame()}
        onKickPlayer={(playerId) => void handleKickPlayer(playerId)}
      />
      <header className="mb-5 flex items-center justify-center">
        <div className="text-center">
          <h1 className="m-0 text-4xl font-bold tracking-wide text-white">3EAL</h1>
          <p className="text-xs text-white/60">Room {roomCode}</p>
        </div>
      </header>

      <section className="mx-auto mb-5 flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-xl border border-white/25 bg-white/[0.06] p-4">
        <div>
          <p className="text-lg">
            {view.winnerId
              ? `${players[view.winnerId]?.name ?? 'A player'} wins!`
              : isMyTurn
                ? 'Your turn'
                : sameNameOpponent && activePlayer.name.trim().toLocaleLowerCase() === self.name.trim().toLocaleLowerCase()
                  ? `Another ${activePlayer.name}'s turn`
                  : `${activePlayer.name}'s turn (not you)`}
          </p>
          <p className="text-sm text-white/70">
            Phase: {view.turnPhase} · {isMyTurn ? 'You are the active player' : `Waiting for ${activePlayer.name}`} · {turnSecondsLeft}s left
          </p>
          {!isMyTurn && sameNameOpponent && !view.winnerId && (
            <p className="mt-1 text-sm text-amber-200" role="status">
              Another player in this room has the same display name as you; it is that player&apos;s turn.
            </p>
          )}
        </div>
        <div className="flex gap-4 text-sm text-white/80">
          <span>Cards remaining: {view.deckCount}</span>
          <span>Your sets: {completeSetCount(self.table)}/3</span>
        </div>
      </section>
      {isHost && rejoinRequests.length > 0 && (
        <section className="mx-auto mb-5 max-w-6xl rounded-xl border border-amber-200/30 bg-amber-950/20 p-4">
          <h2 className="mb-3 font-semibold">Rejoin requests</h2>
          <ul className="space-y-3">
            {rejoinRequests.map((request) => (
              <li key={request.requesterId} className="flex flex-wrap items-center justify-between gap-3">
                <span>{request.name} wants to reclaim their seat.</span>
                <div className="flex gap-2">
                  <button type="button" style={buttonStyle} onClick={() => void handleRejoinResponse(request.requesterId, true)}>Approve</button>
                  <button type="button" style={buttonStyle} onClick={() => void handleRejoinResponse(request.requesterId, false)}>Decline as spectator</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {message && <p className="mx-auto mb-4 max-w-6xl text-center text-sm text-teal-100" role="status" aria-live="polite">{message}</p>}
      {error && <p className="mx-auto mb-4 max-w-6xl text-center text-sm text-rose-300" role="alert">{error}</p>}

      <section className="player-zones mx-auto mb-8 max-w-6xl gap-8 rounded-2xl border border-white/25 bg-white/[0.04] p-4 sm:p-6">
        <div className="min-w-0 flex-1">
          <h2 className="mb-3 text-center text-xl font-semibold">
            Your Table ({self.table.length}/9)
          </h2>
          <div className="mx-auto grid w-fit grid-cols-3 gap-3">
            {tableSlots(self, localTableOrder).map((cardId, index) => {
              const card = cardId ? self.table.find((tableCard) => tableCard.id === cardId) : undefined;
              return card ? (
                <button
                  key={`table-slot-${index}`}
                  type="button"
                  data-table-slot={index}
                  onClick={() => handleTableSlotClick(index)}
                  onPointerDown={(event) => {
                    beginCardDrag(event, 'table', card.id);
                  }}
                  className={`touch-none cursor-grab rounded-xl active:cursor-grabbing ${draggingCardId === card.id ? 'opacity-30' : ''} ${dropSlotIndex === index ? 'ring-2 ring-teal-300' : ''}`}
                  aria-label={`Your ${card.category === 'WILD' ? 'TEAL wild' : 'Table'} card${card.isRevealed ? ', revealed' : ', concealed'}. Tap to select and tap another slot to move, or drag to move.`}
                >
                  <CardComponent
                    card={card}
                    isSelectable
                    isSelected={selection?.zone === 'table' && selection.cardId === card.id}
                    isDragging={draggingCardId === card.id}
                  />
                </button>
              ) : <button
                key={`table-slot-${index}`}
                type="button"
                data-table-slot={index}
                onClick={() => handleTableSlotClick(index)}
                className={`h-[112px] w-[80px] touch-none rounded-xl border border-dashed border-white/10 ${dropSlotIndex === index ? 'border-teal-300 ring-2 ring-teal-300' : ''}`}
                aria-label={`Empty Table slot ${index + 1}. Tap here to move the selected card.`}
              />;
            })}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="mb-3 text-center text-xl font-semibold">Your Hand ({self.hand.length})</h2>
          {actionReady && (
            <p className="mb-2 text-center text-sm text-amber-200" role="note">
              Normal and TEAL cards left in your Hand are shuffled back into the deck at turn end. Action cards stay in your Hand.
            </p>
          )}
          <div data-hand-zone className="flex min-h-32 flex-wrap justify-center gap-3 rounded-xl border border-dashed border-white/10 p-2">
            {self.hand.length === 0
              ? <p className="w-full self-center py-5 text-center text-white/60">No cards in Hand yet.</p>
              : self.hand.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  disabled={!actionReady || pendingCommand !== null}
                  onClick={() => handleCardClick('hand', card)}
                  onPointerDown={(event) => beginCardDrag(event, 'hand', card.id)}
                  className={`touch-none cursor-pointer rounded-xl disabled:cursor-default ${draggingCardId === card.id ? 'opacity-30' : ''}`}
                  aria-label={card.category === 'ACTION'
                    ? `${card.title ?? card.actionType ?? 'Action'} action card`
                    : `${card.category === 'WILD' ? 'TEAL wild' : 'Normal'} card in Hand`}
                >
                  <CardComponent
                    card={card}
                    isSelectable={actionReady}
                    isSelected={selection?.zone === 'hand' && selection.cardId === card.id}
                    isDragging={draggingCardId === card.id}
                  />
                </button>
              ))}
          </div>
        </div>
      </section>

      <section className="mx-auto mb-6 flex max-w-6xl flex-wrap justify-center gap-3" aria-label="Turn controls">
        {view.turnPhase === 'DRAW' && isMyTurn && (
          <p className="w-full text-center text-sm text-teal-100" role="status">Drawing your card…</p>
        )}
        {actionReady && (
          <>
            <button type="button" style={handSelection?.category === 'ACTION' ? buttonStyle : disabledButtonStyle}
              disabled={handSelection?.category !== 'ACTION' || pendingCommand !== null} onClick={handlePlay}>Play Selected</button>
            {handSelection && handSelection.category !== 'ACTION' && (
              <button
                type="button"
                style={self.table.length < 9 || tableSelection ? buttonStyle : disabledButtonStyle}
                disabled={pendingCommand !== null || (self.table.length >= 9 && !tableSelection)}
                onClick={() => {
                  const slots = tableSlots(self, localTableOrder);
                  const targetIndex = self.table.length >= 9
                    ? slots.findIndex((slotId) => slotId === tableSelection?.id)
                    : slots.indexOf(null);
                  if (targetIndex >= 0) {
                    moveHandCardToTable(
                      handSelection.id,
                      targetIndex,
                      self.table.length >= 9 ? tableSelection?.id : undefined
                    );
                  }
                }}
                >
                {self.table.length >= 9 ? 'Swap with Selected Table Card' : 'Move Selected to Table'}
              </button>
            )}
            {tableSelection && (
              <button type="button" style={buttonStyle}
                disabled={pendingCommand !== null}
                onClick={() => moveTableCardToHand(tableSelection.id)}>Move Selected to Hand</button>
            )}
            <button type="button" style={self.table.length <= 9 ? buttonStyle : disabledButtonStyle}
              disabled={self.table.length > 9 || pendingCommand !== null} onClick={() => runCommand('endTurn')}>
              {pendingCommand === 'endTurn' ? 'Ending Turn…' : 'End Turn'}
            </button>
            {self.table.length > 9 && <p className="w-full text-center text-yellow-200">Move cards to your Hand to discard them at turn end, then end your turn.</p>}
          </>
        )}
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2" aria-label="Opponents">
        {opponents.map((opponent) => (
          <article key={opponent.id} className="rounded-xl border border-white/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {opponent.name}{self && opponent.name.trim().toLocaleLowerCase() === self.name.trim().toLocaleLowerCase() ? ' (another player)' : ''}&apos;s Table
              </h2>
              <span className={`rounded-full border px-3 py-1 text-sm ${opponent.isOnline ? 'border-white/40' : 'border-amber-300/60 text-amber-200'}`}>
                {opponent.isOnline ? 'Online' : 'Away · turn skipped after 60s'} · Hand: {opponent.handCount}
              </span>
            </div>
            <div className="grid w-fit grid-cols-3 gap-2">
              {tableSlots(opponent).map((cardId, index) => {
                const card = cardId ? opponent.table.find((tableCard) => tableCard.id === cardId) : undefined;
                return card
                  ? <div key={`opponent-slot-${index}`} aria-label={card.isRevealed ? 'Revealed to all players' : 'Concealed card'}>
                    <CardComponent card={card} faceDown={!card.isRevealed} />
                  </div>
                  : <div key={`empty-${index}`} className="h-[112px] w-[80px] rounded-xl border border-dashed border-white/15" aria-label="Empty Table slot" />;
              })}
            </div>
          </article>
        ))}
      </section>

      {pendingActionType && (
        <ActionOverlay
          actionType={pendingActionType}
          sourcePlayer={exposedSelf}
          players={exposedPlayers}
          onConfirm={(targetPlayerId, targetCardId) => void handleConfirmTarget(targetPlayerId, targetCardId)}
          onCancel={() => setPendingActionType(null)}
        />
      )}

      {pendingAction && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4">
          {view.canAppeal && appealCard && !appealDismissed
            ? <div className="w-full max-w-md rounded-2xl border border-white bg-neutral-950 p-6 text-center shadow-2xl">
              <h2 className="mb-2 text-2xl font-bold">Play APPEAL?</h2>
              <p className="mb-2 text-white/80">{pendingAction.actionType} will resolve in {secondsLeft}s.</p>
              <p className="mb-5 text-sm text-white/60">A successful APPEAL cancels the action and discards both cards.</p>
              <div className="flex justify-center gap-3">
                <button type="button" style={buttonStyle} onClick={() => runCommand('appeal', { cardId: appealCard.id })}>Yes, APPEAL</button>
                <button type="button" style={buttonStyle} onClick={() => setAppealDismissed(true)}>No</button>
              </div>
            </div>
            : <p className="rounded-full border border-white/30 bg-neutral-950 px-5 py-3 text-white" role="status">
              Waiting on a decision… {secondsLeft}s
            </p>}
        </div>
      )}

      {view.winnerId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/90 p-6 text-center" role="alert">
          <div className="my-auto max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white bg-neutral-950 p-6 sm:p-10">
            <h2 className="mb-3 text-4xl font-bold">Game Over!</h2>
            <p className="mb-6 text-2xl">{players[view.winnerId]?.name} wins!</p>
            <h3 className="mb-3 text-xl font-semibold">Winning sets</h3>
            <div className="space-y-4">
              {(players[view.winnerId]?.sets ?? []).map((set, index) => (
                <section key={`winning-set-${index}`} className="rounded-xl border border-white/20 p-4">
                  <h4 className="mb-3 font-semibold">Set {index + 1}</h4>
                  <div className="flex flex-wrap justify-center gap-3">
                    {set.cards.map((card) => <CardComponent key={card.id} card={card} />)}
                  </div>
                </section>
              ))}
            </div>
            <button type="button" style={buttonStyle} className="mt-6" onClick={onReturnToLobby}>
              Return to Lobby
            </button>
          </div>
        </div>
      )}
      {dragPreview && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[100] -translate-x-1/2 -translate-y-1/2"
          style={{ left: dragPreview.x, top: dragPreview.y }}
        >
          <CardComponent card={dragPreview.card} isDragging />
        </div>
      )}
    </main>
  );
}

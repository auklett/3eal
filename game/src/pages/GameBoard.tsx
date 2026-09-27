import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActionType, Card, Player } from '../types';
import { completeSetCount } from '../logic/validation';
import {
  ensurePlayerId,
  sendGameCommand,
  subscribeToPlayerView,
  type PlayerGameView
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

interface GameBoardProps {
  roomCode: string;
}

export default function GameBoard({ roomCode }: GameBoardProps) {
  const [view, setView] = useState<PlayerGameView | null>(null);
  const [selection, setSelection] = useState<{ zone: Zone; cardId: string } | null>(null);
  const [pendingActionType, setPendingActionType] = useState<Exclude<ActionType, 'APPEAL'> | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [appealDismissed, setAppealDismissed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const pendingResolution = useRef('');
  const nextResolutionAttempt = useRef(0);

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
          setView(nextView);
          if (nextView?.pendingAction) setAppealDismissed(false);
          if (!nextView) setError('Your private game view is not available. Return to the lobby and ask the host to start the game.');
        },
        (subscriptionError) => {
          if (mounted) setError(subscriptionError.message);
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
  }, [roomCode]);

  const send = useCallback(async (
    action: 'draw' | 'play' | 'appeal' | 'discard' | 'endTurn' | 'resolve',
    payload: Record<string, unknown> = {}
  ) => {
    setError('');
    try {
      await sendGameCommand(roomCode, action, payload);
      setMessage(action === 'resolve' ? 'Interrupt expired. Action resolved.' : 'Move accepted.');
      return true;
    } catch (commandError) {
      setError(commandError instanceof Error ? commandError.message : 'The move could not be completed.');
      return false;
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
    const resolutionKey = `${pendingAction.actionType}:${pendingAction.sourcePlayerId}:${pendingAction.appealWindowEndsAt}`;
    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((pendingAction.appealWindowEndsAt - Date.now()) / 1000));
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

  const players = view?.players ?? {};
  const self = view ? players[view.selfId] : undefined;
  const activePlayer = view ? players[view.activePlayerId] : undefined;
  const opponents = Object.values(players).filter((player) => player.id !== view?.selfId);
  const handSelection = selection?.zone === 'hand'
    ? self?.hand.find((card) => card.id === selection.cardId)
    : undefined;
  const tableSelection = selection?.zone === 'table'
    ? self?.table.find((card) => card.id === selection.cardId)
    : undefined;
  const isMyTurn = Boolean(view && view.activePlayerId === view.selfId && !view.winnerId);
  const appealCard = view?.canAppeal ? self?.hand.find((card) => card.actionType === 'APPEAL') : undefined;

  const runCommand = (action: 'draw' | 'appeal' | 'discard' | 'endTurn', payload: Record<string, unknown> = {}) => {
    void send(action, payload);
    setSelection(null);
  };

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
    if (zone === 'hand' && !isMyTurn) return;
    if (selection?.zone === zone && selection.cardId === card.id) setSelection(null);
    else setSelection({ zone, cardId: card.id });
  };

  if (!view || !self || !activePlayer) {
    return (
      <main className="min-h-screen bg-black p-8 text-center text-white">
        <p role={error ? 'alert' : 'status'}>{error || 'Connecting to the authoritative game…'}</p>
      </main>
    );
  }

  const exposedPlayers = Object.values(players) as Player[];
  const exposedSelf = self as Player;
  const actionReady = isMyTurn && view.turnPhase === 'MAIN';

  return (
    <main className="min-h-screen bg-black px-4 pb-10 pt-3 text-white sm:px-6">
      <HamburgerMenu players={exposedPlayers} />
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
              : activePlayer.id === view.selfId
                ? `${self.name}'s turn`
                : `${activePlayer.name}'s turn`}
          </p>
          <p className="text-sm text-white/70">
            Phase: {view.turnPhase} · Active: {activePlayer.name}
          </p>
        </div>
        <div className="flex gap-4 text-sm text-white/80">
          <span>Deck: {view.deckCount}</span>
          <span>Discard: {view.discardPile.length}</span>
          <span>Your sets: {completeSetCount(self.table)}/3</span>
        </div>
      </section>
      {message && <p className="mx-auto mb-4 max-w-6xl text-center text-sm text-teal-100" role="status">{message}</p>}
      {error && <p className="mx-auto mb-4 max-w-6xl text-center text-sm text-rose-300" role="alert">{error}</p>}

      <section className="mx-auto mb-6 flex max-w-6xl flex-wrap justify-center gap-6" aria-label="Deck and discard pile">
        <div className="text-center">
          <p className="mb-2">Draw Deck</p>
          <CardComponent card={{ id: 'deck-back', category: 'NORMAL', isRevealed: false }} faceDown />
          <p className="mt-1 text-xs text-white/60">{view.deckCount} cards</p>
        </div>
        <div className="text-center">
          <p className="mb-2">Discard Pile</p>
          {view.discardPile.length > 0
            ? <CardComponent card={view.discardPile[view.discardPile.length - 1]} />
            : <div className="h-[112px] w-[80px] rounded-xl border border-dashed border-white/40" />}
          <p className="mt-1 text-xs text-white/60">{view.discardPile.length} cards</p>
        </div>
      </section>

      <section className="player-zones mx-auto mb-8 max-w-6xl gap-8 rounded-2xl border border-white/25 bg-white/[0.04] p-4 sm:p-6">
        <div className="min-w-0 flex-1">
          <h2 className="mb-3 text-center text-xl font-semibold">
            Your Table ({self.table.length}/9)
          </h2>
          <div className="mx-auto grid w-fit grid-cols-3 gap-3">
            {Array.from({ length: Math.max(9, self.table.length) }, (_, index) => {
              const card = self.table[index];
              return card ? (
                <button
                  key={card.id}
                  type="button"
                  disabled={!actionReady}
                  onClick={() => handleCardClick('table', card)}
                  className="cursor-pointer rounded-xl disabled:cursor-default"
                  aria-label={`Your ${card.category === 'WILD' ? 'TEAL wild' : 'Table'} card${card.isRevealed ? ', revealed' : ', concealed'}`}
                >
                  <CardComponent card={card} isSelectable={actionReady} isSelected={selection?.zone === 'table' && selection.cardId === card.id} />
                </button>
              ) : <div key={`empty-${index}`} className="h-[112px] w-[80px] rounded-xl border border-dashed border-white/10" />;
            })}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="mb-3 text-center text-xl font-semibold">Your Hand ({self.hand.length})</h2>
          {self.hand.length === 0
            ? <p className="py-5 text-center text-white/60">No Action cards in Hand yet.</p>
            : <div className="flex flex-wrap justify-center gap-3 p-2">
              {self.hand.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  disabled={!actionReady}
                  onClick={() => handleCardClick('hand', card)}
                  className="cursor-pointer rounded-xl disabled:cursor-default"
                  aria-label={`${card.title ?? card.actionType ?? 'Action'} action card`}
                >
                  <CardComponent card={card} isSelectable={actionReady} isSelected={selection?.zone === 'hand' && selection.cardId === card.id} />
                </button>
              ))}
            </div>}
        </div>
      </section>

      <section className="mx-auto mb-6 flex max-w-6xl flex-wrap justify-center gap-3" aria-label="Turn controls">
        {view.turnPhase === 'DRAW' && isMyTurn && (
          <button type="button" style={buttonStyle} onClick={() => runCommand('draw')}>Draw Card</button>
        )}
        {actionReady && (
          <>
            <button type="button" style={handSelection?.category === 'ACTION' ? buttonStyle : disabledButtonStyle}
              disabled={handSelection?.category !== 'ACTION'} onClick={handlePlay}>Play Selected</button>
            <button type="button" style={tableSelection ? buttonStyle : disabledButtonStyle}
              disabled={!tableSelection} onClick={() => tableSelection && runCommand('discard', { cardId: tableSelection.id })}>Discard Selected</button>
            <button type="button" style={self.table.length <= 9 ? buttonStyle : disabledButtonStyle}
              disabled={self.table.length > 9} onClick={() => runCommand('endTurn')}>End Turn</button>
            {self.table.length > 9 && <p className="w-full text-center text-yellow-200">Discard down to 9 Table cards before ending your turn.</p>}
          </>
        )}
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 md:grid-cols-2" aria-label="Opponents">
        {opponents.map((opponent) => (
          <article key={opponent.id} className="rounded-xl border border-white/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{opponent.name}'s Table</h2>
              <span className="rounded-full border border-white/40 px-3 py-1 text-sm">Hand: {opponent.handCount}</span>
            </div>
            <div className="grid w-fit grid-cols-3 gap-2">
              {Array.from({ length: Math.max(9, opponent.table.length) }, (_, index) => {
                const card = opponent.table[index];
                return card
                  ? <div key={card.id} aria-label={card.isRevealed ? 'Revealed to all players' : 'Concealed card'}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-6 text-center" role="alert">
          <div className="rounded-2xl border border-white bg-neutral-950 p-10">
            <h2 className="mb-3 text-4xl font-bold">Game Over!</h2>
            <p className="text-2xl">{players[view.winnerId]?.name} wins!</p>
          </div>
        </div>
      )}
    </main>
  );
}

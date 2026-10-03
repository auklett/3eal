import { useState } from 'react';
import type { ActionType, Player } from '../../types';
import CardComponent from '../cards/CardComponent';

interface ActionOverlayProps {
  actionType: Exclude<ActionType, 'APPEAL'>;
  sourcePlayer: Player;
  players: Player[];
  onConfirm: (targetPlayerId: string, targetCardId: string) => void;
  onCancel: () => void;
}

const buttonStyle: React.CSSProperties = {
  minHeight: 44,
  padding: '10px 20px',
  borderRadius: 12,
  color: '#FFFFFF',
  backgroundColor: '#000000',
  border: '2px solid #FFFFFF',
  cursor: 'pointer'
};

export default function ActionOverlay({ actionType, sourcePlayer, players, onConfirm, onCancel }: ActionOverlayProps) {
  const isSelfTarget = actionType === 'CONCEAL';
  const opponents = players.filter((player) => player.id !== sourcePlayer.id);
  const [selectedOpponentId, setSelectedOpponentId] = useState<string | null>(null);
  const selectedOpponent = opponents.find((player) => player.id === selectedOpponentId) ?? null;
  const targetPlayer = isSelfTarget ? sourcePlayer : selectedOpponent;

  const renderTargets = (player: Player) => (
    <div className="grid grid-cols-3 gap-3 mx-auto w-fit" role="group" aria-label={`${player.name}'s Table`}>
      {Array.from({ length: Math.max(9, player.table.length) }, (_, index) => {
        const card = player.table[index];
        if (!card) {
          return <div key={`empty-${index}`} className="h-[112px] w-[80px] rounded-xl border border-dashed border-white/15" aria-hidden="true" />;
        }
        const enabled = actionType === 'CONCEAL'
          ? card.isRevealed
          : actionType === 'STEAL'
            ? card.category !== 'ACTION'
            : !card.isRevealed;
        const visibleFace = isSelfTarget || card.isRevealed;

        return (
          <div
            key={card.id}
            aria-label={`Table slot ${index + 1}${card.isRevealed ? ', revealed' : ', concealed'}${enabled ? ', targetable' : ', unavailable'}`}
            onClick={() => enabled && onConfirm(player.id, card.id)}
            role="button"
            aria-disabled={!enabled}
            tabIndex={enabled ? 0 : -1}
            onKeyDown={(event) => {
              if (enabled && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                onConfirm(player.id, card.id);
              }
            }}
            className="rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            style={{
              minWidth: 80,
              minHeight: 112,
              opacity: enabled ? 1 : 0.3,
              outline: enabled ? '2px solid #FFFFFF' : 'none',
              outlineOffset: 3,
              boxShadow: enabled ? '0 0 12px #FACC15' : undefined,
              cursor: enabled ? 'pointer' : 'not-allowed'
            }}
          >
            <CardComponent card={card} faceDown={!visibleFace} />
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="action-overlay-title"
    >
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white p-6 text-center"
        style={{ backgroundColor: '#111111' }}>
        <h2 id="action-overlay-title" className="mb-3 text-2xl font-bold text-white">
          {actionType}: Select Target
        </h2>

        {!isSelfTarget && !selectedOpponent && (
          <>
            <p className="mb-5 text-white">Choose an opponent.</p>
            <div className="flex flex-wrap justify-center gap-3">
              {opponents.map((opponent) => (
                <button key={opponent.id} type="button" style={buttonStyle}
                  onClick={() => setSelectedOpponentId(opponent.id)}>
                  {opponent.name} · {opponent.table.length} Table cards
                </button>
              ))}
            </div>
          </>
        )}

        {targetPlayer && (
          <>
            <p className="mb-5 text-white">
              {actionType === 'CONCEAL'
                ? 'Select one of your Revealed Table cards.'
                : `Select a card from ${targetPlayer.name}'s Table${actionType === 'STEAL' ? '. Concealed cards are selected blindly.' : '. Only Concealed cards can be selected.'}`}
            </p>
            {targetPlayer.table.length === 0
              ? <p className="text-white/70">No cards are available to target.</p>
              : renderTargets(targetPlayer)}
          </>
        )}

        <div className="mt-6 flex justify-center gap-3">
          {!isSelfTarget && selectedOpponent && (
            <button type="button" style={buttonStyle} onClick={() => setSelectedOpponentId(null)}>Back</button>
          )}
          <button type="button" style={buttonStyle} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

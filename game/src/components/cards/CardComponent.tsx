import { memo } from 'react';
import type { Card } from '../../types';
import { WHITE_RING } from '../../logic/cardGlow';
import NormalCard from './NormalCard';
import ActionCard from './ActionCard';
import { cardDims, type CardSize } from './cardSize';

interface CardComponentProps {
  card: Card;
  onClick?: () => void;
  isSelectable?: boolean;
  faceDown?: boolean;
  isSelected?: boolean;
  isDragging?: boolean;
  size?: CardSize;
  /** Hide the "revealed to all players" eye, e.g. on the Game Over screen. */
  showRevealBadge?: boolean;
}

function CardComponent({
  card,
  onClick,
  isSelectable = false,
  faceDown = false,
  isSelected = false,
  isDragging = false,
  size = 'md',
  showRevealBadge = true
}: CardComponentProps) {
  const isGlowing = isSelected || isDragging;
  const dims = cardDims(size);

  if (faceDown) {
    return (
      <div
        onClick={onClick}
        className={`
          relative
          ${dims.box}
          shadow-md
          flex items-center justify-center
          overflow-hidden
          transition-all
          ${isSelectable ? 'cursor-pointer hover:scale-105' : ''}
        `}
        aria-label="Concealed card"
        style={{ backgroundColor: '#131316', borderRadius: dims.radius, border: '1px solid #3a3a40', ...(isGlowing ? { boxShadow: `0 0 0 4px ${WHITE_RING}` } : {}) }}
      >
        {/* Simple diagonal-line pattern so a face-down card reads instantly. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg, #ffffff 0 1px, transparent 1px 8px)' }}
        />
        <span aria-hidden="true" className="pointer-events-none absolute inset-1 rounded-[inherit] border border-white/10" />
        <span className={`relative font-black tracking-[0.2em] text-white/45 ${dims.backMonogram}`}>3EAL</span>
      </div>
    );
  }

  const content = card.category === 'ACTION'
    ? <ActionCard card={card} onClick={onClick} isSelectable={isSelectable} isSelected={isSelected} isDragging={isDragging} size={size} />
    : <NormalCard card={card} onClick={onClick} isSelectable={isSelectable} isSelected={isSelected} isDragging={isDragging} size={size} />;

  if (!showRevealBadge || !card.isRevealed || card.category === 'ACTION') return content;
  return (
    <div className="relative">
      {content}
      <span
        className={`absolute left-1/2 top-1 z-10 flex ${dims.badgeBox} -translate-x-1/2 items-center justify-center rounded-full bg-black/70 text-white ring-1 ring-white/50`}
        role="img"
        aria-label="Revealed to all players"
        title="Revealed to all players"
      >
        <svg viewBox="0 0 24 24" className={dims.badgeIcon} aria-hidden="true">
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="2.5" fill="currentColor" />
        </svg>
      </span>
    </div>
  );
}

export default memo(CardComponent);

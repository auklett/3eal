import type { Card } from '../../types';
import NormalCard from './NormalCard';
import ActionCard from './ActionCard';

interface CardComponentProps {
  card: Card;
  onClick?: () => void;
  isSelectable?: boolean;
  faceDown?: boolean;
  isSelected?: boolean;
  isDragging?: boolean;
}

export default function CardComponent({ card, onClick, isSelectable = false, faceDown = false, isSelected = false, isDragging = false }: CardComponentProps) {
  const isGlowing = isSelected || isDragging;

  if (faceDown) {
    return (
      <div
        onClick={onClick}
        className={`
          relative
          w-[80px] h-[112px]
          shadow-md
          flex items-center justify-center
          transition-all
          ${isSelectable ? 'cursor-pointer hover:scale-105' : ''}
        `}
        aria-label="Concealed card"
        style={{ backgroundColor: '#1a1a1a', borderRadius: '12px', border: '1px solid #777777', ...(isGlowing ? { boxShadow: '0 0 0 4px #FFFFFF' } : {}) }}
      >
        <div className="text-xl font-bold text-white opacity-20">3EAL</div>
      </div>
    );
  }

  const content = card.category === 'ACTION'
    ? <ActionCard card={card} onClick={onClick} isSelectable={isSelectable} isSelected={isSelected} isDragging={isDragging} />
    : <NormalCard card={card} onClick={onClick} isSelectable={isSelectable} isSelected={isSelected} isDragging={isDragging} />;

  if (!card.isRevealed || card.category === 'ACTION') return content;
  return (
    <div className="relative" aria-label="Revealed to all players">
      {content}
      <span
        className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-yellow-300 text-xs text-black"
        role="img"
        aria-label="Revealed to all players"
        title="Revealed to all players"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="2.5" fill="currentColor" />
        </svg>
      </span>
    </div>
  );
}

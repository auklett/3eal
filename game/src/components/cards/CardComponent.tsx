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
          ${isGlowing ? 'ring-4' : ''}
        `}
        style={{ backgroundColor: '#1a1a1a', borderRadius: '8px', ...(isGlowing ? { boxShadow: '0 0 0 4px #FFFFFF' } : {}) }}
      >
        <div className="text-xl font-bold text-white opacity-20">3EAL</div>
      </div>
    );
  }

  if (card.isActionCard) {
    return <ActionCard card={card} onClick={onClick} isSelectable={isSelectable} isSelected={isSelected} isDragging={isDragging} />;
  }

  return <NormalCard card={card} onClick={onClick} isSelectable={isSelectable} isSelected={isSelected} isDragging={isDragging} />;
}

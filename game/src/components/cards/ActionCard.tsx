import type { Card } from '../../types';

interface ActionCardProps {
  card: Card;
  onClick?: () => void;
  isSelectable?: boolean;
  isSelected?: boolean;
  isDragging?: boolean;
}

export default function ActionCard({ card, onClick, isSelectable = false, isSelected = false, isDragging = false }: ActionCardProps) {
  if (!card.isActionCard) return null;

  const isGlowing = isSelected || isDragging;
  const isTeal = card.actionType === 'TEAL';
  const backgroundColor = isTeal ? '#008080' : '#FFFFFF';
  const textColor = '#000000';
  // White glow for TEAL cards, teal glow for white cards
  const glowColor = backgroundColor === '#FFFFFF' ? '#008080' : '#FFFFFF';

  return (
    <div
      onClick={onClick}
      className={`
        relative
        w-[80px] h-[112px]
        shadow-md
        flex flex-col
        items-center
        justify-center
        px-1.5 py-2
        transition-all
        ${isSelectable ? 'cursor-pointer hover:scale-105 hover:shadow-xl' : ''}
        ${isGlowing ? 'ring-4' : ''}
      `}
      style={{ backgroundColor, borderRadius: '8px', ...(isGlowing ? { boxShadow: `0 0 0 4px ${glowColor}` } : {}) }}
    >
      <div
        className="text-sm font-bold text-center mb-0.5 leading-tight"
        style={{ color: textColor }}
      >
        {card.title}
      </div>
      <div
        className="text-[9px] text-center leading-[1.15]"
        style={{ color: textColor }}
      >
        {card.description}
      </div>
    </div>
  );
}

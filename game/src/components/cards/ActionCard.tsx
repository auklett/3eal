import type { Card } from '../../types';
import { selectionRingColor } from '../../logic/cardGlow';
import { cardDims, type CardSize } from './cardSize';

interface ActionCardProps {
  card: Card;
  onClick?: () => void;
  isSelectable?: boolean;
  isSelected?: boolean;
  isDragging?: boolean;
  size?: CardSize;
}

export default function ActionCard({
  card,
  onClick,
  isSelectable = false,
  isSelected = false,
  isDragging = false,
  size = 'md'
}: ActionCardProps) {
  if (card.category !== 'ACTION') return null;

  const dims = cardDims(size);
  const isGlowing = isSelected || isDragging;
  const backgroundColor = '#FFFFFF';
  const textColor = '#000000';
  const glowColor = selectionRingColor('ACTION');

  return (
    <div
      onClick={onClick}
      className={`relative ${dims.box} shadow-md flex flex-col items-center justify-center ${size === 'md' ? 'px-1.5 py-2' : 'px-1 py-1'} transition-all ${isSelectable ? 'cursor-pointer hover:scale-105 hover:shadow-xl' : ''}`}
      style={{ backgroundColor, borderRadius: dims.radius, border: '1px solid #D4D4D4', ...(isGlowing ? { boxShadow: `0 0 0 4px ${glowColor}` } : {}) }}
    >
      <div className={`font-bold text-center leading-tight ${dims.actionTitle}`} style={{ color: textColor }}>
        {card.title}
      </div>
      {size !== 'xs' && (
        <div className={`text-center leading-[1.15] ${dims.actionDescription}`} style={{ color: textColor }}>
          {card.description}
        </div>
      )}
    </div>
  );
}

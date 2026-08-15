import type { Card } from '../../types';

interface ActionCardProps {
  card: Card;
  onClick?: () => void;
  isSelectable?: boolean;
}

export default function ActionCard({ card, onClick, isSelectable = false }: ActionCardProps) {
  if (!card.isActionCard) return null;

  const isTeal = card.actionType === 'TEAL';
  const backgroundColor = isTeal ? '#008080' : '#FFFFFF';
  const textColor = '#000000';

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
        p-2
        transition-all
        ${isSelectable ? 'cursor-pointer hover:scale-105 hover:shadow-xl' : ''}
      `}
      style={{ backgroundColor, borderRadius: '8px' }}
    >
      <div
        className="text-sm font-bold text-center mb-1"
        style={{ color: textColor }}
      >
        {card.title}
      </div>
      <div
        className="text-[10px] text-center leading-tight"
        style={{ color: textColor }}
      >
        {card.description}
      </div>
    </div>
  );
}

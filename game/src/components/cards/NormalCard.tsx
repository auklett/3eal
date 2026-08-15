import type { Card } from '../../types';

interface NormalCardProps {
  card: Card;
  onClick?: () => void;
  isSelectable?: boolean;
}

export default function NormalCard({ card, onClick, isSelectable = false }: NormalCardProps) {
  if (card.isActionCard) return null;

  const backgroundColor = `#${card.color}`;

  const renderShape = () => {
    const numberColor = backgroundColor;

    switch (card.shape) {
      case 'circle':
        return (
          <div className="relative w-full h-full flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-4/5 h-4/5">
              <circle cx="50" cy="50" r="45" fill="#000000" />
              <text
                x="50"
                y="50"
                dominantBaseline="central"
                textAnchor="middle"
                fill={numberColor}
                fontSize="50"
                fontWeight="bold"
              >
                {card.number}
              </text>
            </svg>
          </div>
        );

      case 'triangle':
        return (
          <div className="relative w-full h-full flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-4/5 h-4/5">
              <polygon points="50,10 90,90 10,90" fill="#000000" />
              <text
                x="50"
                y="65"
                dominantBaseline="central"
                textAnchor="middle"
                fill={numberColor}
                fontSize="50"
                fontWeight="bold"
              >
                {card.number}
              </text>
            </svg>
          </div>
        );

      case 'square':
        return (
          <div className="relative w-full h-full flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-4/5 h-4/5">
              <rect x="10" y="10" width="80" height="80" fill="#000000" />
              <text
                x="50"
                y="50"
                dominantBaseline="central"
                textAnchor="middle"
                fill={numberColor}
                fontSize="50"
                fontWeight="bold"
              >
                {card.number}
              </text>
            </svg>
          </div>
        );

      case 'pentagon':
        return (
          <div className="relative w-full h-full flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-4/5 h-4/5">
              <polygon points="50,10 90,40 75,85 25,85 10,40" fill="#000000" />
              <text
                x="50"
                y="54"
                dominantBaseline="central"
                textAnchor="middle"
                fill={numberColor}
                fontSize="50"
                fontWeight="bold"
              >
                {card.number}
              </text>
            </svg>
          </div>
        );

      case 'hexagon':
        return (
          <div className="relative w-full h-full flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-4/5 h-4/5">
              <polygon points="50,5 90,30 90,70 50,95 10,70 10,30" fill="#000000" />
              <text
                x="50"
                y="50"
                dominantBaseline="central"
                textAnchor="middle"
                fill={numberColor}
                fontSize="50"
                fontWeight="bold"
              >
                {card.number}
              </text>
            </svg>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      onClick={onClick}
      className={`
        relative
        w-[80px] h-[112px]
        shadow-md
        transition-all
        ${isSelectable ? 'cursor-pointer hover:scale-105 hover:shadow-xl' : ''}
        ${card.isRevealed ? 'ring-2 ring-yellow-400' : ''}
      `}
      style={{ backgroundColor, borderRadius: '8px' }}
    >
      {renderShape()}
    </div>
  );
}

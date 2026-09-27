import type { Card } from '../../types';

interface NormalCardProps {
  card: Card;
  onClick?: () => void;
  isSelectable?: boolean;
  isSelected?: boolean;
  isDragging?: boolean;
}

export default function NormalCard({ card, onClick, isSelectable = false, isSelected = false, isDragging = false }: NormalCardProps) {
  if (card.category === 'ACTION') return null;

  const isGlowing = isSelected || isDragging;
  const backgroundColor = `#${card.color}`;
  const glowColor = '#FFFFFF';

  if (card.category === 'WILD') {
    return (
      <div
        onClick={onClick}
        aria-label="TEAL wild card"
        className={`relative flex h-[112px] w-[80px] items-center justify-center rounded-xl border-2 border-dashed border-white shadow-md transition-all ${isSelectable ? 'cursor-pointer hover:scale-105' : ''}`}
        style={{ backgroundColor, ...(isGlowing ? { boxShadow: `0 0 0 4px ${glowColor}` } : {}) }}
      >
        <span className="absolute right-1 top-0 text-xl text-white" aria-hidden="true">✦</span>
        <span className="text-4xl text-black" aria-hidden="true">✦</span>
        <span className="sr-only">TEAL wild card</span>
      </div>
    );
  }

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
                y="58"
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
                y="52"
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
        ${isGlowing ? 'ring-4' : ''}
      `}
      style={{ backgroundColor, borderRadius: '12px', ...(card.isRevealed ? { outline: '2px solid #FACC15', outlineOffset: '-2px' } : {}), ...(isGlowing ? { boxShadow: `0 0 0 4px ${glowColor}` } : {}) }}
    >
      {renderShape()}
    </div>
  );
}

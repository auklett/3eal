import type { Card } from '../../types';
import { useEffect, useState } from 'react';

interface NormalCardProps {
  card: Card;
  onClick?: () => void;
  isSelectable?: boolean;
  isSelected?: boolean;
  isDragging?: boolean;
}

export default function NormalCard({ card, onClick, isSelectable = false, isSelected = false, isDragging = false }: NormalCardProps) {
  const [colorBlindMode, setColorBlindMode] = useState(
    () => localStorage.getItem('3eal-colorblind-mode') === 'true'
  );
  useEffect(() => {
    const updateMode = () => setColorBlindMode(localStorage.getItem('3eal-colorblind-mode') === 'true');
    window.addEventListener('3eal-colorblind-change', updateMode);
    return () => window.removeEventListener('3eal-colorblind-change', updateMode);
  }, []);

  if (card.category === 'ACTION') return null;

  const isGlowing = isSelected || isDragging;
  const backgroundColor = `#${card.color}`;
  const glowColor = '#FFFFFF';
  const colorInfo: Record<string, { name: string; glyph: string; pattern: string }> = {
    C0C0FF: { name: 'Lavender', glyph: 'L', pattern: 'repeating-linear-gradient(0deg, transparent 0 7px, #0008 7px 9px)' },
    '008080': { name: 'Teal', glyph: 'T', pattern: 'radial-gradient(#0009 1px, transparent 1.5px)' },
    C06060: { name: 'Coral', glyph: 'C', pattern: 'repeating-linear-gradient(45deg, transparent 0 6px, #0008 6px 8px)' },
    '884488': { name: 'Purple', glyph: 'P', pattern: 'linear-gradient(90deg, transparent 46%, #0008 47% 53%, transparent 54%), linear-gradient(0deg, transparent 46%, #0008 47% 53%, transparent 54%)' },
    '404088': { name: 'Indigo', glyph: 'I', pattern: 'repeating-linear-gradient(135deg, transparent 0 5px, #fff8 5px 7px)' }
  };
  const color = colorInfo[card.color ?? ''] ?? { name: 'card', glyph: '?', pattern: '' };
  const colorLabel = colorBlindMode ? ` ${color.name}` : '';

  if (card.category === 'WILD') {
    return (
      <div
        onClick={onClick}
        aria-label={`TEAL wild card${colorLabel}`}
        role="img"
        className={`relative flex h-[112px] w-[80px] items-center justify-center rounded-xl shadow-md transition-all ${isSelectable ? 'cursor-pointer hover:scale-105' : ''}`}
        style={{ backgroundColor, ...(isGlowing ? { boxShadow: `0 0 0 4px ${glowColor}` } : {}) }}
      >
        {colorBlindMode && <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-xl opacity-50" style={{ backgroundImage: color.pattern, backgroundSize: card.color === '008080' ? '9px 9px' : undefined }} />}
        <span className="text-xl font-bold text-black" aria-hidden="true">TEAL</span>
        {colorBlindMode && <span aria-hidden="true" className="absolute left-1 top-1 z-10 rounded bg-white/90 px-1 text-xs font-black text-black">{color.glyph}</span>}
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
        overflow-hidden
        shadow-md
        transition-all
        ${isSelectable ? 'cursor-pointer hover:scale-105 hover:shadow-xl' : ''}
        ${isGlowing ? 'ring-4' : ''}
      `}
      style={{ backgroundColor, borderRadius: '12px', ...(card.isRevealed ? { outline: '2px solid #FACC15', outlineOffset: '-2px' } : {}), ...(isGlowing ? { boxShadow: `0 0 0 4px ${glowColor}` } : {}) }}
      aria-label={`${color.name} ${card.number} ${card.shape}${colorLabel}`}
    >
      {colorBlindMode && <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 opacity-50" style={{ backgroundImage: color.pattern, backgroundSize: card.color === '008080' ? '9px 9px' : undefined }} />}
      {renderShape()}
      {colorBlindMode && <span aria-hidden="true" className="absolute left-1 top-1 z-10 rounded bg-white/90 px-1 text-xs font-black text-black">{color.glyph}</span>}
    </div>
  );
}

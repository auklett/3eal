export type CardSize = 'md' | 'sm' | 'xs';

export interface CardDims {
  /** Width/height utility pair, 5:7 aspect. */
  box: string;
  /** Inline border-radius in px (matches the rounded utility visually). */
  radius: number;
  wildWord: string;
  glyph: string;
  actionTitle: string;
  actionDescription: string;
  backMonogram: string;
  badgeBox: string;
  badgeIcon: string;
}

/**
 * The three card sizes in the app. `md` (80×112) is the Table/Hand hero size,
 * `sm` (64×90) is used inside overlays, and `xs` (32×45) is the scaled-down
 * Table shown in the opponents rail.
 */
export function cardDims(size: CardSize): CardDims {
  if (size === 'xs') {
    return {
      box: 'w-8 h-[45px]',
      radius: 6,
      wildWord: 'text-[9px]',
      glyph: 'px-0.5 text-[7px]',
      actionTitle: 'text-[7px]',
      actionDescription: 'hidden',
      backMonogram: 'text-[8px]',
      badgeBox: 'h-3.5 w-3.5',
      badgeIcon: 'h-2.5 w-2.5'
    };
  }
  if (size === 'sm') {
    return {
      box: 'w-16 h-[90px]',
      radius: 10,
      wildWord: 'text-base',
      glyph: 'px-1 text-[10px]',
      actionTitle: 'text-xs',
      actionDescription: 'text-[8px]',
      backMonogram: 'text-base',
      badgeBox: 'h-4 w-4',
      badgeIcon: 'h-3 w-3'
    };
  }
  return {
    box: 'w-[80px] h-[112px]',
    radius: 12,
    wildWord: 'text-xl',
    glyph: 'px-1 text-xs',
    actionTitle: 'text-sm',
    actionDescription: 'text-[9px]',
    backMonogram: 'text-xl',
    badgeBox: 'h-5 w-5',
    badgeIcon: 'h-3.5 w-3.5'
  };
}

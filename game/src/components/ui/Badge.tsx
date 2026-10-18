import type { ReactNode } from 'react';
import { cx } from './cx';

type Tone = 'neutral' | 'accent' | 'warn';

interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}

const tones: Record<Tone, string> = {
  neutral: 'border border-white/15 bg-white/[0.06] text-white/70',
  accent: 'bg-white text-black',
  warn: 'border border-amber-300/40 bg-amber-300/10 text-amber-100'
};

/** A tiny status label such as Host / You / Away. */
export default function Badge({ children, tone = 'neutral', className }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-tight',
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

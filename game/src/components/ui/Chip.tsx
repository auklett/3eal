import type { ReactNode } from 'react';
import { cx } from './cx';

interface ChipProps {
  children: ReactNode;
  className?: string;
  title?: string;
}

/** A small monospace pill for room codes, timers, and deck/table counts. */
export default function Chip({ children, className, title }: ChipProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border border-line bg-white/[0.04] px-2.5 py-0.5',
        'font-mono text-xs tabular-nums text-white/80',
        className
      )}
      title={title}
    >
      {children}
    </span>
  );
}

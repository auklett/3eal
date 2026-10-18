import { forwardRef, type ReactNode } from 'react';
import { cx } from './cx';

type Padding = 'none' | 'compact' | 'normal' | 'roomy';

interface PanelProps {
  children: ReactNode;
  className?: string;
  padding?: Padding;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  role?: string;
}

const paddings: Record<Padding, string> = {
  none: '',
  compact: 'p-3',
  normal: 'p-4 sm:p-5',
  roomy: 'p-6 sm:p-8'
};

/**
 * The shared surface: 1px white/10 line on a faint white/[0.03] fill with the
 * rounded-2xl panel radius. Every screen builds on this.
 */
const Panel = forwardRef<HTMLElement, PanelProps>(function Panel(
  { children, className, padding = 'normal', ...rest },
  ref
) {
  return (
    <section ref={ref} className={cx('rounded-[var(--radius-panel)] border border-line bg-panel', paddings[padding], className)} {...rest}>
      {children}
    </section>
  );
});

export default Panel;

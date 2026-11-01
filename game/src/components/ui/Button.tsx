import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'endTurn';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  fullWidth?: boolean;
}

const base =
  'inline-flex select-none items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium transition duration-150 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ' +
  'disabled:cursor-not-allowed';

const variants: Record<Variant, string> = {
  // The single white fill is the app accent; never a card colour.
  primary: 'bg-white font-semibold text-black hover:bg-white/90 active:bg-white/80 disabled:opacity-40',
  secondary: 'border border-white/25 bg-white/[0.03] font-semibold text-white hover:border-white/50 hover:bg-white/[0.08] disabled:opacity-40',
  ghost: 'font-semibold text-white/70 hover:bg-white/[0.06] hover:text-white disabled:opacity-40',
  danger: 'border border-rose-400/40 bg-rose-400/[0.06] font-semibold text-rose-100 hover:border-rose-300/70 hover:bg-rose-400/[0.12] disabled:opacity-40',
  // The one deliberate card-colour exception in the UI (see docs/ui-ux.md):
  // rose fill with black text for End turn only. Disabled stays the shared grey.
  endTurn:
    'rounded-[0.75rem] bg-[#C06060] font-medium text-black hover:bg-[#CD7373] active:bg-[#B85454] ' +
    'disabled:border-transparent disabled:bg-white/[0.12] disabled:text-white/40 disabled:opacity-100'
};

// Every size keeps a >= 44px touch target.
const sizes: Record<Size, string> = {
  sm: 'min-h-11 px-3 text-sm',
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-12 px-5 text-base'
};

export default function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  fullWidth = false,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        base,
        variants[variant],
        variant === 'endTurn' ? 'min-h-11 px-4 text-[15px]' : sizes[size],
        fullWidth && 'w-full',
        className
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

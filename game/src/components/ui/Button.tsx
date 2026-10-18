import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  fullWidth?: boolean;
}

const base =
  'inline-flex select-none items-center justify-center gap-2 rounded-[var(--radius-control)] font-semibold transition duration-150 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ' +
  'disabled:cursor-not-allowed disabled:opacity-40';

const variants: Record<Variant, string> = {
  // The single white fill is the app accent; never a card colour.
  primary: 'bg-white text-black hover:bg-white/90 active:bg-white/80',
  secondary: 'border border-white/25 bg-white/[0.03] text-white hover:border-white/50 hover:bg-white/[0.08]',
  ghost: 'text-white/70 hover:bg-white/[0.06] hover:text-white',
  danger: 'border border-rose-400/40 bg-rose-400/[0.06] text-rose-100 hover:border-rose-300/70 hover:bg-rose-400/[0.12]'
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
      className={cx(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

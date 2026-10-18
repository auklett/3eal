import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: icon-only buttons need an accessible name. */
  label: string;
}

/** A 44px square, bordered icon button for the top bar and overlays. */
export default function IconButton({ label, className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.04]',
        'text-white/70 transition hover:border-white/50 hover:bg-white/[0.1] hover:text-white',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
        'disabled:cursor-not-allowed disabled:opacity-40',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

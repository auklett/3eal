import { cx } from './cx';

interface ConnectionDotProps {
  connected: boolean;
  className?: string;
}

/** A small connection indicator: green connected, amber reconnecting. */
export default function ConnectionDot({ connected, className }: ConnectionDotProps) {
  return (
    <span
      className={cx('relative inline-flex h-2.5 w-2.5 shrink-0', className)}
      role="img"
      aria-label={connected ? 'Connected' : 'Reconnecting'}
      title={connected ? 'Connected' : 'Reconnecting'}
    >
      <span
        className={cx(
          'inline-flex h-2.5 w-2.5 rounded-full',
          connected ? 'bg-emerald-400' : 'bg-amber-400'
        )}
      />
      {!connected && <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/60" aria-hidden="true" />}
    </span>
  );
}

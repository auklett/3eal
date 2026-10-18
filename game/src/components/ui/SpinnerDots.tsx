import { cx } from './cx';

/** Three gently pulsing dots used for "waiting…" states. */
export default function SpinnerDots({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1', className)} aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-1.5 w-1.5 rounded-full bg-current animate-pulse-soft"
          style={{ animationDelay: `${index * 200}ms` }}
        />
      ))}
    </span>
  );
}

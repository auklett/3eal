import { Children, type ReactNode } from 'react';

/**
 * One fixed, board-overlaying column for every transient notice that needs the
 * host's or a player's attention. It sits under the sticky top bar, above the
 * board, and below modal dialogs. The wrapper ignores pointer events so the
 * board stays usable; each notice re-enables them for itself.
 */
export default function NoticeStack({ children }: { children: ReactNode }) {
  const notices = Children.toArray(children);
  if (notices.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30 top-[calc(3.75rem+env(safe-area-inset-top))]"
      data-testid="notice-stack"
    >
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-2 px-3 sm:px-4">
        {notices.map((notice, index) => (
          <div key={index} className="pointer-events-auto motion-safe:animate-fade-in">
            {notice}
          </div>
        ))}
      </div>
    </div>
  );
}

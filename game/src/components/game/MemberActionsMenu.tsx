import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cx } from '../ui/cx';
import { CrownIcon, DotsIcon, UserXIcon } from '../icons/IconSprite';

interface MemberActionsMenuProps {
  name: string;
  onMakeHost: () => void;
  onKick: () => void;
  className?: string;
}

type ConfirmAction = 'host' | 'kick';

/**
 * A 44px row action menu shared by the Players overlay, the lobby member rows,
 * and the per-opponent modal. Every action uses an in-menu two-step confirm so
 * a host cannot kick or demote somebody with one stray tap.
 */
export default function MemberActionsMenu({ name, onMakeHost, onKick, className }: MemberActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const close = () => {
    setOpen(false);
    setConfirm(null);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });
  }, [open, confirm]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next = 0;
    if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % items.length;
    else if (event.key === 'ArrowUp') next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
    else if (event.key === 'End') next = items.length - 1;
    items[next]?.focus();
  };

  const choose = (action: ConfirmAction) => {
    setConfirm(action);
  };

  const commit = () => {
    const action = confirm;
    close();
    if (action === 'host') onMakeHost();
    else if (action === 'kick') onKick();
  };

  return (
    <div className={cx('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${name}`}
        title={`Actions for ${name}`}
        onClick={() => { if (open) close(); else setOpen(true); }}
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] text-white/70 transition hover:border-white/50 hover:bg-white/[0.1] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <DotsIcon />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${name}`}
          onKeyDownCapture={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            close();
          }}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-30 mt-2 w-[150px] rounded-xl border border-white/20 bg-[#141414] p-1 shadow-2xl shadow-black/60"
        >
          {confirm === null ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => choose('host')}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-white transition hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
              >
                <CrownIcon />
                Make host
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => choose('kick')}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-[#C06060] transition hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
              >
                <UserXIcon />
                Kick
              </button>
            </>
          ) : (
            <div className="p-1">
              <p className="px-2 pb-2 pt-1 text-sm text-white/80">
                {confirm === 'host' ? `Make ${name} host?` : `Kick ${name}?`}
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={commit}
                  className="min-h-11 flex-1 rounded-lg bg-white px-2 text-sm font-semibold text-black transition hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setConfirm(null)}
                  className="min-h-11 flex-1 rounded-lg border border-white/35 px-2 text-sm text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

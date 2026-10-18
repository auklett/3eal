import { useEffect, useRef, useState } from 'react';

export interface PresenceEntry<T> {
  item: T;
  leaving: boolean;
}

/**
 * Keeps removed list items mounted for a short beat so they can fade out, then
 * drops them. Items are keyed by their `id`. Purely presentational.
 */
export function usePresenceList<T extends { id: string }>(items: readonly T[], duration = 220): PresenceEntry<T>[] {
  const [rendered, setRendered] = useState<PresenceEntry<T>[]>(
    () => items.map((item) => ({ item, leaving: false }))
  );
  const timers = useRef<number[]>([]);

  useEffect(() => {
    setRendered((previous) => {
      const presentIds = new Set(items.map((item) => item.id));
      const next: PresenceEntry<T>[] = items.map((item) => ({ item, leaving: false }));

      for (const entry of previous) {
        if (presentIds.has(entry.item.id)) continue;
        if (entry.leaving) {
          next.push(entry);
          continue;
        }
        next.push({ item: entry.item, leaving: true });
        const timer = window.setTimeout(() => {
          setRendered((current) => current.filter((candidate) => candidate.item.id !== entry.item.id));
        }, duration);
        timers.current.push(timer);
      }
      return next;
    });
  }, [items, duration]);

  useEffect(() => () => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  }, []);

  return rendered;
}

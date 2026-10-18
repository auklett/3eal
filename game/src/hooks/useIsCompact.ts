import { useEffect, useState } from 'react';

/**
 * Tracks a CSS media query from JS. Used for the few places where a layout
 * decision cannot be expressed with classes alone (e.g. picking a card size
 * that is a fixed pixel value).
 */
export function useIsCompact(query = '(max-width: 767px)'): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);

  return matches;
}

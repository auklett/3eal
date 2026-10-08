export function hashSeed(seed: number | string): number {
  if (typeof seed === 'number') return seed >>> 0;
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index++) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16_777_619);
  }
  return hash >>> 0;
}

export function nextRandom(state: number): { value: number; state: number } {
  const nextState = (state + 0x6d2b79f5) >>> 0;
  let value = nextState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return {
    value: ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296,
    state: nextState
  };
}

export function shuffleSeeded<T>(items: readonly T[], seed: number): { items: T[]; seed: number } {
  const shuffled = [...items];
  let state = seed >>> 0;
  for (let index = shuffled.length - 1; index > 0; index--) {
    const next = nextRandom(state);
    state = next.state;
    const target = Math.floor(next.value * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return { items: shuffled, seed: state };
}

import { describe, expect, it } from 'vitest';
import { selectionRingColor, selectionRingShadow, TEAL_RING, WHITE_RING } from './cardGlow';

describe('selection ring color', () => {
  it('uses teal for white Action cards', () => {
    expect(selectionRingColor('ACTION')).toBe(TEAL_RING);
  });

  it('uses teal for the light Periwinkle card so the ring stays visible', () => {
    expect(selectionRingColor('NORMAL', 'C0C0FF')).toBe(TEAL_RING);
  });

  it('uses white for Rose, Grape Soda, French Blue, and the TEAL wild', () => {
    expect(selectionRingColor('NORMAL', 'C06060')).toBe(WHITE_RING);
    expect(selectionRingColor('NORMAL', '884488')).toBe(WHITE_RING);
    expect(selectionRingColor('NORMAL', '404088')).toBe(WHITE_RING);
    expect(selectionRingColor('WILD', '008080')).toBe(WHITE_RING);
    expect(selectionRingColor('NORMAL', '008080')).toBe(WHITE_RING);
  });

  it('draws exactly one 4px ring, with no second outline layer', () => {
    for (const shadow of [
      selectionRingShadow('ACTION'),
      selectionRingShadow('NORMAL', 'C0C0FF'),
      selectionRingShadow('NORMAL', 'C06060'),
      selectionRingShadow('WILD', '008080')
    ]) {
      expect(shadow.match(/0 0 0 4px/g)).toHaveLength(1);
      // A single box-shadow layer only: no comma-separated second shadow.
      expect(shadow).not.toContain(',');
    }
  });
});

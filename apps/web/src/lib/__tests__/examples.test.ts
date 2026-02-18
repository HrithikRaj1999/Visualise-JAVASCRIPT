import { describe, expect, it } from 'vitest';
import { examples } from '@jsv/protocol';

describe('required examples', () => {
  it('ships all five required examples', () => {
    expect(Object.keys(examples).sort()).toEqual([
      'closeHandlers',
      'immediateVsTimeout',
      'ioVsImmediate',
      'nextTickPriority',
      'timersVsMicrotasks',
    ]);
  });

  it('includes what youll learn text', () => {
    for (const value of Object.values(examples)) {
      expect(value.learn.length).toBeGreaterThan(10);
    }
  });
});

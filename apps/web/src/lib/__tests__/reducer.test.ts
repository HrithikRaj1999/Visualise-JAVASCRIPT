import { describe, expect, it } from 'vitest';
import { examples } from '@jsv/protocol';
import { createReplayState, jumpTo, phaseJumpIndex, stepForward } from '../replay';

describe('web replay reducer integration', () => {
  it('steps through events and updates pointer', () => {
    const replay = createReplayState(examples.timersVsMicrotasks.events);
    const next = stepForward(replay);
    expect(next.pointer).toBe(1);
  });

  it('supports phase jump', () => {
    const replay = createReplayState(examples.ioVsImmediate.events);
    const index = phaseJumpIndex(replay.events, 'check');
    const jumped = jumpTo(replay, index);
    expect(jumped.state.phase === 'check' || jumped.state.phase === null).toBe(true);
  });
});

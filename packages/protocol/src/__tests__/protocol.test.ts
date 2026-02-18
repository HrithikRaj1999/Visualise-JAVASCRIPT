import { describe, expect, it } from 'vitest';
import { examples, parseEvents, reduceEvents } from '../index';

describe('protocol', () => {
  it('parses example traces', () => {
    for (const value of Object.values(examples)) {
      const parsed = parseEvents(value.events);
      expect(parsed.length).toBeGreaterThan(0);
    }
  });

  it('keeps all six queues', () => {
    const state = reduceEvents(examples.timersVsMicrotasks.events);
    expect(state.queues.timers).toBeDefined();
    expect(state.queues.io).toBeDefined();
    expect(state.queues.check).toBeDefined();
    expect(state.queues.close).toBeDefined();
    expect(state.queues.nextTick).toBeDefined();
    expect(state.queues.promise).toBeDefined();
  });

  it('keeps nextTick before promise in reference example', () => {
    const dequeues = examples.nextTickPriority.events.filter((event) => event.type === 'DEQUEUE_MICROTASK');
    expect(dequeues[0]).toMatchObject({ queue: 'nextTick' });
    expect(dequeues[1]).toMatchObject({ queue: 'promise' });
  });
});

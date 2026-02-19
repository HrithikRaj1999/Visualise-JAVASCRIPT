import { describe, expect, it } from 'vitest';
import { examples } from '@jsv/protocol';
import { explainEvents, explainEvent } from '../index';

describe('explain package', () => {
  it('creates toasts for phase transitions', () => {
    const phaseEvent = examples.timersVsMicrotasks.events.find(
      (event) => event.type === 'PHASE_ENTER' && event.phase === 'timers',
    );
    const toast = phaseEvent ? explainEvent(phaseEvent) : null;
    expect(toast?.title).toContain('TIMERS');
  });

  it('groups repeated bursts', () => {
    const events = [
      { type: 'DRAIN_MICROTASKS_START', ts: 1 },
      { type: 'DRAIN_MICROTASKS_START', ts: 20 },
    ] as any;

    const toasts = explainEvents(events);
    expect(toasts.length).toBe(1);
  });

  it('can hide promise category', () => {
    const toasts = explainEvents(examples.nextTickPriority.events, {
      verbosity: 'normal',
      enabledCategories: {
        phase: true,
        timers: true,
        pending: true,
        poll: true,
        check: true,
        close: true,
        nextTick: true,
        promise: false,
        handles: true,
        requests: true,
        console: true,
        errors: true,
        diagnostics: true,
        stack: true,
      },
    });

    expect(toasts.some((toast) => toast.category === 'promise')).toBe(false);
  });
});

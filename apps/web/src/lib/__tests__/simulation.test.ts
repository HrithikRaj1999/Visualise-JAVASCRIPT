import { describe, expect, it } from "vitest";
import { applyEvent, createInitialState, type VisualizerState } from "@jsv/protocol";
import { tick } from "../simulation";

function replay(state: VisualizerState, events: any[]): VisualizerState {
  return events.reduce((acc, event) => applyEvent(acc, event), state);
}

describe("tick simulation", () => {
  it("stops when already idle", () => {
    const state = createInitialState();
    expect(tick(state)).toEqual([]);
  });

  it("drains nextTick before promise queue", () => {
    let state = createInitialState();
    state = applyEvent(state, {
      type: "ENQUEUE_MICROTASK",
      ts: 1,
      queue: "promise",
      id: "p1",
      label: "promise",
    });
    state = applyEvent(state, {
      type: "ENQUEUE_MICROTASK",
      ts: 2,
      queue: "nextTick",
      id: "n1",
      label: "nextTick",
    });

    const events = tick(state);
    const dequeue = events.find((event) => event.type === "DEQUEUE_MICROTASK");
    expect(dequeue).toMatchObject({ queue: "nextTick", id: "n1" });
  });

  it("emits callback end and microtask checkpoint", () => {
    let state = createInitialState();
    state = replay(state, [
      { type: "PHASE_ENTER", ts: 1, phase: "timers" },
      {
        type: "ENQUEUE_TASK",
        ts: 2,
        queue: "timers",
        taskId: "t1",
        label: "setTimeout callback",
      },
      { type: "DEQUEUE_TASK", ts: 3, queue: "timers", taskId: "t1" },
      { type: "CALLBACK_START", ts: 4, taskId: "t1", label: "setTimeout callback" },
    ]);

    expect(tick(state)).toEqual([
      { type: "CALLBACK_END", ts: expect.any(Number), taskId: "t1" },
      {
        type: "MICROTASK_CHECKPOINT",
        ts: expect.any(Number),
        scope: "after_callback",
        detail: "Completed setTimeout callback",
      },
    ]);
  });

  it("emits IDLE focus once, then stops", () => {
    let state = createInitialState();
    state = applyEvent(state, {
      type: "FOCUS_SET",
      ts: 1,
      focus: { activeBox: "STACK", reason: "busy" },
    });

    const first = tick(state);
    expect(first).toEqual([
      {
        type: "FOCUS_SET",
        ts: expect.any(Number),
        focus: { activeBox: "IDLE", reason: "Event Loop Idle" },
      },
    ]);

    state = applyEvent(state, first[0]);
    expect(tick(state)).toEqual([]);
  });
});

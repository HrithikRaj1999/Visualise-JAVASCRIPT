import { describe, expect, it } from "vitest";
import {
  applyEvent,
  createInitialState,
  microtaskOrder,
  queuesForPhase,
  reduceEvents,
  type VisualizerEvent,
} from "../index";

function replay(events: VisualizerEvent[]) {
  return reduceEvents(events, createInitialState());
}

describe("protocol reducer extended coverage", () => {
  it("maps io queue to poll and keeps alias synced", () => {
    const events: VisualizerEvent[] = [
      {
        type: "ENQUEUE_TASK",
        ts: 1,
        queue: "io",
        taskId: "io:1",
        label: "io callback",
      },
      { type: "DEQUEUE_TASK", ts: 2, queue: "poll", taskId: "io:1" },
    ];

    const state = replay(events);
    expect(state.queues.poll).toHaveLength(0);
    expect(state.queues.io).toHaveLength(0);
    expect(state.activeTaskId).toBe("io:1");
  });

  it("falls back to pop when CALLBACK_END id is unknown", () => {
    let state = createInitialState();
    state = applyEvent(state, {
      type: "CALLBACK_START",
      ts: 1,
      taskId: "a",
      label: "first",
    });
    state = applyEvent(state, {
      type: "CALLBACK_START",
      ts: 2,
      taskId: "b",
      label: "second",
    });
    state = applyEvent(state, { type: "CALLBACK_END", ts: 3, taskId: "missing" });

    expect(state.callStack.map((frame) => frame.id)).toEqual(["a"]);
  });

  it("EXIT_FUNCTION removes named frame even when not on top", () => {
    let state = createInitialState();
    state = applyEvent(state, {
      type: "ENTER_FUNCTION",
      ts: 1,
      name: "outer",
    });
    state = applyEvent(state, {
      type: "CALLBACK_START",
      ts: 2,
      taskId: "cb",
      label: "callback",
    });
    state = applyEvent(state, { type: "EXIT_FUNCTION", ts: 3, name: "outer" });

    expect(state.callStack.map((frame) => frame.label)).toEqual(["callback"]);
  });

  it("resets phase/poll wait/active task on SCRIPT_END", () => {
    let state = createInitialState();
    state = applyEvent(state, { type: "PHASE_ENTER", ts: 1, phase: "poll" });
    state = applyEvent(state, {
      type: "POLL_WAIT_START",
      ts: 2,
      reason: "waiting",
    });
    state = applyEvent(state, {
      type: "DEQUEUE_TASK",
      ts: 3,
      queue: "poll",
      taskId: "p:1",
    });
    state = applyEvent(state, { type: "SCRIPT_END", ts: 4 });

    expect(state.phase).toBeNull();
    expect(state.pollWait.active).toBe(false);
    expect(state.activeTaskId).toBeNull();
    expect(state.microtaskCheckpoint?.scope).toBe("script_end");
  });

  it("deduplicates handle and request tracking by id", () => {
    let state = createInitialState();
    state = applyEvent(state, {
      type: "HANDLE_OPEN",
      ts: 1,
      id: "h1",
      kind: "timer",
      label: "timer",
    });
    state = applyEvent(state, {
      type: "HANDLE_OPEN",
      ts: 2,
      id: "h1",
      kind: "timer",
      label: "timer",
    });
    state = applyEvent(state, {
      type: "REQUEST_START",
      ts: 3,
      id: "r1",
      kind: "fs",
      label: "readFile",
    });
    state = applyEvent(state, {
      type: "REQUEST_START",
      ts: 4,
      id: "r1",
      kind: "fs",
      label: "readFile",
    });

    expect(state.activeHandles).toHaveLength(1);
    expect(state.activeRequests).toHaveLength(1);
  });

  it("replaces diagnostics on TS_DIAGNOSTIC", () => {
    let state = createInitialState();
    state = applyEvent(state, {
      type: "TS_DIAGNOSTIC",
      ts: 1,
      diagnostics: [{ message: "first", line: 1, col: 1 }],
    });
    state = applyEvent(state, {
      type: "TS_DIAGNOSTIC",
      ts: 2,
      diagnostics: [{ message: "second", line: 2, col: 2 }],
    });

    expect(state.diagnostics).toEqual([{ message: "second", line: 2, col: 2 }]);
  });

  it("merges focus updates instead of replacing entire focus object", () => {
    let state = createInitialState();
    state = applyEvent(state, {
      type: "FOCUS_SET",
      ts: 1,
      focus: { activeBox: "STACK", reason: "busy" },
    });
    state = applyEvent(state, {
      type: "FOCUS_SET",
      ts: 2,
      focus: { activeTokenId: "token-1" },
    });

    expect(state.focus.activeBox).toBe("STACK");
    expect(state.focus.reason).toBe("busy");
    expect(state.focus.activeTokenId).toBe("token-1");
  });

  it("moves timer from timer heap to timers queue on readiness", () => {
    const state = replay([
      {
        type: "TIMER_HEAP_SCHEDULE",
        ts: 1,
        timerId: "tm:1",
        label: "setTimeout callback",
      },
      {
        type: "TIMER_HEAP_READY",
        ts: 2,
        timerId: "tm:1",
        taskId: "timers:1",
        label: "setTimeout callback",
      },
    ]);

    expect(state.timerHeap).toHaveLength(0);
    expect(state.queues.timers).toHaveLength(1);
    expect(state.queues.timers[0].id).toBe("timers:1");
  });

  it("stores logs and runtime errors with payload details", () => {
    const state = replay([
      {
        type: "CONSOLE",
        ts: 1,
        level: "warn",
        args: ["warned"],
      },
      {
        type: "RUNTIME_ERROR",
        ts: 2,
        message: "boom",
        stack: "trace",
      },
    ]);

    expect(state.logs).toHaveLength(1);
    expect(state.logs[0]).toMatchObject({ level: "warn", args: ["warned"] });
    expect(state.errors).toEqual([{ message: "boom", stack: "trace", ts: 2 }]);
  });

  it("sets code focus when WEBAPI_SCHEDULE includes source", () => {
    const state = replay([
      {
        type: "WEBAPI_SCHEDULE",
        ts: 1,
        job: "setTimeout",
        kind: "timer",
        source: { line: 3, col: 2 },
      },
    ]);

    expect(state.focus.activeBox).toBe("CODE");
    expect(state.focus.activeRange).toEqual({ line: 3, col: 2 });
    expect(state.focus.reason).toBe("Scheduling API");
  });

  it("returns canonical queue + microtask order helpers", () => {
    expect(queuesForPhase("poll")).toBe("poll");
    expect(queuesForPhase("timers")).toBe("timers");
    expect(microtaskOrder()).toEqual(["nextTick", "promise"]);
  });
});

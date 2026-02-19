import { VisualizerEvent, TaskQueue } from "@jsv/protocol";
import { ReplayState } from "./replay";

export function tick(state: ReplayState["state"]): VisualizerEvent[] {
  // 1. If Call Stack is not empty, finish the current callback first.
  if (state.callStack.length > 0) {
    const frame = state.callStack[state.callStack.length - 1];
    const events: VisualizerEvent[] = [
      {
        type: "CALLBACK_END",
        ts: Date.now(),
        taskId: frame.id,
      },
    ];

    // Macrotask callback finished: close active phase.
    if (state.activeTaskId === frame.id && state.phase) {
      events.push({
        type: "PHASE_EXIT",
        ts: Date.now() + 1,
        phase: state.phase,
      });
    }

    // Microtask drain completed.
    if (
      state.activeTaskId === null &&
      state.drainingMicrotasks &&
      state.queues.nextTick.length === 0 &&
      state.queues.promise.length === 0
    ) {
      events.push({
        type: "DRAIN_MICROTASKS_END",
        ts: Date.now() + 1,
      });
    }

    return events;
  }

  // 2. Microtasks: nextTick before Promise.

  if (state.queues.nextTick.length > 0) {
    const task = state.queues.nextTick[0];
    const events: VisualizerEvent[] = [];
    if (!state.drainingMicrotasks) {
      events.push({
        type: "DRAIN_MICROTASKS_START",
        ts: Date.now(),
      });
    }
    events.push(
      {
        type: "DEQUEUE_MICROTASK",
        ts: Date.now() + events.length,
        queue: "nextTick",
        id: task.id,
      },
      {
        type: "CALLBACK_START",
        ts: Date.now() + events.length + 1,
        taskId: task.id,
        label: task.label,
        source: task.source,
      },
    );
    return events;
  }

  if (state.queues.promise.length > 0) {
    const task = state.queues.promise[0];
    const events: VisualizerEvent[] = [];
    if (!state.drainingMicrotasks) {
      events.push({
        type: "DRAIN_MICROTASKS_START",
        ts: Date.now(),
      });
    }
    events.push(
      {
        type: "DEQUEUE_MICROTASK",
        ts: Date.now() + events.length,
        queue: "promise",
        id: task.id,
      },
      {
        type: "CALLBACK_START",
        ts: Date.now() + events.length + 1,
        taskId: task.id,
        label: task.label,
        source: task.source,
      },
    );
    return events;
  }

  // 3. Macrotask queues.
  const macroQueues: TaskQueue[] = ["timers", "io", "check", "close"];
  for (const q of macroQueues) {
    if (state.queues[q as keyof typeof state.queues].length > 0) {
      const task = state.queues[q as keyof typeof state.queues][0];
      const events: VisualizerEvent[] = [];
      if (state.phase !== q) {
        events.push({
          type: "PHASE_ENTER",
          ts: Date.now(),
          phase: q,
        });
      }
      events.push(
        {
          type: "DEQUEUE_TASK",
          ts: Date.now() + events.length,
          queue: q,
          taskId: task.id,
        },
        {
          type: "CALLBACK_START",
          ts: Date.now() + events.length + 1,
          taskId: task.id,
          label: task.label,
          source: task.source,
        },
      );
      return events;
    }
  }

  // 4. Idle terminal state.
  if (state.drainingMicrotasks) {
    return [
      {
        type: "DRAIN_MICROTASKS_END",
        ts: Date.now(),
      },
    ];
  }
  if (state.phase !== null) {
    return [
      {
        type: "PHASE_EXIT",
        ts: Date.now(),
        phase: state.phase,
      },
    ];
  }
  if (state.focus.activeBox !== "IDLE") {
    return [
      {
        type: "FOCUS_SET",
        ts: Date.now(),
        focus: { activeBox: "IDLE", reason: "Event Loop Idle" },
      },
    ];
  }
  return [];
}

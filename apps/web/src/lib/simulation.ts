import { VisualizerEvent, TaskQueue, MicrotaskQueue } from "@jsv/protocol";
import { ReplayState } from "./replay";

// Helper to generate IDs
const generateId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export function tick(state: ReplayState["state"]): VisualizerEvent[] {
  // 1. If Call Stack is not empty, pop the top frame (simulate completion)
  if (state.callStack.length > 0) {
    const frame = state.callStack[state.callStack.length - 1];
    return [
      {
        type: "CALLBACK_END",
        ts: Date.now(),
        taskId: frame.id,
      },
    ];
  }

  // 1.5. If activeTaskId is set (dequeued macrotask waiting to start)
  if (state.activeTaskId) {
    // See previous comments about label persistence.
  }

  // 2. Microtasks
  // Check queues: nextTick, promise

  if (state.queues.nextTick.length > 0) {
    const task = state.queues.nextTick[0];
    return [
      {
        type: "DEQUEUE_MICROTASK",
        ts: Date.now(),
        queue: "nextTick",
        id: task.id,
      },
      {
        type: "CALLBACK_START",
        ts: Date.now() + 1,
        taskId: task.id,
        label: task.label,
      },
      {
        type: "FOCUS_SET",
        ts: Date.now() + 2,
        focus: {
          activeBox: "STACK",
          activeTokenId: task.id,
          reason: "Processing nextTick",
        },
      },
    ];
  }

  if (state.queues.promise.length > 0) {
    const task = state.queues.promise[0];
    return [
      {
        type: "DEQUEUE_MICROTASK",
        ts: Date.now(),
        queue: "promise",
        id: task.id,
      },
      {
        type: "CALLBACK_START",
        ts: Date.now() + 1,
        taskId: task.id,
        label: task.label,
      },
      {
        type: "FOCUS_SET",
        ts: Date.now() + 2,
        focus: {
          activeBox: "STACK",
          activeTokenId: task.id,
          reason: "Processing Promise",
        },
      },
    ];
  }

  // 3. Macrotask (Task Queue)
  const macroQueues: TaskQueue[] = ["timers", "io", "check", "close"];
  for (const q of macroQueues) {
    // Fix type error: cast q to keyof queues
    if (state.queues[q as keyof typeof state.queues].length > 0) {
      const task = state.queues[q as keyof typeof state.queues][0];
      return [
        {
          type: "DEQUEUE_TASK",
          ts: Date.now(),
          queue: q,
          taskId: task.id,
        },
        {
          type: "CALLBACK_START",
          ts: Date.now() + 1,
          taskId: task.id,
          label: task.label,
        },
        {
          type: "FOCUS_SET",
          ts: Date.now() + 2,
          focus: {
            activeBox: "STACK",
            activeTokenId: task.id,
            reason: `Processing ${q} task`,
          },
        },
      ];
    }
  }

  // 4. Idle
  return [
    {
      type: "FOCUS_SET",
      ts: Date.now(),
      focus: { activeBox: "IDLE", reason: "Event Loop Idle" },
    },
  ];
}

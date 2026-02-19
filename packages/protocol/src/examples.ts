import type { VisualizerEvent } from "./events";

const at = (
  type: VisualizerEvent["type"],
  ts: number,
  extra: Record<string, unknown> = {},
): VisualizerEvent => {
  return { type, ts, ...extra } as VisualizerEvent;
};

export const examples: Record<
  string,
  { title: string; learn: string; code: string; events: VisualizerEvent[] }
> = {
  timersVsMicrotasks: {
    title: "Timers vs microtasks ordering",
    learn: "Promise microtasks run before timers phase callbacks.",
    code: `setTimeout(() => console.log('timeout'), 0);\nPromise.resolve().then(() => console.log('promise'));`,
    events: [
      at("SCRIPT_START", 1),
      at("WEBAPI_SCHEDULE", 2, {
        job: "timeout",
        kind: "timer",
        handleId: "h:timeout:1",
        source: { line: 1, col: 1 },
      }),
      at("HANDLE_OPEN", 3, {
        id: "h:timeout:1",
        kind: "timer",
        label: "setTimeout(0)",
        source: { line: 1, col: 1 },
      }),
      at("TIMER_HEAP_SCHEDULE", 4, {
        timerId: "tm1",
        label: "setTimeout(0)",
        dueInMs: 0,
        source: { line: 1, col: 1 },
      }),
      at("ENQUEUE_MICROTASK", 5, {
        queue: "promise",
        id: "p1",
        label: "Promise.then",
        source: { line: 2, col: 1 },
      }),
      at("MICROTASK_CHECKPOINT", 6, {
        scope: "phase_transition",
        detail: "Before entering timers",
      }),
      at("DRAIN_MICROTASKS_START", 7),
      at("DEQUEUE_MICROTASK", 8, { queue: "promise", id: "p1" }),
      at("CALLBACK_START", 9, {
        taskId: "p1",
        label: "Promise.then",
        source: { line: 2, col: 1 },
      }),
      at("CONSOLE", 10, {
        level: "log",
        args: ["promise"],
        source: { line: 2, col: 32 },
      }),
      at("CALLBACK_END", 11, { taskId: "p1" }),
      at("MICROTASK_CHECKPOINT", 12, {
        scope: "after_callback",
        detail: "Promise.then completed",
      }),
      at("DRAIN_MICROTASKS_END", 13),
      at("TIMER_HEAP_READY", 14, {
        timerId: "tm1",
        taskId: "t1",
        label: "setTimeout callback",
        source: { line: 1, col: 1 },
      }),
      at("ENQUEUE_TASK", 15, {
        queue: "timers",
        taskId: "t1",
        label: "setTimeout callback",
        source: { line: 1, col: 1 },
      }),
      at("PHASE_ENTER", 16, { phase: "timers" }),
      at("DEQUEUE_TASK", 17, { queue: "timers", taskId: "t1" }),
      at("CALLBACK_START", 18, {
        taskId: "t1",
        label: "setTimeout callback",
        source: { line: 1, col: 1 },
      }),
      at("CONSOLE", 19, {
        level: "log",
        args: ["timeout"],
        source: { line: 1, col: 18 },
      }),
      at("CALLBACK_END", 20, { taskId: "t1" }),
      at("MICROTASK_CHECKPOINT", 21, {
        scope: "after_callback",
        detail: "Timer callback completed",
      }),
      at("PHASE_EXIT", 22, { phase: "timers" }),
      at("HANDLE_CLOSE", 23, { id: "h:timeout:1" }),
      at("SCRIPT_END", 24),
    ],
  },
  immediateVsTimeout: {
    title: "setImmediate vs setTimeout(0)",
    learn: "Check queue is separate from timers queue.",
    code: `setTimeout(() => console.log('timeout'), 0);\nsetImmediate(() => console.log('immediate'));`,
    events: [
      at("SCRIPT_START", 1),
      at("HANDLE_OPEN", 2, {
        id: "h:timeout:1",
        kind: "timer",
        label: "setTimeout(0)",
        source: { line: 1, col: 1 },
      }),
      at("TIMER_HEAP_SCHEDULE", 3, {
        timerId: "tm1",
        label: "setTimeout(0)",
        dueInMs: 0,
        source: { line: 1, col: 1 },
      }),
      at("ENQUEUE_TASK", 4, {
        queue: "check",
        taskId: "c1",
        label: "setImmediate callback",
        source: { line: 2, col: 1 },
      }),
      at("TIMER_HEAP_READY", 5, {
        timerId: "tm1",
        taskId: "t1",
        label: "setTimeout callback",
        source: { line: 1, col: 1 },
      }),
      at("ENQUEUE_TASK", 6, {
        queue: "timers",
        taskId: "t1",
        label: "setTimeout callback",
        source: { line: 1, col: 1 },
      }),
      at("PHASE_ENTER", 7, { phase: "timers" }),
      at("DEQUEUE_TASK", 8, { queue: "timers", taskId: "t1" }),
      at("CALLBACK_START", 9, {
        taskId: "t1",
        label: "setTimeout callback",
        source: { line: 1, col: 1 },
      }),
      at("CONSOLE", 10, {
        level: "log",
        args: ["timeout"],
        source: { line: 1, col: 18 },
      }),
      at("CALLBACK_END", 11, { taskId: "t1" }),
      at("MICROTASK_CHECKPOINT", 12, {
        scope: "after_callback",
        detail: "timer callback done",
      }),
      at("PHASE_EXIT", 13, { phase: "timers" }),
      at("HANDLE_CLOSE", 14, { id: "h:timeout:1" }),
      at("PHASE_ENTER", 15, { phase: "check" }),
      at("DEQUEUE_TASK", 16, { queue: "check", taskId: "c1" }),
      at("CALLBACK_START", 17, {
        taskId: "c1",
        label: "setImmediate callback",
        source: { line: 2, col: 1 },
      }),
      at("CONSOLE", 18, {
        level: "log",
        args: ["immediate"],
        source: { line: 2, col: 20 },
      }),
      at("CALLBACK_END", 19, { taskId: "c1" }),
      at("MICROTASK_CHECKPOINT", 20, {
        scope: "after_callback",
        detail: "immediate callback done",
      }),
      at("PHASE_EXIT", 21, { phase: "check" }),
      at("SCRIPT_END", 22),
    ],
  },
  nextTickPriority: {
    title: "nextTick priority over Promise",
    learn: "nextTick queue drains before Promise microtasks.",
    code: `Promise.resolve().then(() => console.log('promise'));\nprocess.nextTick(() => console.log('tick'));`,
    events: [
      at("SCRIPT_START", 1),
      at("ENQUEUE_MICROTASK", 2, {
        queue: "promise",
        id: "p1",
        label: "Promise.then",
        source: { line: 1, col: 1 },
      }),
      at("ENQUEUE_MICROTASK", 3, {
        queue: "nextTick",
        id: "n1",
        label: "process.nextTick",
        source: { line: 2, col: 1 },
      }),
      at("DRAIN_MICROTASKS_START", 4),
      at("DEQUEUE_MICROTASK", 5, { queue: "nextTick", id: "n1" }),
      at("CALLBACK_START", 6, {
        taskId: "n1",
        label: "process.nextTick",
        source: { line: 2, col: 1 },
      }),
      at("CONSOLE", 7, {
        level: "log",
        args: ["tick"],
        source: { line: 2, col: 24 },
      }),
      at("CALLBACK_END", 8, { taskId: "n1" }),
      at("MICROTASK_CHECKPOINT", 9, {
        scope: "after_callback",
        detail: "nextTick callback done",
      }),
      at("DEQUEUE_MICROTASK", 9, { queue: "promise", id: "p1" }),
      at("CALLBACK_START", 10, {
        taskId: "p1",
        label: "Promise.then",
        source: { line: 1, col: 1 },
      }),
      at("CONSOLE", 11, {
        level: "log",
        args: ["promise"],
        source: { line: 1, col: 30 },
      }),
      at("CALLBACK_END", 12, { taskId: "p1" }),
      at("MICROTASK_CHECKPOINT", 13, {
        scope: "after_callback",
        detail: "Promise callback done",
      }),
      at("DRAIN_MICROTASKS_END", 13),
      at("SCRIPT_END", 14),
    ],
  },
  ioVsImmediate: {
    title: "I/O callbacks vs setImmediate",
    learn: "Poll callbacks run before check callbacks in this turn.",
    code: `import fs from 'node:fs';\nfs.readFile('a.txt', () => console.log('io'));\nsetImmediate(() => console.log('immediate'));`,
    events: [
      at("SCRIPT_START", 1),
      at("REQUEST_START", 2, {
        id: "req:fs:1",
        kind: "fs",
        label: "fs.readFile('a.txt')",
        source: { line: 2, col: 1 },
      }),
      at("ENQUEUE_TASK", 3, {
        queue: "poll",
        taskId: "io1",
        label: "fs.readFile callback",
        source: { line: 2, col: 1 },
      }),
      at("REQUEST_END", 4, { id: "req:fs:1", status: "ok" }),
      at("ENQUEUE_TASK", 5, {
        queue: "check",
        taskId: "c1",
        label: "setImmediate callback",
        source: { line: 3, col: 1 },
      }),
      at("PHASE_ENTER", 6, { phase: "poll" }),
      at("DEQUEUE_TASK", 7, { queue: "poll", taskId: "io1" }),
      at("CALLBACK_START", 8, {
        taskId: "io1",
        label: "fs.readFile callback",
        source: { line: 2, col: 1 },
      }),
      at("CONSOLE", 9, {
        level: "log",
        args: ["io"],
        source: { line: 2, col: 29 },
      }),
      at("CALLBACK_END", 10, { taskId: "io1" }),
      at("MICROTASK_CHECKPOINT", 11, {
        scope: "after_callback",
        detail: "poll callback done",
      }),
      at("PHASE_EXIT", 12, { phase: "poll" }),
      at("PHASE_ENTER", 13, { phase: "check" }),
      at("DEQUEUE_TASK", 14, { queue: "check", taskId: "c1" }),
      at("CALLBACK_START", 15, {
        taskId: "c1",
        label: "setImmediate callback",
        source: { line: 3, col: 1 },
      }),
      at("CONSOLE", 16, {
        level: "log",
        args: ["immediate"],
        source: { line: 3, col: 20 },
      }),
      at("CALLBACK_END", 17, { taskId: "c1" }),
      at("MICROTASK_CHECKPOINT", 18, {
        scope: "after_callback",
        detail: "check callback done",
      }),
      at("PHASE_EXIT", 19, { phase: "check" }),
      at("SCRIPT_END", 20),
    ],
  },
  pendingCallbacks: {
    title: "Pending callbacks phase",
    learn: "Pending callbacks run in their own phase before poll.",
    code: `process.emitWarning('pending cb demo');`,
    events: [
      at("SCRIPT_START", 1),
      at("ENQUEUE_TASK", 2, {
        queue: "pending",
        taskId: "pd1",
        label: "pending callback",
        source: { line: 1, col: 1 },
      }),
      at("PHASE_ENTER", 3, { phase: "pending" }),
      at("DEQUEUE_TASK", 4, { queue: "pending", taskId: "pd1" }),
      at("CALLBACK_START", 5, {
        taskId: "pd1",
        label: "pending callback",
        source: { line: 1, col: 1 },
      }),
      at("CONSOLE", 6, {
        level: "log",
        args: ["pending callback ran"],
        source: { line: 1, col: 1 },
      }),
      at("CALLBACK_END", 7, { taskId: "pd1" }),
      at("MICROTASK_CHECKPOINT", 8, {
        scope: "after_callback",
        detail: "pending callback done",
      }),
      at("PHASE_EXIT", 9, { phase: "pending" }),
      at("SCRIPT_END", 10),
    ],
  },
  closeHandlers: {
    title: "Close handlers",
    learn: "close callbacks run in close queue phase.",
    code: `stream.on('close', () => console.log('closed'));`,
    events: [
      at("SCRIPT_START", 1),
      at("ENQUEUE_TASK", 2, {
        queue: "close",
        taskId: "cl1",
        label: "close handler",
        source: { line: 1, col: 1 },
      }),
      at("PHASE_ENTER", 3, { phase: "close" }),
      at("DEQUEUE_TASK", 4, { queue: "close", taskId: "cl1" }),
      at("CALLBACK_START", 5, {
        taskId: "cl1",
        label: "close handler",
        source: { line: 1, col: 1 },
      }),
      at("CONSOLE", 5, {
        level: "log",
        args: ["closed"],
        source: { line: 1, col: 26 },
      }),
      at("CALLBACK_END", 6, { taskId: "cl1" }),
      at("MICROTASK_CHECKPOINT", 7, {
        scope: "after_callback",
        detail: "close callback done",
      }),
      at("PHASE_EXIT", 8, { phase: "close" }),
      at("SCRIPT_END", 9),
    ],
  },
};

export const exampleIds = Object.keys(examples);

export const defaultExampleId = "timersVsMicrotasks";

export const exampleList = Object.entries(examples).map(([id, ex]) => ({
  id,
  title: ex.title,
}));

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
        source: { line: 1, col: 1 },
      }),
      at("ENQUEUE_TASK", 3, {
        queue: "timers",
        taskId: "t1",
        label: "setTimeout callback",
        source: { line: 1, col: 1 },
      }),
      at("ENQUEUE_MICROTASK", 4, {
        queue: "promise",
        id: "p1",
        label: "Promise.then",
        source: { line: 2, col: 1 },
      }),
      at("DRAIN_MICROTASKS_START", 5),
      at("DEQUEUE_MICROTASK", 6, { queue: "promise", id: "p1" }),
      at("CONSOLE", 6, { level: "log", args: ["promise"] }),
      at("DRAIN_MICROTASKS_END", 7),
      at("PHASE_ENTER", 8, { phase: "timers" }),
      at("DEQUEUE_TASK", 9, { queue: "timers", taskId: "t1" }),
      at("CALLBACK_START", 10, {
        taskId: "t1",
        label: "setTimeout callback",
        source: { line: 1, col: 1 },
      }),
      at("CONSOLE", 10, { level: "log", args: ["timeout"] }),
      at("CALLBACK_END", 11, { taskId: "t1" }),
      at("PHASE_EXIT", 12, { phase: "timers" }),
      at("SCRIPT_END", 13),
    ],
  },
  immediateVsTimeout: {
    title: "setImmediate vs setTimeout(0)",
    learn: "Check queue is separate from timers queue.",
    code: `setTimeout(() => console.log('timeout'), 0);\nsetImmediate(() => console.log('immediate'));`,
    events: [
      at("SCRIPT_START", 1),
      at("ENQUEUE_TASK", 2, {
        queue: "timers",
        taskId: "t1",
        label: "setTimeout callback",
        source: { line: 1, col: 1 },
      }),
      at("ENQUEUE_TASK", 3, {
        queue: "check",
        taskId: "c1",
        label: "setImmediate callback",
        source: { line: 2, col: 1 },
      }),
      at("PHASE_ENTER", 4, { phase: "timers" }),
      at("DEQUEUE_TASK", 5, { queue: "timers", taskId: "t1" }),
      at("CALLBACK_START", 6, {
        taskId: "t1",
        label: "setTimeout callback",
        source: { line: 1, col: 1 },
      }),
      at("CONSOLE", 6, { level: "log", args: ["timeout"] }),
      at("CALLBACK_END", 7, { taskId: "t1" }),
      at("PHASE_EXIT", 8, { phase: "timers" }),
      at("PHASE_ENTER", 9, { phase: "check" }),
      at("DEQUEUE_TASK", 10, { queue: "check", taskId: "c1" }),
      at("CALLBACK_START", 11, {
        taskId: "c1",
        label: "setImmediate callback",
        source: { line: 2, col: 1 },
      }),
      at("CONSOLE", 11, { level: "log", args: ["immediate"] }),
      at("CALLBACK_END", 12, { taskId: "c1" }),
      at("PHASE_EXIT", 13, { phase: "check" }),
      at("SCRIPT_END", 14),
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
      at("CONSOLE", 5, { level: "log", args: ["tick"] }),
      at("DEQUEUE_MICROTASK", 6, { queue: "promise", id: "p1" }),
      at("CONSOLE", 6, { level: "log", args: ["promise"] }),
      at("DRAIN_MICROTASKS_END", 7),
      at("SCRIPT_END", 8),
    ],
  },
  ioVsImmediate: {
    title: "I/O callbacks vs setImmediate",
    learn: "I/O callbacks are in poll queue, then check queue.",
    code: `import fs from 'node:fs';\nfs.readFile('a.txt', () => console.log('io'));\nsetImmediate(() => console.log('immediate'));`,
    events: [
      at("SCRIPT_START", 1),
      at("ENQUEUE_TASK", 2, {
        queue: "io",
        taskId: "io1",
        label: "fs.readFile callback",
        source: { line: 2, col: 1 },
      }),
      at("ENQUEUE_TASK", 3, {
        queue: "check",
        taskId: "c1",
        label: "setImmediate callback",
        source: { line: 3, col: 1 },
      }),
      at("PHASE_ENTER", 4, { phase: "io" }),
      at("DEQUEUE_TASK", 5, { queue: "io", taskId: "io1" }),
      at("CALLBACK_START", 6, {
        taskId: "io1",
        label: "fs.readFile callback",
        source: { line: 2, col: 1 },
      }),
      at("CONSOLE", 6, { level: "log", args: ["io"] }),
      at("CALLBACK_END", 7, { taskId: "io1" }),
      at("PHASE_EXIT", 8, { phase: "io" }),
      at("PHASE_ENTER", 9, { phase: "check" }),
      at("DEQUEUE_TASK", 10, { queue: "check", taskId: "c1" }),
      at("CALLBACK_START", 11, {
        taskId: "c1",
        label: "setImmediate callback",
        source: { line: 3, col: 1 },
      }),
      at("CONSOLE", 11, { level: "log", args: ["immediate"] }),
      at("CALLBACK_END", 12, { taskId: "c1" }),
      at("PHASE_EXIT", 13, { phase: "check" }),
      at("SCRIPT_END", 14),
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
      at("CONSOLE", 5, { level: "log", args: ["closed"] }),
      at("CALLBACK_END", 6, { taskId: "cl1" }),
      at("PHASE_EXIT", 7, { phase: "close" }),
      at("SCRIPT_END", 8),
    ],
  },
};

export const exampleIds = Object.keys(examples);

import type {
  Phase,
  TaskQueue,
  MicrotaskQueue,
  VisualizerEvent,
  ExecutionFocus,
  SourceRange,
} from "./events";

export type QueueItem = {
  id: string;
  label: string;
  source?: { line: number; col: number; endLine?: number; endCol?: number };
  state: "queued" | "running" | "done" | "cancelled";
  meta?: unknown;
};

export type VisualizerState = {
  runtime: "node";
  phase: Phase | null;
  isRunning: boolean;
  callStack: Array<{ id: string; label: string; source?: SourceRange }>;
  queues: {
    timers: QueueItem[];
    io: QueueItem[];
    check: QueueItem[];
    close: QueueItem[];
    nextTick: QueueItem[];
    promise: QueueItem[];
  };
  activeTaskId: string | null;
  drainingMicrotasks: boolean;
  logs: Array<{ level: "log" | "warn" | "error"; args: unknown[]; ts: number }>;
  diagnostics: Array<{ message: string; line: number; col: number }>;
  errors: Array<{ message: string; stack?: string; ts: number }>;
  timeline: VisualizerEvent[];
  focus: ExecutionFocus;
};

export function createInitialState(): VisualizerState {
  return {
    runtime: "node",
    phase: null,
    isRunning: false,
    callStack: [],
    queues: {
      timers: [],
      io: [],
      check: [],
      close: [],
      nextTick: [],
      promise: [],
    },
    activeTaskId: null,
    drainingMicrotasks: false,
    logs: [],
    diagnostics: [],
    errors: [],
    timeline: [],
    focus: { activeBox: "IDLE" },
  };
}

function removeQueueItem(
  items: QueueItem[],
  id: string,
): QueueItem | undefined {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) {
    return undefined;
  }

  const [item] = items.splice(index, 1);
  return item;
}

function removeStackFrameById(
  frames: Array<{ id: string; label: string }>,
  id: string,
): { id: string; label: string } | undefined {
  const index = frames.findIndex((frame) => frame.id === id);
  if (index === -1) {
    return frames.pop();
  }

  const [removed] = frames.splice(index, 1);
  return removed;
}

function queueItemFromTask(
  event: Extract<VisualizerEvent, { type: "ENQUEUE_TASK" }>,
): QueueItem {
  return {
    id: event.taskId,
    label: event.label,
    source: event.source,
    meta: event.meta,
    state: "queued",
  };
}

function queueItemFromMicrotask(
  event: Extract<VisualizerEvent, { type: "ENQUEUE_MICROTASK" }>,
): QueueItem {
  return {
    id: event.id,
    label: event.label,
    source: event.source,
    state: "queued",
  };
}

export function applyEvent(
  state: VisualizerState,
  event: VisualizerEvent,
): VisualizerState {
  const next: VisualizerState = {
    ...state,
    callStack: [...state.callStack],
    queues: {
      timers: [...state.queues.timers],
      io: [...state.queues.io],
      check: [...state.queues.check],
      close: [...state.queues.close],
      nextTick: [...state.queues.nextTick],
      promise: [...state.queues.promise],
    },
    logs: [...state.logs],
    diagnostics: [...state.diagnostics],
    errors: [...state.errors],
    timeline: [...state.timeline, event],
  };

  switch (event.type) {
    case "SCRIPT_START":
      next.isRunning = true;
      return next;
    case "SCRIPT_END":
      next.isRunning = false;
      next.phase = null;
      next.activeTaskId = null;
      return next;
    case "PHASE_ENTER":
      next.phase = event.phase;
      return next;
    case "PHASE_EXIT":
      if (next.phase === event.phase) {
        next.phase = null;
      }
      return next;
    case "ENQUEUE_TASK":
      next.queues[event.queue].push(queueItemFromTask(event));
      if (event.source) {
        next.focus = {
          ...next.focus,
          activeBox: "CODE",
          activeRange: event.source,
        };
      }
      return next;
    case "DEQUEUE_TASK": {
      const task = removeQueueItem(next.queues[event.queue], event.taskId);
      next.activeTaskId = task?.id ?? event.taskId;
      return next;
    }
    case "CALLBACK_START":
      next.callStack.push({
        id: event.taskId,
        label: event.label,
        source: event.source,
      });
      if (event.source) {
        next.focus = {
          ...next.focus,
          activeBox: "CODE",
          activeRange: event.source,
        };
      }
      return next;
    case "CALLBACK_END":
      removeStackFrameById(next.callStack, event.taskId);
      if (next.activeTaskId === event.taskId) {
        next.activeTaskId = null;
      }
      return next;
    case "ENQUEUE_MICROTASK":
      next.queues[event.queue].push(queueItemFromMicrotask(event));
      if (event.source) {
        next.focus = {
          ...next.focus,
          activeBox: "CODE",
          activeRange: event.source,
        };
      }
      return next;
    case "DEQUEUE_MICROTASK":
      removeQueueItem(next.queues[event.queue], event.id);
      return next;
    case "DRAIN_MICROTASKS_START":
      next.drainingMicrotasks = true;
      return next;
    case "DRAIN_MICROTASKS_END":
      next.drainingMicrotasks = false;
      return next;
    case "ENTER_FUNCTION":
      next.callStack.push({
        id: `fn:${next.timeline.length}`,
        label: event.name,
        source: event.source,
      });
      if (event.source) {
        next.focus = {
          ...next.focus,
          activeBox: "CODE",
          activeRange: event.source,
        };
      }
      return next;
    case "EXIT_FUNCTION":
      if (
        next.callStack.length > 0 &&
        next.callStack[next.callStack.length - 1].label === event.name
      ) {
        next.callStack.pop();
      } else {
        const index = next.callStack.findIndex(
          (frame) => frame.label === event.name,
        );
        if (index !== -1) {
          next.callStack.splice(index, 1);
        }
      }
      return next;
    case "CONSOLE":
      next.logs.push({ level: event.level, args: event.args, ts: event.ts });
      return next;
    case "RUNTIME_ERROR":
      next.errors.push({
        message: event.message,
        stack: event.stack,
        ts: event.ts,
      });
      return next;
    case "TS_DIAGNOSTIC":
      next.diagnostics = event.diagnostics;
      return next;
    case "FOCUS_SET":
      next.focus = { ...next.focus, ...event.focus };
      return next;
    case "WEBAPI_SCHEDULE":
      if (event.source) {
        next.focus = {
          ...next.focus,
          activeBox: "CODE",
          activeRange: event.source,
          reason: "Scheduling API",
        };
      }
      return next;
  }
  return next;
}

export function reduceEvents(
  events: VisualizerEvent[],
  seed = createInitialState(),
): VisualizerState {
  return events.reduce(applyEvent, seed);
}

export function queuesForPhase(phase: Phase): TaskQueue {
  return phase;
}

export function microtaskOrder(): MicrotaskQueue[] {
  return ["nextTick", "promise"];
}

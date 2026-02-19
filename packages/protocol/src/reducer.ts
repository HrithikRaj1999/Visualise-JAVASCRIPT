import type {
  Phase,
  TaskQueue,
  MicrotaskQueue,
  VisualizerEvent,
  ExecutionFocus,
  SourceRange,
  HandleKind,
  RequestKind,
} from "./events";

export type QueueItem = {
  id: string;
  label: string;
  source?: { line: number; col: number; endLine?: number; endCol?: number };
  state: "queued" | "running" | "done" | "cancelled";
  meta?: unknown;
};

export type ActiveHandle = {
  id: string;
  kind: HandleKind;
  label: string;
  source?: SourceRange;
  openedAt: number;
};

export type ActiveRequest = {
  id: string;
  kind: RequestKind;
  label: string;
  source?: SourceRange;
  startedAt: number;
};

export type MicrotaskCheckpoint = {
  scope: "after_callback" | "phase_transition" | "script_end";
  detail?: string;
  ts: number;
};

export type PollWaitState = {
  active: boolean;
  timeoutMs?: number;
  reason?: string;
};

export type VisualizerState = {
  runtime: "node";
  phase: Phase | null;
  isRunning: boolean;
  callStack: Array<{ id: string; label: string; source?: SourceRange }>;
  queues: {
    timers: QueueItem[];
    pending: QueueItem[];
    poll: QueueItem[];
    io: QueueItem[];
    check: QueueItem[];
    close: QueueItem[];
    nextTick: QueueItem[];
    promise: QueueItem[];
  };
  timerHeap: QueueItem[];
  pollWait: PollWaitState;
  activeHandles: ActiveHandle[];
  activeRequests: ActiveRequest[];
  microtaskCheckpoint: MicrotaskCheckpoint | null;
  activeTaskId: string | null;
  drainingMicrotasks: boolean;
  logs: Array<{
    level: "log" | "warn" | "error";
    args: unknown[];
    ts: number;
    source?: SourceRange;
  }>;
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
      pending: [],
      poll: [],
      io: [],
      check: [],
      close: [],
      nextTick: [],
      promise: [],
    },
    timerHeap: [],
    pollWait: { active: false },
    activeHandles: [],
    activeRequests: [],
    microtaskCheckpoint: null,
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

function queueItemFromTimerHeap(
  event:
    | Extract<VisualizerEvent, { type: "TIMER_HEAP_SCHEDULE" }>
    | Extract<VisualizerEvent, { type: "TIMER_HEAP_READY" }>,
): QueueItem {
  return {
    id: event.type === "TIMER_HEAP_SCHEDULE" ? event.timerId : event.taskId,
    label: event.label,
    source: event.source,
    meta: event.meta,
    state: "queued",
  };
}

function canonicalTaskQueue(queue: TaskQueue): "timers" | "pending" | "poll" | "check" | "close" {
  if (queue === "io") {
    return "poll";
  }
  return queue;
}

function syncPollIoAlias(queues: VisualizerState["queues"]) {
  queues.io = [...queues.poll];
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
      pending: [...state.queues.pending],
      poll: [...state.queues.poll],
      io: [...state.queues.io],
      check: [...state.queues.check],
      close: [...state.queues.close],
      nextTick: [...state.queues.nextTick],
      promise: [...state.queues.promise],
    },
    timerHeap: [...state.timerHeap],
    pollWait: { ...state.pollWait },
    activeHandles: [...state.activeHandles],
    activeRequests: [...state.activeRequests],
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
      next.pollWait = { active: false };
      next.microtaskCheckpoint = {
        scope: "script_end",
        detail: "Script finished",
        ts: event.ts,
      };
      next.activeTaskId = null;
      return next;
    case "TIMER_HEAP_SCHEDULE":
      next.timerHeap.push(queueItemFromTimerHeap(event));
      if (event.source) {
        next.focus = {
          ...next.focus,
          activeBox: "TIMER_HEAP",
          activeRange: event.source,
          reason: "Timer scheduled",
        };
      }
      return next;
    case "TIMER_HEAP_READY": {
      removeQueueItem(next.timerHeap, event.timerId);
      next.queues.timers.push(queueItemFromTimerHeap(event));
      return next;
    }
    case "PHASE_ENTER":
      next.phase = event.phase;
      return next;
    case "PHASE_EXIT":
      if (next.phase === event.phase) {
        next.phase = null;
      }
      return next;
    case "POLL_WAIT_START":
      next.pollWait = {
        active: true,
        timeoutMs: event.timeoutMs,
        reason: event.reason,
      };
      return next;
    case "POLL_WAIT_END":
      next.pollWait = { active: false, reason: event.reason };
      return next;
    case "MICROTASK_CHECKPOINT":
      next.microtaskCheckpoint = {
        scope: event.scope,
        detail: event.detail,
        ts: event.ts,
      };
      return next;
    case "ENQUEUE_TASK":
      next.queues[canonicalTaskQueue(event.queue)].push(queueItemFromTask(event));
      syncPollIoAlias(next.queues);
      if (event.source) {
        next.focus = {
          ...next.focus,
          activeBox: "CODE",
          activeRange: event.source,
        };
      }
      return next;
    case "DEQUEUE_TASK": {
      const queue = canonicalTaskQueue(event.queue);
      const task = removeQueueItem(next.queues[queue], event.taskId);
      syncPollIoAlias(next.queues);
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
      next.logs.push({
        level: event.level,
        args: event.args,
        ts: event.ts,
        source: event.source,
      });
      return next;
    case "HANDLE_OPEN":
      if (!next.activeHandles.some((handle) => handle.id === event.id)) {
        next.activeHandles.push({
          id: event.id,
          kind: event.kind,
          label: event.label,
          source: event.source,
          openedAt: event.ts,
        });
      }
      return next;
    case "HANDLE_CLOSE":
      next.activeHandles = next.activeHandles.filter(
        (handle) => handle.id !== event.id,
      );
      return next;
    case "REQUEST_START":
      if (!next.activeRequests.some((request) => request.id === event.id)) {
        next.activeRequests.push({
          id: event.id,
          kind: event.kind,
          label: event.label,
          source: event.source,
          startedAt: event.ts,
        });
      }
      return next;
    case "REQUEST_END":
      next.activeRequests = next.activeRequests.filter(
        (request) => request.id !== event.id,
      );
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
  return phase === "poll" ? "poll" : phase;
}

export function microtaskOrder(): MicrotaskQueue[] {
  return ["nextTick", "promise"];
}

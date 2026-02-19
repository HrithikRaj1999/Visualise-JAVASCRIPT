import { VisualizerEvent, TaskQueue, Phase } from "@jsv/protocol";
import { ReplayState } from "./replay";

const PHASE_ORDER: Phase[] = ["timers", "pending", "poll", "check", "close"];

function queueForPhase(phase: Phase): "timers" | "pending" | "poll" | "check" | "close" {
  return phase;
}

function queueLabel(
  queue: "timers" | "pending" | "poll" | "check" | "close" | "io",
): "timers" | "pending" | "poll" | "check" | "close" {
  if (queue === "io") {
    return "poll";
  }
  return queue;
}

export function tick(state: ReplayState["state"]): VisualizerEvent[] {
  const now = Date.now();

  // 1) Finish currently running callback.
  if (state.callStack.length > 0) {
    const frame = state.callStack[state.callStack.length - 1];
    const events: VisualizerEvent[] = [
      { type: "CALLBACK_END", ts: now, taskId: frame.id },
      {
        type: "MICROTASK_CHECKPOINT",
        ts: now + 1,
        scope: "after_callback",
        detail: `Completed ${frame.label}`,
      },
    ];
    return events;
  }

  // 2) Drain microtasks at checkpoints.
  if (state.queues.nextTick.length > 0 || state.queues.promise.length > 0) {
    const events: VisualizerEvent[] = [];
    if (!state.drainingMicrotasks) {
      events.push({
        type: "DRAIN_MICROTASKS_START",
        ts: now,
      });
    }

    if (state.queues.nextTick.length > 0) {
      const task = state.queues.nextTick[0];
      events.push(
        {
          type: "DEQUEUE_MICROTASK",
          ts: now + events.length,
          queue: "nextTick",
          id: task.id,
        },
        {
          type: "CALLBACK_START",
          ts: now + events.length + 1,
          taskId: task.id,
          label: task.label,
          source: task.source,
        },
      );
      return events;
    }

    const task = state.queues.promise[0];
    events.push(
      {
        type: "DEQUEUE_MICROTASK",
        ts: now + events.length,
        queue: "promise",
        id: task.id,
      },
      {
        type: "CALLBACK_START",
        ts: now + events.length + 1,
        taskId: task.id,
        label: task.label,
        source: task.source,
      },
    );
    return events;
  }

  if (state.drainingMicrotasks) {
    return [
      {
        type: "DRAIN_MICROTASKS_END",
        ts: now,
      },
    ];
  }

  // 3) Close inactive phase before transition.
  if (state.phase !== null) {
    const currentQueue = queueForPhase(state.phase);
    const queueItems = state.queues[currentQueue];
    if (queueItems.length === 0) {
      return [
        {
          type: "MICROTASK_CHECKPOINT",
          ts: now,
          scope: "phase_transition",
          detail: `Leaving ${state.phase} phase`,
        },
        {
          type: "PHASE_EXIT",
          ts: now + 1,
          phase: state.phase,
        },
      ];
    }
  }

  // 4) If poll is waiting on active handles/requests, visualize wait.
  const hasPendingRuntimeWork =
    state.timerHeap.length > 0 ||
    state.activeHandles.length > 0 ||
    state.activeRequests.length > 0;

  if (!state.phase && hasPendingRuntimeWork) {
    return [
      { type: "PHASE_ENTER", ts: now, phase: "poll" },
      {
        type: "POLL_WAIT_START",
        ts: now + 1,
        reason: "Waiting for I/O or timer readiness",
      },
    ];
  }

  if (state.phase === "poll" && state.pollWait.active) {
    if (state.queues.poll.length > 0 || state.queues.timers.length > 0) {
      return [{ type: "POLL_WAIT_END", ts: now, reason: "Work became ready" }];
    }
    return [];
  }

  // 5) Run macro queues in libuv order.
  for (const phase of PHASE_ORDER) {
    const queue = queueForPhase(phase);
    const queueItems = state.queues[queue];
    if (queueItems.length === 0) {
      continue;
    }

    const task = queueItems[0];
    const events: VisualizerEvent[] = [];

    if (state.pollWait.active && phase === "poll") {
      events.push({ type: "POLL_WAIT_END", ts: now, reason: "Poll callback ready" });
    }

    if (state.phase !== phase) {
      events.push({
        type: "PHASE_ENTER",
        ts: now + events.length,
        phase,
      });
    }

    const dequeueQueue: TaskQueue = queue === "poll" ? "poll" : queueLabel(queue);
    events.push(
      {
        type: "DEQUEUE_TASK",
        ts: now + events.length,
        queue: dequeueQueue,
        taskId: task.id,
      },
      {
        type: "CALLBACK_START",
        ts: now + events.length + 1,
        taskId: task.id,
        label: task.label,
        source: task.source,
      },
    );

    return events;
  }

  // 6) Turn scheduled timer heap item into ready task if no other work exists.
  if (state.timerHeap.length > 0) {
    const timer = state.timerHeap[0];
    const taskId = timer.id.startsWith("timer-task:")
      ? timer.id.replace("timer-task:", "")
      : `${timer.id}:ready`;
    return [
      {
        type: "TIMER_HEAP_READY",
        ts: now,
        timerId: timer.id,
        taskId,
        label: timer.label,
        source: timer.source,
        meta: timer.meta,
      },
    ];
  }

  // 7) Resolve poll wait, then idle.
  if (state.pollWait.active) {
    return [{ type: "POLL_WAIT_END", ts: now, reason: "No pending work" }];
  }

  if (state.focus.activeBox !== "IDLE") {
    return [
      {
        type: "FOCUS_SET",
        ts: now,
        focus: { activeBox: "IDLE", reason: "Event Loop Idle" },
      },
    ];
  }
  return [];
}

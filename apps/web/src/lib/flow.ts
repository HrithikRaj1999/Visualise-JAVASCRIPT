import { type VisualizerEvent } from "@jsv/protocol";

type FlowFocus = {
  message: string;
  emphasisIds: string[];
};

const TASK_QUEUE_TO_BOX: Record<
  "timers" | "pending" | "poll" | "io" | "check" | "close",
  string
> = {
  timers: "box-timers",
  pending: "box-pending",
  poll: "box-poll",
  io: "box-poll",
  check: "box-check",
  close: "box-close",
};

const PHASE_TO_BOX: Record<
  "timers" | "pending" | "poll" | "check" | "close",
  string
> = {
  timers: "box-timers",
  pending: "box-pending",
  poll: "box-poll",
  check: "box-check",
  close: "box-close",
};

export function describeFlowFocus(event: VisualizerEvent | null): FlowFocus {
  if (!event) {
    return {
      message: "Press RUN AT ONCE or step to start execution flow",
      emphasisIds: [],
    };
  }

  switch (event.type) {
    case "WEBAPI_SCHEDULE":
      return {
        message: "CODE -> WEB APIs",
        emphasisIds: ["box-code", "box-webapi"],
      };
    case "HANDLE_OPEN":
    case "REQUEST_START":
      return {
        message: "CODE -> WEB APIs",
        emphasisIds: ["box-code", "box-webapi"],
      };
    case "TIMER_HEAP_SCHEDULE":
      return {
        message: "WEB APIs -> TIMER HEAP",
        emphasisIds: ["box-webapi", "box-timer-heap"],
      };
    case "TIMER_HEAP_READY":
      return {
        message: "TIMER HEAP -> TIMERS QUEUE",
        emphasisIds: ["box-timer-heap", "box-timers"],
      };
    case "ENQUEUE_TASK": {
      const fromBox =
        event.queue === "timers"
          ? "box-timer-heap"
          : event.queue === "poll" ||
              event.queue === "io" ||
              event.queue === "pending"
            ? "box-webapi"
            : "box-code";
      const fromLabel =
        event.queue === "timers"
          ? "TIMER HEAP"
          : event.queue === "poll" ||
              event.queue === "io" ||
              event.queue === "pending"
            ? "WEB APIs"
            : "CODE";
      return {
        message: `${fromLabel} -> ${event.queue.toUpperCase()} QUEUE`,
        emphasisIds: [fromBox, TASK_QUEUE_TO_BOX[event.queue]],
      };
    }
    case "DEQUEUE_TASK":
      return {
        message: `${event.queue.toUpperCase()} QUEUE -> CALL STACK`,
        emphasisIds: [TASK_QUEUE_TO_BOX[event.queue], "box-stack"],
      };
    case "ENQUEUE_MICROTASK":
      return {
        message: `${event.source ? "CODE" : "CALL STACK"} -> MICROTASK QUEUE`,
        emphasisIds: [event.source ? "box-code" : "box-stack", "box-microtask"],
      };
    case "DEQUEUE_MICROTASK":
      return {
        message: "MICROTASK QUEUE -> CALL STACK",
        emphasisIds: ["box-microtask", "box-stack"],
      };
    case "CALLBACK_START":
      return {
        message: `${event.source ? "CODE + " : ""}CALL STACK RUNNING`,
        emphasisIds: event.source ? ["box-stack", "box-code"] : ["box-stack"],
      };
    case "CONSOLE":
      return {
        message: "CALL STACK -> USER CONSOLE OUTPUT",
        emphasisIds: ["box-stack", "box-code-output"],
      };
    case "RUNTIME_ERROR":
      return {
        message: "CALL STACK -> USER CONSOLE OUTPUT (ERROR)",
        emphasisIds: ["box-stack", "box-code-output"],
      };
    case "PHASE_ENTER":
      return {
        message: `Event loop entered ${event.phase} phase`,
        emphasisIds: ["box-loop", PHASE_TO_BOX[event.phase]],
      };
    case "PHASE_EXIT":
      return {
        message: `Event loop left ${event.phase} phase`,
        emphasisIds: ["box-loop"],
      };
    case "DRAIN_MICROTASKS_START":
      return {
        message: "Draining microtasks",
        emphasisIds: ["box-loop", "box-microtask"],
      };
    case "DRAIN_MICROTASKS_END":
      return {
        message: "Finished draining microtasks",
        emphasisIds: ["box-loop", "box-microtask"],
      };
    case "POLL_WAIT_START":
      return {
        message: "POLL WAITING FOR I/O",
        emphasisIds: ["box-loop", "box-poll", "box-webapi"],
      };
    case "POLL_WAIT_END":
      return {
        message: "POLL RESUMED",
        emphasisIds: ["box-loop", "box-poll"],
      };
    case "REQUEST_END":
    case "HANDLE_CLOSE":
      return {
        message: "Web API work completed",
        emphasisIds: ["box-webapi"],
      };
    default:
      return {
        message: event.type,
        emphasisIds: [],
      };
  }
}

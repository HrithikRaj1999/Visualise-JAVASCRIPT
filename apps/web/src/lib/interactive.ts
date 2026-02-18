import { VisualizerEvent, TaskQueue, MicrotaskQueue } from "@jsv/protocol";

export function createEnqueueTaskEvent(
  queue: TaskQueue,
  label: string,
): VisualizerEvent {
  return {
    type: "ENQUEUE_TASK",
    ts: Date.now(),
    queue,
    taskId: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    label,
  };
}

export function createEnqueueMicrotaskEvent(
  queue: MicrotaskQueue,
  label: string,
): VisualizerEvent {
  return {
    type: "ENQUEUE_MICROTASK",
    ts: Date.now(),
    queue,
    id: `micro-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    label,
  };
}

export function createCallbackStartEvent(label: string): VisualizerEvent {
  return {
    type: "CALLBACK_START",
    ts: Date.now(),
    taskId: `cb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    label,
  };
}

import { z } from "zod";

export const RuntimeSchema = z.literal("node");
export type Runtime = z.infer<typeof RuntimeSchema>;

export const PhaseSchema = z.enum([
  "timers",
  "pending",
  "poll",
  "check",
  "close",
]);
export type Phase = z.infer<typeof PhaseSchema>;

export const TaskQueueSchema = z.enum([
  "timers",
  "pending",
  "poll",
  "io",
  "check",
  "close",
]);
export type TaskQueue = z.infer<typeof TaskQueueSchema>;

export const MicrotaskQueueSchema = z.enum(["nextTick", "promise"]);
export type MicrotaskQueue = z.infer<typeof MicrotaskQueueSchema>;

export const SourceRangeSchema = z.object({
  line: z.number().int().positive(),
  col: z.number().int().positive(),
  endLine: z.number().int().positive().optional(),
  endCol: z.number().int().positive().optional(),
});
export type SourceRange = z.infer<typeof SourceRangeSchema>;

export const FocusBoxSchema = z.enum([
  "CODE",
  "STACK",
  "WEBAPI",
  "TIMER_HEAP",
  "TASKQ",
  "MICROQ",
  "CONSOLE",
  "IDLE",
]);
export type FocusBox = z.infer<typeof FocusBoxSchema>;

export const ExecutionFocusSchema = z.object({
  activeBox: FocusBoxSchema,
  activeTokenId: z.string().optional(),
  activeRange: SourceRangeSchema.optional(),
  reason: z.string().optional(),
});
export type ExecutionFocus = z.infer<typeof ExecutionFocusSchema>;

const BaseEventSchema = z.object({ ts: z.number() });

export const HandleKindSchema = z.enum([
  "timer",
  "interval",
  "immediate",
  "io",
  "socket",
  "fs",
  "other",
]);
export type HandleKind = z.infer<typeof HandleKindSchema>;

export const RequestKindSchema = z.enum([
  "fs",
  "network",
  "dns",
  "crypto",
  "other",
]);
export type RequestKind = z.infer<typeof RequestKindSchema>;

export const VisualizerEventSchema = z.discriminatedUnion("type", [
  BaseEventSchema.extend({ type: z.literal("SCRIPT_START") }),
  BaseEventSchema.extend({ type: z.literal("SCRIPT_END") }),
  BaseEventSchema.extend({
    type: z.literal("TIMER_HEAP_SCHEDULE"),
    timerId: z.string(),
    label: z.string(),
    dueInMs: z.number().nonnegative().optional(),
    source: SourceRangeSchema.optional(),
    meta: z.unknown().optional(),
  }),
  BaseEventSchema.extend({
    type: z.literal("TIMER_HEAP_READY"),
    timerId: z.string(),
    taskId: z.string(),
    label: z.string(),
    source: SourceRangeSchema.optional(),
    meta: z.unknown().optional(),
  }),
  BaseEventSchema.extend({
    type: z.literal("PHASE_ENTER"),
    phase: PhaseSchema,
  }),
  BaseEventSchema.extend({ type: z.literal("PHASE_EXIT"), phase: PhaseSchema }),
  BaseEventSchema.extend({
    type: z.literal("POLL_WAIT_START"),
    timeoutMs: z.number().int().nonnegative().optional(),
    reason: z.string().optional(),
  }),
  BaseEventSchema.extend({
    type: z.literal("POLL_WAIT_END"),
    reason: z.string().optional(),
  }),
  BaseEventSchema.extend({
    type: z.literal("MICROTASK_CHECKPOINT"),
    scope: z.enum(["after_callback", "phase_transition", "script_end"]),
    detail: z.string().optional(),
  }),
  BaseEventSchema.extend({
    type: z.literal("ENQUEUE_TASK"),
    queue: TaskQueueSchema,
    taskId: z.string(),
    label: z.string(),
    source: SourceRangeSchema.optional(),
    meta: z.unknown().optional(),
  }),
  BaseEventSchema.extend({
    type: z.literal("DEQUEUE_TASK"),
    queue: TaskQueueSchema,
    taskId: z.string(),
  }),
  BaseEventSchema.extend({
    type: z.literal("CALLBACK_START"),
    taskId: z.string(),
    label: z.string(),
    source: SourceRangeSchema.optional(),
  }),
  BaseEventSchema.extend({
    type: z.literal("CALLBACK_END"),
    taskId: z.string(),
  }),
  BaseEventSchema.extend({
    type: z.literal("ENQUEUE_MICROTASK"),
    queue: MicrotaskQueueSchema,
    id: z.string(),
    label: z.string(),
    source: SourceRangeSchema.optional(),
  }),
  BaseEventSchema.extend({
    type: z.literal("DEQUEUE_MICROTASK"),
    queue: MicrotaskQueueSchema,
    id: z.string(),
  }),
  BaseEventSchema.extend({ type: z.literal("DRAIN_MICROTASKS_START") }),
  BaseEventSchema.extend({ type: z.literal("DRAIN_MICROTASKS_END") }),
  BaseEventSchema.extend({
    type: z.literal("ENTER_FUNCTION"),
    name: z.string(),
    source: SourceRangeSchema.optional(),
  }),
  BaseEventSchema.extend({
    type: z.literal("EXIT_FUNCTION"),
    name: z.string(),
  }),
  BaseEventSchema.extend({
    type: z.literal("CONSOLE"),
    level: z.enum(["log", "warn", "error"]),
    args: z.array(z.unknown()),
    source: SourceRangeSchema.optional(),
  }),
  BaseEventSchema.extend({
    type: z.literal("HANDLE_OPEN"),
    id: z.string(),
    kind: HandleKindSchema,
    label: z.string(),
    source: SourceRangeSchema.optional(),
  }),
  BaseEventSchema.extend({
    type: z.literal("HANDLE_CLOSE"),
    id: z.string(),
  }),
  BaseEventSchema.extend({
    type: z.literal("REQUEST_START"),
    id: z.string(),
    kind: RequestKindSchema,
    label: z.string(),
    source: SourceRangeSchema.optional(),
  }),
  BaseEventSchema.extend({
    type: z.literal("REQUEST_END"),
    id: z.string(),
    status: z.enum(["ok", "error", "cancelled"]).optional(),
  }),
  BaseEventSchema.extend({
    type: z.literal("RUNTIME_ERROR"),
    message: z.string(),
    stack: z.string().optional(),
  }),
  BaseEventSchema.extend({
    type: z.literal("TS_DIAGNOSTIC"),
    diagnostics: z.array(
      z.object({
        message: z.string(),
        line: z.number().int().positive(),
        col: z.number().int().positive(),
      }),
    ),
  }),
  BaseEventSchema.extend({
    type: z.literal("FOCUS_SET"),
    focus: ExecutionFocusSchema.partial(),
  }),
  BaseEventSchema.extend({
    type: z.literal("WEBAPI_SCHEDULE"),
    job: z.any(), // For MVP, just allow any
    kind: z.enum(["timer", "io", "immediate", "other"]).optional(),
    handleId: z.string().optional(),
    requestId: z.string().optional(),
    source: SourceRangeSchema.optional(),
  }),
]);

export type VisualizerEvent = z.infer<typeof VisualizerEventSchema>;

export function parseEvent(event: unknown): VisualizerEvent {
  return VisualizerEventSchema.parse(event);
}

export function parseEvents(events: unknown): VisualizerEvent[] {
  return z.array(VisualizerEventSchema).parse(events);
}

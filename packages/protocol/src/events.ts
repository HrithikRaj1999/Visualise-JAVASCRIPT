import { z } from 'zod';

export const RuntimeSchema = z.literal('node');
export type Runtime = z.infer<typeof RuntimeSchema>;

export const PhaseSchema = z.enum(['timers', 'io', 'check', 'close']);
export type Phase = z.infer<typeof PhaseSchema>;

export const TaskQueueSchema = z.enum(['timers', 'io', 'check', 'close']);
export type TaskQueue = z.infer<typeof TaskQueueSchema>;

export const MicrotaskQueueSchema = z.enum(['nextTick', 'promise']);
export type MicrotaskQueue = z.infer<typeof MicrotaskQueueSchema>;

export const SourceRangeSchema = z.object({
  line: z.number().int().positive(),
  col: z.number().int().positive(),
  endLine: z.number().int().positive().optional(),
  endCol: z.number().int().positive().optional(),
});
export type SourceRange = z.infer<typeof SourceRangeSchema>;

const BaseEventSchema = z.object({ ts: z.number() });

export const VisualizerEventSchema = z.discriminatedUnion('type', [
  BaseEventSchema.extend({ type: z.literal('SCRIPT_START') }),
  BaseEventSchema.extend({ type: z.literal('SCRIPT_END') }),
  BaseEventSchema.extend({ type: z.literal('PHASE_ENTER'), phase: PhaseSchema }),
  BaseEventSchema.extend({ type: z.literal('PHASE_EXIT'), phase: PhaseSchema }),
  BaseEventSchema.extend({
    type: z.literal('ENQUEUE_TASK'),
    queue: TaskQueueSchema,
    taskId: z.string(),
    label: z.string(),
    source: SourceRangeSchema.optional(),
    meta: z.unknown().optional(),
  }),
  BaseEventSchema.extend({
    type: z.literal('DEQUEUE_TASK'),
    queue: TaskQueueSchema,
    taskId: z.string(),
  }),
  BaseEventSchema.extend({ type: z.literal('CALLBACK_START'), taskId: z.string(), label: z.string() }),
  BaseEventSchema.extend({ type: z.literal('CALLBACK_END'), taskId: z.string() }),
  BaseEventSchema.extend({
    type: z.literal('ENQUEUE_MICROTASK'),
    queue: MicrotaskQueueSchema,
    id: z.string(),
    label: z.string(),
    source: SourceRangeSchema.optional(),
  }),
  BaseEventSchema.extend({
    type: z.literal('DEQUEUE_MICROTASK'),
    queue: MicrotaskQueueSchema,
    id: z.string(),
  }),
  BaseEventSchema.extend({ type: z.literal('DRAIN_MICROTASKS_START') }),
  BaseEventSchema.extend({ type: z.literal('DRAIN_MICROTASKS_END') }),
  BaseEventSchema.extend({
    type: z.literal('ENTER_FUNCTION'),
    name: z.string(),
    source: SourceRangeSchema.optional(),
  }),
  BaseEventSchema.extend({ type: z.literal('EXIT_FUNCTION'), name: z.string() }),
  BaseEventSchema.extend({
    type: z.literal('CONSOLE'),
    level: z.enum(['log', 'warn', 'error']),
    args: z.array(z.unknown()),
  }),
  BaseEventSchema.extend({ type: z.literal('RUNTIME_ERROR'), message: z.string(), stack: z.string().optional() }),
  BaseEventSchema.extend({
    type: z.literal('TS_DIAGNOSTIC'),
    diagnostics: z.array(
      z.object({
        message: z.string(),
        line: z.number().int().positive(),
        col: z.number().int().positive(),
      })
    ),
  }),
]);

export type VisualizerEvent = z.infer<typeof VisualizerEventSchema>;

export function parseEvent(event: unknown): VisualizerEvent {
  return VisualizerEventSchema.parse(event);
}

export function parseEvents(events: unknown): VisualizerEvent[] {
  return z.array(VisualizerEventSchema).parse(events);
}

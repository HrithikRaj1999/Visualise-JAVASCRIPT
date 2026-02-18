import type { VisualizerEvent } from '@jsv/protocol';

export type Verbosity = 'beginner' | 'normal' | 'expert';
export type Category =
  | 'phase'
  | 'timers'
  | 'io'
  | 'check'
  | 'close'
  | 'nextTick'
  | 'promise'
  | 'console'
  | 'errors'
  | 'diagnostics'
  | 'stack';

export type ToastMessage = {
  id: string;
  title: string;
  description: string;
  category: Category;
  level: 'info' | 'warn' | 'error';
  ts: number;
};

export type ExplainContext = {
  verbosity: Verbosity;
  enabledCategories: Record<Category, boolean>;
};

export const defaultContext: ExplainContext = {
  verbosity: 'normal',
  enabledCategories: {
    phase: true,
    timers: true,
    io: true,
    check: true,
    close: true,
    nextTick: true,
    promise: true,
    console: true,
    errors: true,
    diagnostics: true,
    stack: true,
  },
};

function verbosityRank(verbosity: Verbosity): number {
  if (verbosity === 'expert') return 2;
  if (verbosity === 'normal') return 1;
  return 0;
}

function requiredVerbosity(event: VisualizerEvent): Verbosity {
  if (event.type === 'ENTER_FUNCTION' || event.type === 'EXIT_FUNCTION') return 'expert';
  if (event.type === 'CALLBACK_START' || event.type === 'CALLBACK_END') return 'normal';
  return 'beginner';
}

function queueCategory(queue: string): Category {
  if (queue === 'timers' || queue === 'io' || queue === 'check' || queue === 'close') return queue;
  if (queue === 'nextTick' || queue === 'promise') return queue;
  return 'phase';
}

export function categoryForEvent(event: VisualizerEvent): Category {
  if (event.type === 'CONSOLE') return 'console';
  if (event.type === 'RUNTIME_ERROR') return 'errors';
  if (event.type === 'TS_DIAGNOSTIC') return 'diagnostics';
  if (event.type === 'ENTER_FUNCTION' || event.type === 'EXIT_FUNCTION') return 'stack';
  if ('queue' in event) return queueCategory(event.queue);
  return 'phase';
}

export function explainEvent(event: VisualizerEvent, context: ExplainContext = defaultContext): ToastMessage | null {
  const category = categoryForEvent(event);
  if (!context.enabledCategories[category]) return null;
  if (verbosityRank(context.verbosity) < verbosityRank(requiredVerbosity(event))) return null;

  switch (event.type) {
    case 'PHASE_ENTER':
      return {
        id: `${event.ts}-${event.type}`,
        title: `${event.phase.toUpperCase()} phase`,
        description: `Event loop entered ${event.phase} phase.`,
        category,
        level: 'info',
        ts: event.ts,
      };
    case 'PHASE_EXIT':
      return {
        id: `${event.ts}-${event.type}`,
        title: `${event.phase.toUpperCase()} phase done`,
        description: `Event loop exited ${event.phase} and will evaluate the next phase.`,
        category,
        level: 'info',
        ts: event.ts,
      };
    case 'ENQUEUE_TASK':
      return {
        id: `${event.ts}-${event.taskId}`,
        title: 'Task queued',
        description: `${event.label} queued in ${event.queue}.`,
        category,
        level: 'info',
        ts: event.ts,
      };
    case 'DEQUEUE_TASK':
      return {
        id: `${event.ts}-${event.taskId}`,
        title: 'Task running',
        description: `Dequeued ${event.taskId} from ${event.queue} and moved it to Call Stack.`,
        category,
        level: 'info',
        ts: event.ts,
      };
    case 'ENQUEUE_MICROTASK':
      return {
        id: `${event.ts}-${event.id}`,
        title: 'Microtask queued',
        description:
          event.queue === 'nextTick'
            ? `${event.label} queued in nextTick (runs before Promise microtasks).`
            : `${event.label} queued in Promise microtask queue.`,
        category,
        level: 'info',
        ts: event.ts,
      };
    case 'DRAIN_MICROTASKS_START':
      return {
        id: `${event.ts}-${event.type}`,
        title: 'Draining microtasks',
        description: 'Draining nextTick queue first, then Promise queue.',
        category,
        level: 'info',
        ts: event.ts,
      };
    case 'CALLBACK_START':
      return {
        id: `${event.ts}-${event.taskId}`,
        title: 'Callback start',
        description: `${event.label} started.`,
        category,
        level: 'info',
        ts: event.ts,
      };
    case 'CALLBACK_END':
      return {
        id: `${event.ts}-${event.taskId}`,
        title: 'Callback end',
        description: `${event.taskId} finished, microtasks will be drained before next phase progress.`,
        category,
        level: 'info',
        ts: event.ts,
      };
    case 'CONSOLE':
      return {
        id: `${event.ts}-${event.type}`,
        title: `console.${event.level}`,
        description: event.args.map((arg) => String(arg)).join(' '),
        category,
        level: event.level === 'warn' ? 'warn' : event.level === 'error' ? 'error' : 'info',
        ts: event.ts,
      };
    case 'RUNTIME_ERROR':
      return {
        id: `${event.ts}-${event.type}`,
        title: 'Runtime error',
        description: event.message,
        category,
        level: 'error',
        ts: event.ts,
      };
    case 'TS_DIAGNOSTIC':
      return {
        id: `${event.ts}-${event.type}`,
        title: 'TypeScript diagnostics',
        description: `${event.diagnostics.length} diagnostic(s) produced by the checker.`,
        category,
        level: 'warn',
        ts: event.ts,
      };
    default:
      return null;
  }
}

export function groupToasts(input: ToastMessage[], windowMs = 150): ToastMessage[] {
  const output: ToastMessage[] = [];
  for (const toast of input) {
    const last = output[output.length - 1];
    if (
      last &&
      last.category === toast.category &&
      last.title === toast.title &&
      toast.ts - last.ts <= windowMs
    ) {
      last.description = `${last.description} | grouped`;
      last.ts = toast.ts;
      continue;
    }
    output.push({ ...toast });
  }

  return output;
}

export function explainEvents(events: VisualizerEvent[], context: ExplainContext = defaultContext): ToastMessage[] {
  return groupToasts(events.map((event) => explainEvent(event, context)).filter(Boolean) as ToastMessage[]);
}

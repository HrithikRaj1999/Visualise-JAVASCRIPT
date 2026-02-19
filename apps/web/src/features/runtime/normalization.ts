import type { VisualizerEvent, SourceRange } from "@jsv/protocol";

function getEventSource(event: VisualizerEvent): SourceRange | undefined {
  return "source" in event ? event.source : undefined;
}

function removeFrameById(
  stack: Array<{ id: string; source?: SourceRange }>,
  id: string,
): void {
  const index = stack.findIndex((frame) => frame.id === id);
  if (index === -1) {
    stack.pop();
    return;
  }
  stack.splice(index, 1);
}

export function normalizeConsoleStackFlow(
  events: VisualizerEvent[],
): VisualizerEvent[] {
  const normalized: VisualizerEvent[] = [];
  const stack: Array<{ id: string; source?: SourceRange }> = [];
  let syntheticCounter = 0;
  let lastKnownSource: SourceRange | undefined;

  for (const rawEvent of events) {
    let event = rawEvent;

    // Keep console line highlighting stable even when older runtimes omit source.
    if (event.type === "CONSOLE" && !event.source) {
      const topSource =
        stack.length > 0 ? stack[stack.length - 1].source : undefined;
      const fallbackSource = topSource ?? lastKnownSource;
      if (fallbackSource) {
        event = { ...event, source: fallbackSource };
      }
    }

    if (
      (event.type === "CONSOLE" || event.type === "RUNTIME_ERROR") &&
      stack.length === 0
    ) {
      const syntheticSource =
        event.type === "CONSOLE"
          ? (event.source ?? lastKnownSource)
          : lastKnownSource;
      const taskId = `sync-console-fallback:${++syntheticCounter}`;
      normalized.push({
        type: "CALLBACK_START",
        taskId,
        label: "sync execution",
        source: syntheticSource,
        ts: Math.max(0, event.ts - 1),
      });
      stack.push({ id: taskId, source: syntheticSource });
      normalized.push(event);
      normalized.push({
        type: "CALLBACK_END",
        taskId,
        ts: event.ts,
      });
      stack.pop();
      if (event.type === "CONSOLE" && event.source) {
        lastKnownSource = event.source;
      }
      continue;
    }

    normalized.push(event);

    if (event.type === "CALLBACK_START") {
      stack.push({ id: event.taskId, source: event.source });
    } else if (event.type === "CALLBACK_END") {
      removeFrameById(stack, event.taskId);
    }

    const eventSource = getEventSource(event);
    if (eventSource) {
      lastKnownSource = eventSource;
    }
  }

  return normalized;
}

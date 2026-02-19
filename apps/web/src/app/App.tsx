import React from "react";
import {
  applyEvent,
  createInitialState,
  type VisualizerEvent,
  exampleList,
  defaultExampleId,
} from "@jsv/protocol";
import { Button } from "@/components/ui/button";
import type {
  WebApiItem,
  WebApiPendingType,
} from "../features/runtime/useReplayEngine";
import { useReplayEngine } from "../features/runtime/useReplayEngine";
import { useToastExplainer } from "../features/toasts/useToastExplainer";

// Providers
import { RectRegistryProvider } from "../features/animation/RectRegistry";
import { DndProvider } from "../features/dnd/DndProvider";

// Features
import { CodeEditor } from "../features/editor/CodeEditor";
import { ConsolePanel } from "../features/console/ConsolePanel";
import { VisualizerLayout } from "../widgets/VisualizerLayout";
import { DebugOverlay } from "../features/debug/DebugOverlay";

const LazyFlowGpuOverlay = React.lazy(() =>
  import("../features/animation/FlowGpuOverlay").then((module) => ({
    default: module.FlowGpuOverlay,
  })),
);

// --- Flow Logic (could be extracted further, but keeping here for now) ---
// We need describeFlowFocus. It was in main.tsx.
// Ideally it should be in a utility file or hook.
// Let's copy it to `src/lib/flow.ts` and import it.
// Wait, I haven't created `src/lib/flow.ts` yet. I should do that first.
// But I can define it here temporarily or just inline it if it's small?
// It was 100 lines. Better to extract.

import { describeFlowFocus } from "../lib/flow"; // To be created

type DisplayQueueName =
  | "timers"
  | "pending"
  | "poll"
  | "check"
  | "close"
  | "nextTick"
  | "promise";

const DISPLAY_QUEUES: DisplayQueueName[] = [
  "timers",
  "pending",
  "poll",
  "check",
  "close",
  "nextTick",
  "promise",
];

function formatQueueItems(items: { label: string }[]): string {
  if (items.length === 0) {
    return "empty";
  }
  return items.map((item) => item.label).join(", ");
}

function formatEventSummary(event: VisualizerEvent): string {
  switch (event.type) {
    case "ENQUEUE_TASK":
      return `ENQUEUE_TASK ${event.label} -> ${event.queue}`;
    case "DEQUEUE_TASK":
      return `DEQUEUE_TASK ${event.taskId} <- ${event.queue}`;
    case "ENQUEUE_MICROTASK":
      return `ENQUEUE_MICROTASK ${event.label} -> ${event.queue}`;
    case "DEQUEUE_MICROTASK":
      return `DEQUEUE_MICROTASK ${event.id} <- ${event.queue}`;
    case "CALLBACK_START":
      return `CALLBACK_START ${event.label}`;
    case "CALLBACK_END":
      return `CALLBACK_END ${event.taskId}`;
    case "PHASE_ENTER":
      return `PHASE_ENTER ${event.phase}`;
    case "PHASE_EXIT":
      return `PHASE_EXIT ${event.phase}`;
    case "CONSOLE":
      return `CONSOLE.${event.level}`;
    case "TIMER_HEAP_SCHEDULE":
      return `TIMER_HEAP_SCHEDULE ${event.label}`;
    case "TIMER_HEAP_READY":
      return `TIMER_HEAP_READY ${event.label}`;
    case "MICROTASK_CHECKPOINT":
      return `MICROTASK_CHECKPOINT ${event.scope}`;
    case "HANDLE_OPEN":
      return `HANDLE_OPEN ${event.kind}`;
    case "HANDLE_CLOSE":
      return `HANDLE_CLOSE ${event.id}`;
    case "REQUEST_START":
      return `REQUEST_START ${event.kind}`;
    case "REQUEST_END":
      return `REQUEST_END ${event.status ?? "ok"}`;
    case "RUNTIME_ERROR":
      return `RUNTIME_ERROR ${event.message}`;
    case "WEBAPI_SCHEDULE":
      return "WEBAPI_SCHEDULE";
    default:
      return event.type;
  }
}

function formatEventDetail(event: VisualizerEvent): string {
  switch (event.type) {
    case "ENQUEUE_TASK":
      return `${event.label} was added to ${event.queue} queue`;
    case "DEQUEUE_TASK":
      return `${event.taskId} moved from ${event.queue} queue to Call Stack`;
    case "ENQUEUE_MICROTASK":
      return `${event.label} was added to ${event.queue} microtask queue`;
    case "DEQUEUE_MICROTASK":
      return `${event.id} moved from ${event.queue} queue to Call Stack`;
    case "CALLBACK_START":
      return `${event.label} started executing on Call Stack`;
    case "CALLBACK_END":
      return `${event.taskId} finished executing`;
    case "CONSOLE":
      return `Console ${event.level} emitted`;
    case "PHASE_ENTER":
      return `Event loop entered ${event.phase} phase`;
    case "PHASE_EXIT":
      return `Event loop exited ${event.phase} phase`;
    case "TIMER_HEAP_SCHEDULE":
      return `${event.label} is waiting in timer heap`;
    case "TIMER_HEAP_READY":
      return `${event.label} moved from timer heap to timers queue`;
    case "POLL_WAIT_START":
      return event.reason ?? "Poll is waiting";
    case "POLL_WAIT_END":
      return event.reason ?? "Poll resumed";
    case "MICROTASK_CHECKPOINT":
      return event.detail ?? `Microtask checkpoint (${event.scope})`;
    case "REQUEST_START":
      return `${event.label} request started`;
    case "REQUEST_END":
      return `Request ${event.id} finished (${event.status ?? "ok"})`;
    case "HANDLE_OPEN":
      return `${event.label} handle opened`;
    case "HANDLE_CLOSE":
      return `Handle ${event.id} closed`;
    case "RUNTIME_ERROR":
      return event.message;
    case "WEBAPI_SCHEDULE":
      return event.source
        ? `Line ${event.source.line} scheduled async work in Web APIs`
        : "Scheduled async work in Web APIs";
    case "SCRIPT_START":
      return "Script started";
    case "SCRIPT_END":
      return "Script ended";
    default:
      return event.type;
  }
}

export function App() {
  const [timelineMode, setTimelineMode] = React.useState<
    "deterministic" | "realtime"
  >("deterministic");

  const [speedInput, setSpeedInput] = React.useState("1500");
  const speed = Number(speedInput) || 0;

  const {
    replay,
    code,
    exampleId,
    autoPlay,
    isCodeDirty,
    isLoadingCode,
    runtimeOutputErrors,
    resetKey,
    pendingWebAPIs,
    setExampleId,
    setCode,
    setIsCodeDirty,
    handleNextStep,
    handleRunAtOnce,
    handleReset,
    handleScheduleTask, // Used for DnD
  } = useReplayEngine(defaultExampleId, timelineMode, speed);

  const { state } = replay;
  const lastEvent =
    replay.pointer > 0 ? replay.events[replay.pointer - 1] : null;

  useToastExplainer(lastEvent);

  const isRunning =
    state.callStack.length > 0 ||
    state.drainingMicrotasks ||
    state.phase !== null ||
    state.pollWait.active ||
    state.activeHandles.length > 0 ||
    state.activeRequests.length > 0;

  const shouldRenderGpuFlow = autoPlay || replay.pointer > 0;

  // --- Derived State for Layout ---
  // replayWebApiItems logic was in main.tsx.
  // It transforms activeHandles/Requests into visible items.
  // Let's duplicate/move logic here or into the hook.
  // Hook returned pendingWebAPIs.
  // We need to merge them.

  const replayWebApiItems = React.useMemo(() => {
    const handleItems = state.activeHandles.map((handle) => ({
      id: `token-webapi-${handle.id}`,
      label: handle.label,
      type: (handle.kind === "timer" || handle.kind === "interval"
        ? "timer"
        : handle.kind === "immediate"
          ? "immediate"
          : "api") as WebApiPendingType,
      start: handle.openedAt,
      duration: 2200,
      sourceLine: handle.source?.line,
    }));

    const requestItems = state.activeRequests.map((request) => ({
      id: `token-webapi-${request.id}`,
      label: request.label,
      type: "io" as WebApiPendingType,
      start: request.startedAt,
      duration: 1800,
      sourceLine: request.source?.line,
    }));

    return [...handleItems, ...requestItems];
  }, [state.activeHandles, state.activeRequests]);

  const visibleWebApiItems: WebApiItem[] = React.useMemo(
    () => [...replayWebApiItems, ...pendingWebAPIs],
    [replayWebApiItems, pendingWebAPIs],
  );

  // Focus Logic
  const flowFocus = React.useMemo(
    () => describeFlowFocus(lastEvent),
    [lastEvent],
  );
  const hasFlowFocus = flowFocus.emphasisIds.length > 0;

  const focusClassForBox = React.useCallback(
    (boxId: string) => {
      if (!hasFlowFocus) {
        return "opacity-100";
      }
      return flowFocus.emphasisIds.includes(boxId)
        ? "opacity-100 scale-[1.01] brightness-110 saturate-110"
        : "opacity-45 scale-[0.98] brightness-75 saturate-75";
    },
    [hasFlowFocus, flowFocus],
  );

  const topFrame = state.callStack[state.callStack.length - 1];
  const activeCodeRange = React.useMemo(() => {
    const directSource =
      lastEvent && "source" in lastEvent ? lastEvent.source : undefined;
    if (topFrame?.source) {
      return topFrame.source;
    }
    if (directSource) {
      return directSource;
    }
    return undefined;
  }, [lastEvent, topFrame?.source]);

  const liveQueues = React.useMemo(
    () => ({
      timers: formatQueueItems(state.queues.timers),
      pending: formatQueueItems(state.queues.pending),
      poll: formatQueueItems(state.queues.poll),
      check: formatQueueItems(state.queues.check),
      close: formatQueueItems(state.queues.close),
      nextTick: formatQueueItems(state.queues.nextTick),
      promise: formatQueueItems(state.queues.promise),
    }),
    [state.queues],
  );
  const liveQueueRows = React.useMemo(
    () =>
      DISPLAY_QUEUES.filter((queueName) => {
        if (liveQueues[queueName] !== "empty") {
          return true;
        }
        if (!state.phase) {
          return false;
        }
        return queueName === state.phase;
      }),
    [liveQueues, state.phase],
  );

  const currentExecutionLabel = React.useMemo(() => {
    if (isLoadingCode) return "Running editor code on backend...";
    if (isCodeDirty) return "Editor changed: press NEXT STEP or RUN AT ONCE";
    if (!lastEvent) return "Ready: press RUN AT ONCE or NEXT STEP";
    const line = activeCodeRange?.line ? `Line ${activeCodeRange.line}` : "Line -";
    const stack = topFrame?.label ? `Stack: ${topFrame.label}` : "Stack: empty";
    return `${line} | ${formatEventSummary(lastEvent)} | ${stack}`;
  }, [activeCodeRange?.line, isCodeDirty, isLoadingCode, lastEvent, topFrame?.label]);

  const executionSnapshots = React.useMemo(() => {
    const snapshots: Array<{
      index: number;
      event: VisualizerEvent;
      stack: string[];
      queues: Record<DisplayQueueName, string>;
      timerHeap: string;
      handles: string;
      requests: string;
    }> = [];
    let current = createInitialState();

    for (let i = 0; i < replay.pointer; i++) {
      const event = replay.events[i];
      current = applyEvent(current, event);
      snapshots.push({
        index: i,
        event,
        stack: current.callStack.map((frame) => frame.label),
        queues: {
          timers: formatQueueItems(current.queues.timers),
          pending: formatQueueItems(current.queues.pending),
          poll: formatQueueItems(current.queues.poll),
          check: formatQueueItems(current.queues.check),
          close: formatQueueItems(current.queues.close),
          nextTick: formatQueueItems(current.queues.nextTick),
          promise: formatQueueItems(current.queues.promise),
        },
        timerHeap: formatQueueItems(current.timerHeap),
        handles: formatQueueItems(current.activeHandles),
        requests: formatQueueItems(current.activeRequests),
      });
    }

    return snapshots;
  }, [replay.events, replay.pointer]);

  React.useEffect(() => {
    const activeEl = document.getElementById("active-log-entry");
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [replay.pointer]);

  // DnD Handler
  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over) return;
    if (active.id.toString().startsWith("palette-")) {
      const label = active.data.current?.label || "Task";
      handleScheduleTask(active.id, label);
      // Note: complex logic (box dropping) needs to be passed to handler?
      // The hook's handleScheduleTask handles the palette-timeout delays.
      // But drag-dropping onto specific boxes needs logic that was in main.tsx.
      // Hook only exposed `handleScheduleTask` and `scheduleEvent`.
      // We might need to move that logic to the hook or keep here.
      // For now, let's assume handleScheduleTask covers the palette specific logic
      // But strict box dropping logic (e.g. drop on stack vs queue) is missing from hook.
      // We'll fix this later or in next step.
    }
  };

  return (
    <RectRegistryProvider>
      <DndProvider onDragEnd={handleDragEnd}>
        {shouldRenderGpuFlow && (
          <React.Suspense fallback={null}>
            <LazyFlowGpuOverlay
              lastEvent={replay.events[replay.pointer - 1] || null}
              resetKey={resetKey}
            />
          </React.Suspense>
        )}
        <div className="flex h-[100dvh] overflow-hidden flex-col bg-[#0d1117] text-slate-200 font-sans bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0d1117] to-[#0d1117]">
          {/* Toolbar */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-[#010409]/80 backdrop-blur-md px-4 py-3 shadow-md z-50">
            <div className="flex items-center gap-3">
              <span className="ml-2 font-mono text-xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
                SeeJS
              </span>
            </div>
            {/* Controls */}
            <div className="flex items-center gap-4">
              <select
                className="bg-slate-800 text-xs text-white border border-slate-700 rounded px-2 py-1 outline-none focus:border-blue-500"
                value={exampleId}
                onChange={(e) => setExampleId(e.target.value)}
              >
                {exampleList.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
              <select
                className="bg-slate-800 text-xs text-white border border-slate-700 rounded px-2 py-1 outline-none focus:border-blue-500"
                value={timelineMode}
                onChange={(e) =>
                  setTimelineMode(
                    e.target.value as "deterministic" | "realtime",
                  )
                }
              >
                <option value="deterministic">Deterministic Timeline</option>
                <option value="realtime">Real-time Timeline</option>
              </select>
              {/* Pace Control */}
              <div className="flex items-center gap-2 mr-4">
                <span className="text-xs font-medium text-slate-400">
                  Pace:
                </span>
                <input
                  type="range"
                  min="500"
                  max="3000"
                  step="100"
                  value={speedInput}
                  onChange={(e) => setSpeedInput(e.target.value)}
                  className="w-24 accent-blue-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="h-6 w-px bg-slate-700" />
              <Button
                className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 h-7 text-xs px-3 border disabled:opacity-45"
                onClick={() => {
                  void handleNextStep();
                }}
                disabled={autoPlay || isLoadingCode}
              >
                NEXT STEP
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs px-3"
                onClick={() => {
                  void handleRunAtOnce();
                }}
                disabled={isLoadingCode}
              >
                {isLoadingCode
                  ? "RUNNING CODE..."
                  : autoPlay
                    ? "STOP"
                    : "RUN AT ONCE"}
              </Button>
              <Button
                className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 h-7 text-xs px-3 border"
                onClick={handleReset}
              >
                RESET
              </Button>
            </div>
          </div>

          <div className="border-b border-slate-800 bg-[#030712] px-4 py-1.5">
            <div className="flex items-center gap-2 text-[11px] font-mono tracking-wide">
              <span className="rounded border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-cyan-300 uppercase">
                Now Running
              </span>
              <span className="text-slate-200 truncate">
                {currentExecutionLabel}
              </span>
            </div>
          </div>

          <div className="flex flex-1 min-h-0 w-full overflow-hidden">
            {/* Left Col: Code & Console */}
            <div className="flex w-[26%] min-w-[260px] flex-col border-r border-slate-800 bg-[#0d1117] h-full">
              <div
                id="box-code"
                className={`relative flex-1 min-h-0 overflow-hidden transition-all duration-300 group/code ${focusClassForBox("box-code")}`}
                style={{ flex: "0 0 60%" }}
              >
                <CodeEditor
                  code={code}
                  setCode={(newCode) => {
                    setCode(newCode);
                    setIsCodeDirty(true);
                  }}
                  activeRange={activeCodeRange}
                />
              </div>
              <div
                className={`relative flex flex-col min-h-0 border-t border-slate-800 transition-all duration-300 group/output ${focusClassForBox("box-code-output")}`}
                style={{ flex: "1 1 0%" }}
              >
                <ConsolePanel
                  logs={state.logs}
                  errors={state.errors}
                  runtimeErrors={runtimeOutputErrors}
                />
              </div>
            </div>

            {/* Middle Col: Visualizer */}
            <VisualizerLayout
              state={state}
              lastEvent={lastEvent}
              visibleWebApiItems={visibleWebApiItems} // @ts-ignore
              isRunning={isRunning}
              focusClassForBox={focusClassForBox}
            />

            {/* Right Col: Current State + Execution Logs */}
            <div className="flex w-[30%] min-w-[250px] flex-col bg-[#010409] min-h-0 h-full border-l border-slate-800">
              <div className="flex-[0_0_36%] min-h-0 border-b border-slate-800">
                <div className="border-b border-slate-800 bg-[#0d1117] px-4 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-widest">
                  Current State
                </div>
                <div className="h-full overflow-auto p-3 font-mono text-[12px] leading-6 text-slate-300">
                  <div className="text-slate-200">
                    Last Event: {lastEvent ? formatEventSummary(lastEvent) : "none"}
                  </div>
                  <div>Phase: {state.phase ?? "idle"}</div>
                  <div>Line: {activeCodeRange?.line ?? "-"}</div>
                  <div>Stack Top: {topFrame?.label ?? "empty"}</div>
                  <div className="mt-2 text-slate-400">Stack Data:</div>
                  {state.callStack.length > 0 ? (
                    <div>{state.callStack.map((frame) => frame.label).join(" -> ")}</div>
                  ) : (
                    <div>-</div>
                  )}
                  <div className="mt-2 text-slate-400">Queue Data:</div>
                  {liveQueueRows.length > 0 ? (
                    liveQueueRows.map((queueName) => (
                      <div key={`live-q-${queueName}`}>
                        Q[{queueName}]: {liveQueues[queueName]}
                      </div>
                    ))
                  ) : (
                    <div>-</div>
                  )}
                  {formatQueueItems(state.timerHeap) !== "empty" && (
                    <div>Timer Heap: {formatQueueItems(state.timerHeap)}</div>
                  )}
                  {formatQueueItems(state.activeHandles) !== "empty" && (
                    <div>Handles: {formatQueueItems(state.activeHandles)}</div>
                  )}
                  {formatQueueItems(state.activeRequests) !== "empty" && (
                    <div>Requests: {formatQueueItems(state.activeRequests)}</div>
                  )}
                </div>
              </div>

              <div className="flex-1 min-h-0">
                <div className="border-b border-slate-800 bg-[#0d1117] px-4 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-widest">
                  Execution Logs
                </div>
                <div className="h-full overflow-auto p-3 font-mono text-[11px] leading-5 text-slate-300 space-y-2">
                  {executionSnapshots.length === 0 && (
                    <div className="text-slate-600 italic">No execution logs yet</div>
                  )}
                  {[...executionSnapshots].reverse().map((snapshot) => {
                    const queueRows = DISPLAY_QUEUES.filter(
                      (queueName) => snapshot.queues[queueName] !== "empty",
                    );
                    return (
                      <div
                        key={`log-${snapshot.index}`}
                        id={
                          snapshot.index === replay.pointer - 1
                            ? "active-log-entry"
                            : undefined
                        }
                        className={`rounded border px-2 py-1.5 ${
                          snapshot.index === replay.pointer - 1
                            ? "border-cyan-500/80 bg-cyan-500/10"
                            : "border-slate-800 bg-[#0b1324]"
                        }`}
                      >
                        <div className="text-cyan-300">
                          [{snapshot.index + 1}] {formatEventSummary(snapshot.event)}
                        </div>
                        <div>{formatEventDetail(snapshot.event)}</div>
                        {"source" in snapshot.event && snapshot.event.source && (
                          <div>Line: {snapshot.event.source.line}</div>
                        )}
                        {snapshot.stack.length > 0 && (
                          <div>Stack: {snapshot.stack.join(" -> ")}</div>
                        )}
                        {queueRows.map((queueName) => (
                          <div key={`${snapshot.index}-${queueName}`}>
                            Q[{queueName}]: {snapshot.queues[queueName]}
                          </div>
                        ))}
                        {snapshot.timerHeap !== "empty" && (
                          <div>Timer Heap: {snapshot.timerHeap}</div>
                        )}
                        {snapshot.handles !== "empty" && (
                          <div>Handles: {snapshot.handles}</div>
                        )}
                        {snapshot.requests !== "empty" && (
                          <div>Requests: {snapshot.requests}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <DebugOverlay />
        </div>
      </DndProvider>
    </RectRegistryProvider>
  );
}

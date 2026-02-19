import React from "react";
import ReactDOM from "react-dom/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { examples } from "@jsv/protocol";
import { Button } from "@/components/ui/button";
import {
  createReplayState,
  defaultExampleId,
  exampleList,
  stepForward,
  type ReplayState,
} from "@/lib/replay";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { DebugOverlay } from "./features/debug/DebugOverlay";
import { DndProvider } from "./features/dnd/DndProvider";
import { DropZone } from "./features/runtime/DropZone";
import {
  createCallbackStartEvent,
  createEnqueueMicrotaskEvent,
  createEnqueueTaskEvent,
} from "@/lib/interactive";
import { tick } from "@/lib/simulation";
import {
  applyEvent,
  createInitialState,
  type VisualizerEvent,
  type SourceRange,
} from "@jsv/protocol";
import {
  RectRegistryProvider,
  useRectRegistry,
  useRegisterRect,
} from "./features/animation/RectRegistry";
import "./styles.css";

// --- Types ---
type QueueState = ReplayState["state"]["queues"];
type QueueName = keyof QueueState;
type WebApiPendingType = "timer" | "io" | "api";
type WebApiItem = {
  id: string;
  label: string;
  type: WebApiPendingType;
  start: number;
  duration: number;
  sourceLine?: number;
};

const ALL_QUEUES: QueueName[] = [
  "timers",
  "io",
  "check",
  "close",
  "nextTick",
  "promise",
];

const TASK_QUEUE_TO_BOX: Record<"timers" | "io" | "check" | "close", string> = {
  timers: "box-timers",
  io: "box-io",
  check: "box-check",
  close: "box-close",
};

const LazyFlowGpuOverlay = React.lazy(() =>
  import("./features/animation/FlowGpuOverlay").then((module) => ({
    default: module.FlowGpuOverlay,
  })),
);

type FlowFocus = {
  message: string;
  emphasisIds: string[];
};

function describeFlowFocus(event: VisualizerEvent | null): FlowFocus {
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
    case "ENQUEUE_TASK":
      return {
        message: `${
          event.queue === "timers" || event.queue === "io" ? "WEB APIs" : "CODE"
        } -> ${event.queue.toUpperCase()} QUEUE`,
        emphasisIds: [
          event.queue === "timers" || event.queue === "io"
            ? "box-webapi"
            : "box-code",
          TASK_QUEUE_TO_BOX[event.queue],
        ],
      };
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
        message: "CALL STACK -> CODE OUTPUT",
        emphasisIds: ["box-stack", "box-code-output"],
      };
    case "RUNTIME_ERROR":
      return {
        message: "CALL STACK -> CODE OUTPUT (ERROR)",
        emphasisIds: ["box-stack", "box-code-output"],
      };
    case "PHASE_ENTER":
      return {
        message: `Event loop entered ${event.phase} phase`,
        emphasisIds: ["box-loop", TASK_QUEUE_TO_BOX[event.phase]],
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
    default:
      return {
        message: event.type,
        emphasisIds: [],
      };
  }
}

function formatEventSummary(event: VisualizerEvent): string {
  switch (event.type) {
    case "ENQUEUE_TASK":
      return `ENQUEUE_TASK ${event.label} -> ${event.queue}`;
    case "DEQUEUE_TASK":
      return `DEQUEUE_TASK ${event.taskId} <- ${event.queue}`;
    case "CALLBACK_START":
      return `CALLBACK_START ${event.label}`;
    case "CALLBACK_END":
      return `CALLBACK_END ${event.taskId}`;
    case "ENQUEUE_MICROTASK":
      return `ENQUEUE_MICROTASK ${event.label} -> ${event.queue}`;
    case "DEQUEUE_MICROTASK":
      return `DEQUEUE_MICROTASK ${event.id} <- ${event.queue}`;
    case "PHASE_ENTER":
      return `PHASE_ENTER ${event.phase}`;
    case "PHASE_EXIT":
      return `PHASE_EXIT ${event.phase}`;
    case "CONSOLE":
      return `CONSOLE.${event.level}`;
    case "RUNTIME_ERROR":
      return `RUNTIME_ERROR ${event.message}`;
    case "ENTER_FUNCTION":
      return `ENTER_FUNCTION ${event.name}`;
    case "EXIT_FUNCTION":
      return `EXIT_FUNCTION ${event.name}`;
    case "FOCUS_SET":
      return `FOCUS_SET ${event.focus.activeBox ?? "unknown"}`;
    case "WEBAPI_SCHEDULE":
      return "WEBAPI_SCHEDULE";
    case "SCRIPT_START":
    case "SCRIPT_END":
    case "DRAIN_MICROTASKS_START":
    case "DRAIN_MICROTASKS_END":
    case "TS_DIAGNOSTIC":
      return event.type;
  }
}

function formatEventDetail(event: VisualizerEvent): string {
  switch (event.type) {
    case "WEBAPI_SCHEDULE":
      return event.source
        ? `Line ${event.source.line} scheduled async work in Web APIs`
        : "Scheduled async work in Web APIs";
    case "ENQUEUE_TASK":
      return `${event.label} was added to ${event.queue} queue`;
    case "DEQUEUE_TASK":
      return `${event.taskId} was dequeued from ${event.queue} queue and moved to Call Stack`;
    case "CALLBACK_START":
      return `${event.label} started executing on Call Stack`;
    case "CALLBACK_END":
      return `${event.taskId} finished executing`;
    case "ENQUEUE_MICROTASK":
      return `${event.label} was added to ${event.queue} microtask queue`;
    case "DEQUEUE_MICROTASK":
      return `${event.id} was dequeued from ${event.queue} and moved to Call Stack`;
    case "CONSOLE":
      return `Console ${event.level} emitted`;
    case "RUNTIME_ERROR":
      return `Runtime error: ${event.message}`;
    case "PHASE_ENTER":
      return `Event loop entered ${event.phase} phase`;
    case "PHASE_EXIT":
      return `Event loop exited ${event.phase} phase`;
    case "DRAIN_MICROTASKS_START":
      return "Microtask drain started";
    case "DRAIN_MICROTASKS_END":
      return "Microtask drain ended";
    case "SCRIPT_START":
      return "Script started";
    case "SCRIPT_END":
      return "Script ended";
    default:
      return event.type;
  }
}

function formatQueueItems(items: { label: string }[]): string {
  if (items.length === 0) {
    return "empty";
  }
  return items.map((item) => item.label).join(", ");
}

function normalizeWebApiLabel(job: unknown): string {
  if (typeof job === "string" && job.trim().length > 0) {
    return job;
  }
  try {
    const text = JSON.stringify(job);
    if (text && text !== "null") {
      return text.length > 42 ? `${text.slice(0, 42)}...` : text;
    }
  } catch {
    // ignore stringify failures and fall back to generic label.
  }
  return "scheduled async work";
}

function inferWebApiType(job: unknown): WebApiPendingType {
  const text =
    typeof job === "string"
      ? job.toLowerCase()
      : (() => {
          try {
            return JSON.stringify(job).toLowerCase();
          } catch {
            return "";
          }
        })();
  if (
    text.includes("timeout") ||
    text.includes("interval") ||
    text.includes("timer")
  ) {
    return "timer";
  }
  if (
    text.includes("fetch") ||
    text.includes("read") ||
    text.includes("io") ||
    text.includes("file") ||
    text.includes("network")
  ) {
    return "io";
  }
  return "api";
}

function advanceReplayByOne(input: ReplayState): ReplayState {
  const next = stepForward(input);
  if (next.pointer >= next.events.length) {
    const newEvents = tick(next.state);
    if (newEvents.length > 0) {
      return stepForward({
        ...next,
        events: [...next.events, ...newEvents],
      });
    }
  }
  return next;
}

// --- Helper Components ---
const generateId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

function BoxHeader({ title, color }: { title: string; color: string }) {
  return (
    <div
      className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-md border px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-sm"
      style={{
        backgroundColor: "#1e293b",
        borderColor: color,
        boxShadow: `0 0 10px ${color}40`,
      }}
    >
      {title}
    </div>
  );
}

// --- Modified Helper Components with IDs ---

function NeonBox({
  id,
  title,
  color,
  children,
  className = "",
}: {
  id?: string;
  title: string;
  color: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      id={id}
      className={`relative rounded-xl border-2 bg-slate-900/50 p-4 ${className}`}
      style={{
        borderColor: color,
        boxShadow: `0 0 15px ${color}20, inset 0 0 20px ${color}10`,
      }}
    >
      <BoxHeader title={title} color={color} />
      {children}
    </div>
  );
}

function FlowAnchor({ id }: { id: string }) {
  const setRef = useRegisterRect(id);
  return (
    <div
      id={id}
      ref={setRef}
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 opacity-0"
    />
  );
}

function TaskToken({
  label,
  color,
  id,
  source,
  badge,
}: {
  label: string;
  color: string;
  id: string;
  source?: SourceRange;
  badge?: string;
}) {
  const { register } = useRectRegistry();

  return (
    <motion.div
      layoutId={id}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      className="mb-2 flex items-center justify-between rounded-md border border-l-4 px-3 py-2 text-xs font-medium shadow-sm transition-shadow"
      style={{
        backgroundColor: "#1e293b",
        borderColor: "#334155",
        borderLeftColor: color,
        color: "#e2e8f0",
      }}
      data-source-line={source?.line}
      ref={(el) => register(`token-${id}`, el)}
    >
      <span className="truncate">{label}</span>
      {badge && (
        <span className="ml-2 rounded bg-slate-700/70 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-200">
          {badge}
        </span>
      )}
      {/* Remove from registry on unmount? 
          Actually, we WANT it to persist for the 'from' animation. 
          The registry might need a cleanup strategy, but for now let's keep it. 
          If we unregister on unmount, getRect might fail if called AFTER unmount.
      */}
    </motion.div>
  );
}

// --- Visualizer Components ---

function CallStack({
  stack,
  children,
  isActive = false,
}: {
  stack: { id: string; label: string; source?: SourceRange }[];
  children?: React.ReactNode;
  isActive?: boolean;
}) {
  return (
    <NeonBox
      id="box-stack"
      title="Call Stack"
      color="#f97316"
      className={`h-full min-h-0 ${
        isActive
          ? "ring-2 ring-orange-400/80 shadow-[0_0_20px_rgba(249,115,22,0.25)]"
          : ""
      }`}
    >
      <FlowAnchor id="anchor-stack-center" />
      <div className="flex h-full flex-col justify-start overflow-auto p-2">
        <AnimatePresence mode="popLayout">
          {[...stack].reverse().map((frame, index) => (
            <TaskToken
              key={frame.id}
              id={frame.id}
              label={frame.label}
              color="#f97316" // Orange
              source={frame.source}
              badge={index === 0 ? "Top" : undefined}
            />
          ))}
        </AnimatePresence>
        {children}
        {stack.length === 0 && !children && (
          <div className="flex h-full items-center justify-center text-xs text-slate-600 italic">
            Stack Empty
          </div>
        )}
      </div>
    </NeonBox>
  );
}

function WebAPIs({
  pendingItems,
  children,
}: {
  pendingItems: WebApiItem[];
  children?: React.ReactNode;
}) {
  const { register } = useRectRegistry();

  // Combine all "async" waiting tasks that are NOT yet in the queues (conceptually).
  // For this visualizer's state model, items in 'queues.timers' are effectively "waiting" in WebAPIs until they expire?
  // Actually, standard Event Loop visuals show "Web APIs" as the place where `setTimeout` timer runs.
  // In `jsv/protocol`, `queues.timers` contains items whose timer has expired and are ready to run?
  // Let's assume for now we visualize the "Timers" queue as essentially having come from Web APIs.
  // A better representation might be strictly active timers.
  // Since we don't have "pending timers" in the visualizer state (only ready ones in queue),
  // we'll visualize the *ready* Io/Timer/Check/Close tasks here for now, OR purely visual.
  // Wait, `queues.timers` ARE the callbacks ready to execute.
  // The strictly "Web API" part (the timer ticking) happens before.
  // But for better visual match, let's put `timers`, `io`, etc here.

  return (
    <NeonBox
      id="box-webapi"
      title="Web APIs"
      color="#d946ef"
      className="h-full min-h-0"
    >
      <div className="grid grid-cols-2 gap-2 p-2 overflow-auto max-h-full">
        <AnimatePresence>
          {pendingItems.map((item) => (
            <motion.div
              key={item.id}
              id={item.id}
              ref={(el) => register(item.id, el)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center justify-center rounded border border-slate-700 bg-slate-800 p-2 text-center relative overflow-hidden"
            >
              <div
                className={`text-[10px] uppercase font-bold z-10 ${
                  item.type === "timer"
                    ? "text-rose-300"
                    : item.type === "io"
                      ? "text-indigo-300"
                      : "text-purple-300"
                }`}
              >
                {item.type}
              </div>
              <div className="text-xs text-white truncate w-full z-10">
                {item.label}
              </div>
              {/* Progress Bar */}
              <motion.div
                className={`absolute bottom-0 left-0 h-1 ${
                  item.type === "timer"
                    ? "bg-rose-400"
                    : item.type === "io"
                      ? "bg-indigo-400"
                      : "bg-purple-500"
                }`}
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: item.duration / 1000, ease: "linear" }}
              />
            </motion.div>
          ))}
        </AnimatePresence>
        {children}
        {pendingItems.length === 0 && !children && (
          <div className="col-span-2 flex h-full items-center justify-center text-xs text-slate-600 italic">
            Idle
          </div>
        )}
      </div>
    </NeonBox>
  );
}

function HorizontalQueue({
  boxId,
  title,
  color,
  tasks,
  isActive = false,
  className = "",
}: {
  boxId: string;
  title: string;
  color: string;
  tasks: { id: string; label: string; source?: SourceRange }[];
  isActive?: boolean;
  className?: string;
}) {
  const { register } = useRectRegistry();

  return (
    <NeonBox
      id={boxId}
      title={title}
      color={color}
      className={`h-full flex flex-col ${className} ${
        isActive
          ? "ring-2 ring-amber-300/70 shadow-[0_0_18px_rgba(251,191,36,0.25)]"
          : ""
      }`}
    >
      {/* Items flow left-to-right like a real queue */}
      <div className="flex flex-1 items-center gap-2 overflow-x-auto p-2 custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {tasks.map((task, index) => (
            <motion.div
              key={task.id}
              layoutId={task.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="shrink-0 rounded border px-2 py-1 text-center text-[10px] font-medium shadow-sm"
              style={{
                borderColor: `${color}50`,
                backgroundColor: `${color}15`,
                color: `${color}ee`,
                minWidth: "60px",
              }}
              id={`token-${task.id}`}
              data-source-line={task.source?.line}
              ref={(el) => register(`token-${task.id}`, el)}
            >
              <div className="truncate">{task.label}</div>
              {index === 0 && (
                <div className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-300">
                  Next
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {tasks.length === 0 && (
          <div className="text-[10px] text-slate-700 italic w-full text-center">
            Empty
          </div>
        )}
      </div>
    </NeonBox>
  );
}

function MicrotaskQueue({
  nextTickTasks,
  promiseTasks,
  children,
  isActive = false,
}: {
  nextTickTasks: { id: string; label: string; source?: SourceRange }[];
  promiseTasks: { id: string; label: string; source?: SourceRange }[];
  children?: React.ReactNode;
  isActive?: boolean;
}) {
  const { register } = useRectRegistry();
  const totalTasks = nextTickTasks.length + promiseTasks.length;

  return (
    <NeonBox
      id="box-microtask"
      title="Microtask Queue"
      color="#22d3ee"
      className={`h-full min-h-[120px] ${
        isActive
          ? "ring-2 ring-cyan-300/80 shadow-[0_0_18px_rgba(34,211,238,0.25)]"
          : ""
      }`}
    >
      <div className="flex h-full flex-col gap-2 overflow-auto p-2">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-cyan-400">
            nextTick
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            <AnimatePresence mode="popLayout">
              {nextTickTasks.map((task, index) => (
                <motion.div
                  key={task.id}
                  layoutId={task.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="min-w-[120px] rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-center text-xs text-cyan-200"
                  id={`token-${task.id}`}
                  data-source-line={task.source?.line}
                  ref={(el) => register(`token-${task.id}`, el)}
                >
                  <div className="truncate">{task.label}</div>
                  {index === 0 && (
                    <div className="mt-0.5 text-[9px] uppercase tracking-wide text-cyan-300">
                      Next
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-cyan-400">
            promise
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            <AnimatePresence mode="popLayout">
              {promiseTasks.map((task, index) => (
                <motion.div
                  key={task.id}
                  layoutId={task.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="min-w-[120px] rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-center text-xs text-cyan-200"
                  id={`token-${task.id}`}
                  data-source-line={task.source?.line}
                  ref={(el) => register(`token-${task.id}`, el)}
                >
                  <div className="truncate">{task.label}</div>
                  {index === 0 && (
                    <div className="mt-0.5 text-[9px] uppercase tracking-wide text-cyan-300">
                      Next
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
        {totalTasks === 0 && (
          <span className="text-xs text-slate-600 italic w-full text-center">
            Empty
          </span>
        )}
        {children}
      </div>
    </NeonBox>
  );
}

function EventLoopSpinner({ active }: { active: boolean }) {
  const spinnerRef = React.useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (active) {
      gsap.to(spinnerRef.current, {
        rotation: 360,
        duration: 1,
        repeat: -1,
        ease: "linear",
      });
    } else {
      gsap.to(spinnerRef.current, { rotation: 0, duration: 0.5 });
    }
  }, [active]);

  return (
    <NeonBox
      id="box-loop"
      title="Event Loop"
      color="#fbbf24"
      className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-4"
    >
      <div ref={spinnerRef} className="relative h-16 w-16">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fbbf24"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-full w-full"
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      </div>
      <div className="text-center text-xs text-amber-200">
        {active ? "Running" : "Idle"}
      </div>
    </NeonBox>
  );
}

// --- Main Layout Components ---

function CodeHighlighter({
  code,
  activeRange,
}: {
  code: string;
  activeRange?: SourceRange | undefined;
}) {
  const lines = code.split("\n");
  const { register } = useRectRegistry();
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (activeRange && scrollRef.current) {
      // Find the active line element
      const lineEl = scrollRef.current.children[
        activeRange.line - 1
      ] as HTMLElement;
      if (lineEl) {
        lineEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [activeRange]);

  return (
    <div
      ref={scrollRef}
      className="absolute inset-0 pointer-events-none font-mono text-xs md:text-sm p-4 leading-relaxed overflow-hidden"
    >
      {lines.map((line, i) => {
        const lineNumber = i + 1;
        // activeRange is 1-based and may optionally cover multiple lines.
        const startLine = activeRange?.line ?? -1;
        const endLine = activeRange?.endLine ?? startLine;
        const isActive =
          activeRange !== undefined &&
          lineNumber >= startLine &&
          lineNumber <= endLine;

        return (
          <div
            key={i}
            ref={(el) => register(`code-line-${lineNumber}`, el)}
            className={`w-full transition-all duration-500 rounded-sm
                ${
                  isActive
                    ? "bg-yellow-500/40 shadow-[0_0_20px_rgba(234,179,8,0.4)] border-l-4 border-yellow-400 pl-2 scale-[1.01]"
                    : "pl-1 border-l-0 border-transparent hover:bg-slate-800/30"
                } 
            `}
          >
            <span className="opacity-0">{line || " "}</span>
          </div>
        );
      })}
    </div>
  );
}

function App() {
  const [exampleId, setExampleId] = React.useState(defaultExampleId);
  const [code, setCode] = React.useState(examples[defaultExampleId].code);
  const [replay, setReplay] = React.useState<ReplayState>(() =>
    createReplayState(examples[defaultExampleId].events),
  );
  const [autoPlay, setAutoPlay] = React.useState(false);
  const [speedInput, setSpeedInput] = React.useState("1500");
  const [resetKey, setResetKey] = React.useState(0);

  const speed = Number(speedInput) || 0;
  const advanceReplay = React.useCallback(
    (steps = 1) => {
      if (autoPlay) {
        return;
      }
      setReplay((prev) => {
        let next = prev;
        for (let i = 0; i < steps; i++) {
          const advanced = advanceReplayByOne(next);
          if (advanced === next) {
            break;
          }
          next = advanced;
        }
        return next;
      });
    },
    [autoPlay],
  );

  // --- Keyboard Shortcuts ---
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if (e.code === "Space") {
        e.preventDefault();
        setAutoPlay((prev) => !prev);
      } else if (e.code === "KeyR") {
        setAutoPlay(false);
        setReplay(createReplayState(examples[exampleId].events));
        setPendingWebAPIs([]);
        setResetKey((prev) => prev + 1);
        toast.info("Reset");
      } else if (e.code === "ArrowRight") {
        advanceReplay(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [advanceReplay, exampleId]);

  React.useEffect(() => {
    setCode(examples[exampleId].code);
    setReplay(createReplayState(examples[exampleId].events));
    setAutoPlay(false);
  }, [exampleId]);

  React.useEffect(() => {
    if (!autoPlay) return;
    let timer: number;
    let cancelled = false;

    const scheduleNext = () => {
      timer = window.setTimeout(() => {
        if (cancelled) return;
        setReplay((prev) => {
          const next = advanceReplayByOne(prev);
          if (next === prev) {
            cancelled = true;
            setAutoPlay(false);
          }
          return next;
        });
        if (!cancelled) scheduleNext();
      }, speed);
    };
    scheduleNext();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [autoPlay, speed]);

  const { state } = replay;
  const isRunning = autoPlay || state.callStack.length > 0;
  const shouldRenderGpuFlow = autoPlay || replay.pointer > 0;

  // --- Derived State & Events ---
  const lastEvent =
    replay.pointer > 0 ? replay.events[replay.pointer - 1] : null;
  const flowFocus = React.useMemo(
    () => describeFlowFocus(lastEvent),
    [lastEvent],
  );
  const hasFlowFocus = flowFocus.emphasisIds.length > 0;
  const focusClassForBox = (boxId: string) => {
    if (!hasFlowFocus) {
      return "opacity-100";
    }
    return flowFocus.emphasisIds.includes(boxId)
      ? "opacity-100 scale-[1.01] brightness-110 saturate-110"
      : "opacity-20 scale-[0.96] brightness-50 saturate-50";
  };

  // Derived state for the visualizer
  const queueState = state.queues;
  const topFrame = state.callStack[state.callStack.length - 1];
  const liveStack = React.useMemo(
    () => [...state.callStack].reverse().map((frame) => frame.label),
    [state.callStack],
  );
  const liveQueues = React.useMemo(
    () => ({
      timers: formatQueueItems(state.queues.timers),
      io: formatQueueItems(state.queues.io),
      check: formatQueueItems(state.queues.check),
      close: formatQueueItems(state.queues.close),
      nextTick: formatQueueItems(state.queues.nextTick),
      promise: formatQueueItems(state.queues.promise),
    }),
    [state.queues],
  );
  const activeCodeRange = React.useMemo(() => {
    if (topFrame?.source) {
      return topFrame.source;
    }
    if (
      lastEvent &&
      "source" in lastEvent &&
      lastEvent.source &&
      (lastEvent.type === "ENQUEUE_TASK" ||
        lastEvent.type === "ENQUEUE_MICROTASK" ||
        lastEvent.type === "CALLBACK_START" ||
        lastEvent.type === "ENTER_FUNCTION" ||
        lastEvent.type === "WEBAPI_SCHEDULE")
    ) {
      return lastEvent.source;
    }
    if (!state.isRunning && state.callStack.length === 0) {
      return undefined;
    }
    return state.focus?.activeRange;
  }, [
    lastEvent,
    state.callStack.length,
    state.focus?.activeRange,
    state.isRunning,
    topFrame?.source,
  ]);

  const executionSnapshots = React.useMemo(() => {
    const snapshots: Array<{
      index: number;
      event: VisualizerEvent;
      stack: string[];
      queues: Record<QueueName, string>;
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
          io: formatQueueItems(current.queues.io),
          check: formatQueueItems(current.queues.check),
          close: formatQueueItems(current.queues.close),
          nextTick: formatQueueItems(current.queues.nextTick),
          promise: formatQueueItems(current.queues.promise),
        },
      });
    }

    return snapshots;
  }, [replay.events, replay.pointer]);

  // --- DnD Logic (Interactive Mode) ---
  const [pendingWebAPIs, setPendingWebAPIs] = React.useState<WebApiItem[]>([]);

  // Auto-scroll to active log entry
  React.useEffect(() => {
    const activeEl = document.getElementById("active-log-entry");
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [replay.pointer]);

  const replayWebApiItems = React.useMemo<WebApiItem[]>(() => {
    const pending: WebApiItem[] = [];
    const claimedTaskIds = new Set<string>();

    const findLinkedTask = (fromIndex: number, sourceLine?: number) => {
      for (let j = fromIndex + 1; j < replay.events.length; j++) {
        const futureEvent = replay.events[j];
        if (futureEvent.type !== "ENQUEUE_TASK") {
          continue;
        }
        if (futureEvent.queue !== "timers" && futureEvent.queue !== "io") {
          continue;
        }
        if (claimedTaskIds.has(futureEvent.taskId)) {
          continue;
        }
        if (
          sourceLine !== undefined &&
          futureEvent.source?.line !== sourceLine
        ) {
          continue;
        }
        claimedTaskIds.add(futureEvent.taskId);
        return futureEvent;
      }
      return null;
    };

    for (let i = 0; i < replay.pointer; i++) {
      const event = replay.events[i];
      if (event.type === "WEBAPI_SCHEDULE") {
        const sourceLine = event.source?.line;
        const linkedTask = findLinkedTask(i, sourceLine);
        pending.push({
          id: linkedTask
            ? `token-webapi-${linkedTask.taskId}`
            : `webapi-scheduled-${event.ts}-${i}`,
          label: normalizeWebApiLabel(event.job),
          type: linkedTask
            ? linkedTask.queue === "timers"
              ? "timer"
              : "io"
            : inferWebApiType(event.job),
          start: event.ts,
          duration: 1400,
          sourceLine,
        });
        continue;
      }
      if (
        event.type === "ENQUEUE_TASK" &&
        (event.queue === "timers" || event.queue === "io")
      ) {
        const expectedType: WebApiPendingType =
          event.queue === "timers" ? "timer" : "io";
        let removeIndex = pending.findIndex(
          (item) => item.id === `token-webapi-${event.taskId}`,
        );
        if (removeIndex === -1 && event.source?.line !== undefined) {
          removeIndex = pending.findIndex(
            (item) =>
              item.sourceLine === event.source?.line &&
              item.type === expectedType,
          );
        }
        if (removeIndex === -1) {
          removeIndex = pending.findIndex((item) => item.type === expectedType);
        }
        if (removeIndex !== -1) {
          pending.splice(removeIndex, 1);
        }
      }
    }

    return pending;
  }, [replay.events, replay.pointer]);

  const visibleWebApiItems = React.useMemo(
    () => [...replayWebApiItems, ...pendingWebAPIs],
    [replayWebApiItems, pendingWebAPIs],
  );

  const scheduleEvent = (visualizerEvent: VisualizerEvent, label: string) => {
    setReplay((prev) => {
      const newState = applyEvent(prev.state, visualizerEvent);
      return {
        ...prev,
        events: [...prev.events, visualizerEvent],
        pointer: prev.pointer + 1,
        state: newState,
      };
    });
    // toast.success(`Scheduled ${label}`); // moved to caller
  };

  const handleScheduleTask = (paletteId: string, label: string) => {
    // Simulate Async Delays
    const duration =
      paletteId === "palette-timeout"
        ? 2000
        : paletteId === "palette-fetch"
          ? 1500
          : 0;

    if (duration > 0) {
      const id = generateId("webapi");
      const type = paletteId === "palette-timeout" ? "timer" : "io";

      setPendingWebAPIs((prev) => [
        ...prev,
        { id, label, type, start: Date.now(), duration },
      ]);
      toast.info(`Scheduling ${label}...`);

      setTimeout(() => {
        setPendingWebAPIs((prev) => prev.filter((p) => p.id !== id));
        if (paletteId === "palette-timeout") {
          scheduleEvent(createEnqueueTaskEvent("timers", label), label);
        } else {
          scheduleEvent(createEnqueueTaskEvent("io", label), label);
        }
        toast.success(`Completed ${label}`);
      }, duration);
    } else {
      // Immediate (Microtasks or direct drops)
      if (paletteId === "palette-promise") {
        scheduleEvent(createEnqueueMicrotaskEvent("promise", label), label);
        toast.success(`Resolved ${label}`);
      } else {
        // Generic
        scheduleEvent(createEnqueueTaskEvent("timers", label), label);
        toast.success(`Scheduled ${label}`);
      }
    }
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over) return;

    if (active.id.toString().startsWith("palette-")) {
      const label = active.data.current?.label || "Task";
      const paletteId = active.id;
      const boxId = over.id;

      // If dropped on WebAPIs, trigger the "async" flow
      if (boxId === "box-webapi") {
        if (paletteId === "palette-timeout" || paletteId === "palette-fetch") {
          handleScheduleTask(paletteId, label);
          return;
        }
      }

      // Direct drops bypass delay (simulating "already finished")
      // Except for microtasks which are always immediate
      let visualizerEvent: VisualizerEvent | null = null;

      if (boxId === "box-timers") {
        visualizerEvent = createEnqueueTaskEvent("timers", label);
      } else if (boxId === "box-io") {
        visualizerEvent = createEnqueueTaskEvent("io", label);
      } else if (boxId === "box-check") {
        visualizerEvent = createEnqueueTaskEvent("check", label);
      } else if (boxId === "box-close") {
        visualizerEvent = createEnqueueTaskEvent("close", label);
      } else if (boxId === "box-microtask") {
        if (paletteId === "palette-promise") {
          visualizerEvent = createEnqueueMicrotaskEvent("promise", label);
        }
      } else if (boxId === "box-stack") {
        visualizerEvent = createCallbackStartEvent(label);
      }

      if (visualizerEvent) {
        scheduleEvent(visualizerEvent, label);
        toast.success(`Scheduled ${label}`);
      } else {
        // If we dropped a promise on WebAPI?
        if (boxId === "box-webapi" && paletteId === "palette-promise") {
          toast.error("Promises don't use Web APIs thread");
        } else {
          toast.error("Invalid drop target");
        }
      }
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
        <div className="flex h-screen overflow-hidden flex-col bg-[#0d1117] text-slate-200 font-sans bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0d1117] to-[#0d1117]">
          {/* Toolbar */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-[#010409]/80 backdrop-blur-md px-4 py-3 shadow-md z-50">
            <div className="flex items-center gap-3">
              <span className="ml-2 font-mono text-xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
                Feel Real JS
              </span>
            </div>
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
              <div className="flex items-center gap-2 mr-4">
                <span className="text-xs font-medium text-slate-400">
                  Speed:
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
                <span className="text-xs text-slate-500 w-12 text-right">
                  {speedInput}ms
                </span>
              </div>
              <div className="h-6 w-px bg-slate-700" />
              <Button
                className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 h-7 text-xs px-3 border disabled:opacity-45"
                onClick={() => advanceReplay(1)}
                disabled={autoPlay}
              >
                NEXT STEP
              </Button>
              <Button
                className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 h-7 text-xs px-3 border disabled:opacity-45"
                onClick={() => advanceReplay(5)}
                disabled={autoPlay}
              >
                NEXT 5 STEPS
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs px-3"
                onClick={() => setAutoPlay(!autoPlay)}
              >
                {autoPlay ? "STOP" : "RUN AT ONCE"}
              </Button>
              <Button
                className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 h-7 text-xs px-3 border"
                onClick={() => {
                  setAutoPlay(false);
                  setReplay(createReplayState(examples[exampleId].events));
                  setResetKey((prev) => prev + 1);
                }}
              >
                RESET
              </Button>
            </div>
          </div>

          {/* Main Content Grid */}
          <div className="flex flex-1 min-h-0 w-full">
            {/* COL 1: Code Editor (25%) + Code Output */}
            <div className="flex w-[25%] min-w-[280px] flex-col border-r border-slate-800 bg-[#0d1117] h-full">
              {/* Code Editor (Top 60%) */}
              <div
                id="box-code"
                className={`relative flex-1 min-h-0 overflow-hidden transition-all duration-300 ${focusClassForBox("box-code")}`}
                style={{ flex: "0 0 60%" }}
              >
                <div className="absolute inset-0 overflow-auto custom-scrollbar">
                  <div className="min-h-full relative">
                    <CodeHighlighter
                      code={code}
                      activeRange={activeCodeRange}
                    />
                    <textarea
                      className="w-full h-full min-h-[400px] bg-transparent p-4 font-mono text-xs md:text-sm text-emerald-300 outline-none resize-none leading-relaxed relative z-10"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      spellCheck={false}
                    />
                  </div>
                </div>
              </div>

              {/* Code Output (Bottom 40%) */}
              <div
                id="box-code-output"
                className={`relative flex flex-col min-h-0 border-t border-slate-800 transition-all duration-300 ${focusClassForBox("box-code-output")}`}
                style={{ flex: "1 1 0%" }}
              >
                <FlowAnchor id="anchor-code-output-center" />
                <div className="border-b border-slate-800 bg-[#0d1117] px-4 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-widest shrink-0">
                  Code Output
                </div>
                <div
                  id="box-code-output-body"
                  className="flex-1 overflow-auto p-3 font-mono text-xs space-y-1.5 min-h-0"
                >
                  {state.logs.length === 0 && state.errors.length === 0 && (
                    <span className="text-slate-600 italic">No output</span>
                  )}
                  {state.logs.map((log, i) => (
                    <div key={`log-${i}`} className="flex gap-2">
                      <span
                        className={
                          log.level === "error"
                            ? "text-red-500"
                            : log.level === "warn"
                              ? "text-yellow-500"
                              : "text-slate-500"
                        }
                      >
                        {">"}
                      </span>
                      <span
                        className={
                          log.level === "error"
                            ? "text-red-400"
                            : log.level === "warn"
                              ? "text-yellow-400"
                              : "text-slate-300"
                        }
                      >
                        {log.args
                          .map((arg) =>
                            typeof arg === "object"
                              ? JSON.stringify(arg)
                              : String(arg),
                          )
                          .join(" ")}
                      </span>
                    </div>
                  ))}
                  {state.errors.map((error, i) => (
                    <div
                      key={`error-${i}`}
                      className="text-red-400 text-[11px]"
                    >
                      x {error.message}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* COL 2: Visualizer (45%) */}
            <div className="flex w-[45%] flex-col border-r border-slate-800 bg-[#0d1117] p-4 min-h-0 overflow-y-auto h-full">
              {/* Visualizer Content: Full Height Container */}
              <div className="flex gap-2 flex-1 min-h-0 pt-1">
                {/* Left: Call Stack - tall, full height, scrollable */}
                <div
                  className={`w-[280px] shrink-0 h-full flex flex-col transition-all duration-300 ${focusClassForBox("box-stack")}`}
                >
                  <DropZone id="box-stack" className="h-full flex flex-col">
                    <div className="flex-1 min-h-0">
                      <CallStack
                        stack={state.callStack}
                        isActive={state.callStack.length > 0}
                      />
                    </div>
                  </DropZone>
                </div>

                {/* Right: Grid of all other boxes - fills remaining space */}
                <div className="flex-1 flex flex-col gap-2 h-full min-h-0 overflow-y-auto pr-1">
                  {/* Band 1: Web APIs & Event Loop */}
                  <div className="flex gap-2 min-h-[150px] flex-1 shrink-0">
                    <div
                      className={`flex-1 transition-all duration-300 ${focusClassForBox("box-webapi")}`}
                    >
                      <DropZone id="box-webapi" className="h-full">
                        <WebAPIs pendingItems={visibleWebApiItems} />
                      </DropZone>
                    </div>

                    <div
                      className={`flex-1 flex items-center justify-center transition-all duration-300 ${focusClassForBox("box-loop")}`}
                    >
                      <EventLoopSpinner active={isRunning} />
                    </div>
                  </div>

                  {/* Band 2: Microtask Queue */}
                  <div
                    className={`min-h-[130px] flex-1 shrink-0 transition-all duration-300 ${focusClassForBox("box-microtask")}`}
                  >
                    <DropZone id="box-microtask" className="h-full">
                      <MicrotaskQueue
                        nextTickTasks={state.queues.nextTick}
                        promiseTasks={state.queues.promise}
                        isActive={
                          state.drainingMicrotasks ||
                          lastEvent?.type === "DEQUEUE_MICROTASK" ||
                          lastEvent?.type === "ENQUEUE_MICROTASK"
                        }
                      />
                    </DropZone>
                  </div>

                  {/* Band 3: Macrotask Queues (2x2 Grid) */}
                  <div className="grid grid-cols-2 gap-2 min-h-[180px] flex-1 shrink-0">
                    <HorizontalQueue
                      boxId="box-timers"
                      title="Timers"
                      color="#fca5a5"
                      tasks={queueState.timers}
                      isActive={state.phase === "timers"}
                      className={`transition-all duration-300 ${focusClassForBox("box-timers")}`}
                    />
                    <HorizontalQueue
                      boxId="box-io"
                      title="I/O"
                      color="#d8b4fe"
                      tasks={queueState.io}
                      isActive={state.phase === "io"}
                      className={`transition-all duration-300 ${focusClassForBox("box-io")}`}
                    />
                    <HorizontalQueue
                      boxId="box-check"
                      title="Check"
                      color="#fcd34d"
                      tasks={queueState.check}
                      isActive={state.phase === "check"}
                      className={`transition-all duration-300 ${focusClassForBox("box-check")}`}
                    />
                    <HorizontalQueue
                      boxId="box-close"
                      title="Close"
                      color="#94a3b8"
                      tasks={queueState.close}
                      isActive={state.phase === "close"}
                      className={`transition-all duration-300 ${focusClassForBox("box-close")}`}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* COL 3: Console Panels (30%) */}
            <div className="flex w-[30%] min-w-[260px] flex-col bg-[#010409] min-h-0 h-full">
              {/* Current State (Top 30%) */}
              <div
                className="flex flex-col border-b border-slate-800"
                style={{ flex: "0 0 30%" }}
              >
                <div className="border-b border-slate-800 bg-[#0d1117] px-4 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-widest shrink-0">
                  Current State
                </div>
                {/* ... existing Current State content ... */}
                <div className="flex-1 overflow-auto p-3 font-mono text-[11px] text-slate-300 space-y-1 min-h-0">
                  <div>
                    Last Event:{" "}
                    <span className="text-cyan-300 break-all">
                      {lastEvent ? formatEventSummary(lastEvent) : "none"}
                    </span>
                  </div>
                  <div>
                    Phase:{" "}
                    <span className="text-amber-300">
                      {state.phase ?? "idle"}
                    </span>
                  </div>
                  <div>
                    Line:{" "}
                    <span className="text-emerald-300">
                      {activeCodeRange?.line ?? "-"}
                    </span>
                  </div>
                  <div>
                    Stack Top:{" "}
                    <span className="text-orange-300">
                      {topFrame?.label ?? "empty"}
                    </span>
                  </div>
                  <div className="pt-1 text-[10px] text-slate-400">
                    Stack Data:
                  </div>
                  <div className="text-[10px] break-all text-slate-300">
                    {liveStack.length > 0 ? liveStack.join(" -> ") : "-"}
                  </div>
                  <div className="pt-1 text-[10px] text-slate-400">
                    Queue Data:
                  </div>
                  {ALL_QUEUES.map((queueName) => (
                    <div
                      key={`live-${queueName}`}
                      className="text-[10px] break-all text-slate-300"
                    >
                      Q[{queueName}]:{" "}
                      <span className="text-slate-400">
                        {liveQueues[queueName] === "empty"
                          ? "-"
                          : liveQueues[queueName]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Execution Logs (Bottom 70%) */}
              <div className="flex flex-col min-h-0" style={{ flex: "1 1 0%" }}>
                <div className="border-b border-slate-800 bg-[#0d1117] px-4 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-widest shrink-0">
                  Execution Logs
                </div>
                <div className="flex-1 overflow-auto p-3 font-mono text-[11px] space-y-1.5 min-h-0 relative">
                  {executionSnapshots.length === 0 && (
                    <span className="text-slate-600 italic">
                      No execution yet
                    </span>
                  )}
                  {[...executionSnapshots].reverse().map((snapshot) => {
                    const queueRows: Array<[QueueName, string]> = [
                      ["timers", snapshot.queues.timers],
                      ["io", snapshot.queues.io],
                      ["check", snapshot.queues.check],
                      ["close", snapshot.queues.close],
                      ["nextTick", snapshot.queues.nextTick],
                      ["promise", snapshot.queues.promise],
                    ];
                    // Only show queues that have content OR are relevant to the active phase
                    const nonEmptyQueueRows = queueRows.filter(
                      ([name, value]) => value !== "empty",
                    );

                    const isActiveStep = snapshot.index === replay.pointer - 1;

                    return (
                      <div
                        key={`${snapshot.index}-${snapshot.event.ts}`}
                        id={isActiveStep ? "active-log-entry" : undefined}
                        className={`rounded border p-2 transition-all duration-300 ${
                          isActiveStep
                            ? "border-cyan-500/70 bg-slate-800 shadow-[0_0_10px_rgba(34,211,238,0.15)] ring-1 ring-cyan-500/30"
                            : "border-slate-800 bg-slate-900/60 opacity-70 hover:opacity-100"
                        }`}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <div
                            className={`font-bold ${isActiveStep ? "text-cyan-300" : "text-sky-700"}`}
                          >
                            [{snapshot.index + 1}]{" "}
                            {formatEventSummary(snapshot.event)}
                          </div>
                          <div className="text-[9px] text-slate-600">
                            {
                              new Date(snapshot.event.ts)
                                .toLocaleTimeString()
                                .split(" ")[0]
                            }
                          </div>
                        </div>

                        <div className="pl-2 border-l-2 border-slate-800 space-y-1">
                          <div className="text-slate-400">
                            {formatEventDetail(snapshot.event)}
                          </div>

                          {"source" in snapshot.event &&
                            snapshot.event.source && (
                              <div className="text-emerald-500/80">
                                Line: {snapshot.event.source.line}
                              </div>
                            )}

                          {snapshot.stack.length > 0 && (
                            <div className="text-slate-500">
                              Stack: {snapshot.stack.join(" -> ")}
                            </div>
                          )}

                          {nonEmptyQueueRows.length > 0 && (
                            <div className="pt-1 mt-1 border-t border-slate-800/50">
                              {nonEmptyQueueRows.map(([queueName, value]) => (
                                <div
                                  key={`${snapshot.index}-${queueName}`}
                                  className="text-slate-500 break-all"
                                >
                                  Q[{queueName}]:{" "}
                                  <span className="text-slate-400">
                                    {value}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

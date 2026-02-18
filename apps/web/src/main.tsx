import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster, toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { examples } from "@jsv/protocol";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  createReplayState,
  defaultExampleId,
  exampleList,
  moveToNextPhase,
  stepForward,
  type ReplayState,
} from "@/lib/replay";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { DebugOverlay } from "./features/debug/DebugOverlay";
import { DndProvider } from "./features/dnd/DndProvider";
import { DropZone } from "./features/runtime/DropZone";
import { DraggableToken } from "./features/dnd/DraggableToken";
import {
  createCallbackStartEvent,
  createEnqueueMicrotaskEvent,
  createEnqueueTaskEvent,
} from "@/lib/interactive";
import { tick } from "@/lib/simulation";
import {
  applyEvent,
  type VisualizerEvent,
  type SourceRange,
} from "@jsv/protocol";
import { FocusBar } from "./features/focus/FocusBar";
import { GhostOverlay } from "./features/animation/GhostOverlay";
import {
  RectRegistryProvider,
  useRectRegistry,
} from "./features/animation/RectRegistry";
import "./styles.css";

// --- Types ---
type PhaseName = "timers" | "io" | "check" | "close";
type QueueState = ReplayState["state"]["queues"];

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

// --- Animation Logic ---

function TokenTransitionManager({
  state,
  lastEvent,
}: {
  state: ReplayState["state"];
  lastEvent: VisualizerEvent | null;
}) {
  const { getRect } = useRectRegistry();

  useGSAP(() => {
    if (!lastEvent) return;

    // Helper to animate flow
    const animateFlow = (
      fromId: string,
      toId: string,
      color: string,
      label: string,
    ) => {
      const fromEl = document.getElementById(fromId);
      const toEl = document.getElementById(toId);

      // Fallback to registry if DOM not found immediately (e.g. Code Lines)
      const fromRect = fromEl
        ? fromEl.getBoundingClientRect()
        : getRect(fromId);
      const toRect = toEl ? toEl.getBoundingClientRect() : getRect(toId);

      if (!fromRect || !toRect) return;

      const token = document.createElement("div");
      token.textContent = label;
      token.className =
        "fixed z-[9999] rounded-md px-3 py-1.5 text-xs font-bold uppercase shadow-[0_0_15px_rgba(0,0,0,0.5)] border-2 text-white flex items-center justify-center whitespace-nowrap backdrop-blur-sm";
      token.style.backgroundColor = color;
      token.style.borderColor = "rgba(255,255,255,0.4)";
      token.style.textShadow = "0 1px 2px rgba(0,0,0,0.8)";

      // Centering logic
      const startX = fromRect.left + fromRect.width / 2;
      const startY = fromRect.top + fromRect.height / 2;
      const endX = toRect.left + toRect.width / 2;
      const endY = toRect.top + toRect.height / 2;

      token.style.left = `${startX}px`;
      token.style.top = `${startY}px`;
      token.style.transform = "translate(-50%, -50%) scale(0.5)";

      document.body.appendChild(token);

      // Intro
      gsap.to(token, {
        scale: 1,
        duration: 0.3,
        ease: "back.out(1.7)",
      });

      // Move
      gsap.to(token, {
        x: endX - startX,
        y: endY - startY,
        duration: 1.2,
        ease: "power3.inOut",
        onComplete: () => {
          // Arrival effect (persistence)
          gsap.to(token, {
            scale: 1.5,
            opacity: 0,
            duration: 0.4,
            ease: "power1.out",
            onComplete: () => token.remove(),
          });
        },
      });
    };

    switch (lastEvent.type) {
      case "ENQUEUE_TASK":
        if (lastEvent.queue === "timers" || lastEvent.queue === "io") {
          animateFlow(
            "box-webapi",
            "box-taskqueue",
            "#fbbf24",
            lastEvent.label || "Task",
          );
        }
        break;

      case "DEQUEUE_TASK":
        // Task Queue -> Stack
        animateFlow(`token-${lastEvent.taskId}`, "box-stack", "#fbbf24", "Run");
        break;

      case "ENQUEUE_MICROTASK":
        // Stack -> Microtask Queue (Promises)
        // Or from Code? If we have source, GhostOverlay handles Code -> Box.
        // This manager handles Box -> Box.
        // But if it was triggered by code, GhostOverlay does it.
        // Let's rely on GhostOverlay for Code -> Box.
        // Only map Box -> Box here?
        // Actually, the user wants "WebAPI -> TaskQueue" and "Queue -> Stack".
        // ENQUEUE_MICROTASK usually comes from Stack (Promise.then).
        // Let's animate Stack -> MicrotaskQueue if it didn't come from code source?
        // But GhostOverlay handles the creation.
        // Let's stick to Queue -> Stack and WebAPI -> Queue for this component.
        break;

      case "DEQUEUE_MICROTASK":
        // Microtask Queue -> Stack
        animateFlow(`token-${lastEvent.id}`, "box-stack", "#22d3ee", "Run");
        break;

      case "CALLBACK_START":
        // Optional pulse
        const stack = document.getElementById("box-stack");
        if (stack) {
          gsap.fromTo(
            stack,
            { boxShadow: "0 0 0px #f97316" },
            {
              boxShadow: "0 0 20px #f97316",
              duration: 0.2,
              yoyo: true,
              repeat: 1,
            },
          );
        }
        break;
    }
  }, [lastEvent]); // Trigger on every event change

  return null;
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

function TaskToken({
  label,
  color,
  id,
  source,
}: {
  label: string;
  color: string;
  id: string;
  source?: SourceRange;
}) {
  const { register, unregister } = useRectRegistry();

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
}: {
  stack: { id: string; label: string; source?: SourceRange }[];
  children?: React.ReactNode;
}) {
  return (
    <NeonBox
      id="box-stack"
      title="Call Stack"
      color="#f97316"
      className="h-full min-h-[250px] overflow-hidden"
    >
      <div className="flex h-full flex-col-reverse justify-start overflow-auto p-2">
        <AnimatePresence mode="popLayout">
          {stack.map((frame) => (
            <TaskToken
              key={frame.id}
              id={frame.id}
              label={frame.label}
              color="#f97316" // Orange
              source={frame.source}
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
  pendingItems: {
    id: string;
    label: string;
    type: "timer" | "io";
    start: number;
    duration: number;
  }[];
  children?: React.ReactNode;
}) {
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
      className="h-full min-h-[200px]"
    >
      <div className="grid grid-cols-2 gap-2 p-2 overflow-auto max-h-full">
        <AnimatePresence>
          {pendingItems.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center justify-center rounded border border-slate-700 bg-slate-800 p-2 text-center relative overflow-hidden"
            >
              <div className="text-[10px] text-purple-400 uppercase font-bold z-10">
                {item.type}
              </div>
              <div className="text-xs text-white truncate w-full z-10">
                {item.label}
              </div>
              {/* Progress Bar */}
              <motion.div
                className="absolute bottom-0 left-0 h-1 bg-purple-500"
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

function VerticalQueue({
  title,
  color,
  tasks,
  className = "",
}: {
  title: string;
  color: string;
  tasks: { id: string; label: string; source?: SourceRange }[];
  className?: string; // Allow overrides
}) {
  return (
    <NeonBox
      id={`box-${title.toLowerCase().replace(/\s/g, "")}`}
      title={title}
      color={color}
      className={`min-h-[80px] flex flex-col ${className}`}
    >
      <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {tasks.map((task) => (
            <motion.div
              key={task.id}
              layoutId={task.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full rounded border px-2 py-1 text-center text-[10px] font-medium shadow-sm truncate"
              style={{
                borderColor: `${color}40`, // 25% opacity
                backgroundColor: `${color}10`, // 6% opacity
                color: `${color}ee`,
              }}
              id={`token-${task.id}`}
              data-source-line={task.source?.line}
            >
              {task.label}
            </motion.div>
          ))}
        </AnimatePresence>
        {tasks.length === 0 && (
          <div className="text-[10px] text-slate-700 italic text-center py-2 h-full flex items-center justify-center">
            Empty
          </div>
        )}
      </div>
    </NeonBox>
  );
}

function MicrotaskQueue({
  tasks,
  children,
}: {
  tasks: { id: string; label: string; source?: SourceRange }[];
  children?: React.ReactNode;
}) {
  return (
    <NeonBox
      id="box-microtask"
      title="Microtask Queue"
      color="#22d3ee"
      className="h-full min-h-[120px]"
    >
      <div className="flex h-full items-center gap-2 overflow-x-auto p-2">
        <AnimatePresence mode="popLayout">
          {tasks.map((task) => (
            <motion.div
              key={task.id}
              layoutId={task.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="min-w-[100px] rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-2 text-center text-xs text-cyan-200"
              id={`token-${task.id}`}
              data-source-line={task.source?.line}
            >
              {task.label}
            </motion.div>
          ))}
        </AnimatePresence>
        {tasks.length === 0 && (
          <span className="text-xs text-slate-600 italic w-full text-center">
            Empty
          </span>
        )}
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
      className="flex h-[180px] w-full flex-col items-center justify-center gap-4"
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
        // activeRange is 1-based
        const isActive = activeRange && lineNumber === activeRange.line;
        // Also support multi-line if needed, but for now simple line match

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
        if (!autoPlay) {
          setReplay((prev) => {
            const next = stepForward(prev);
            // If at end, try tick
            if (next.pointer >= next.events.length) {
              const newEvents = tick(next.state);
              if (newEvents && newEvents.length > 0) {
                let currentState = next.state;
                const addedEvents = [...newEvents];
                for (const evt of addedEvents) {
                  currentState = applyEvent(currentState, evt);
                }
                return {
                  ...next,
                  events: [...next.events, ...addedEvents],
                  pointer: next.pointer + addedEvents.length,
                  state: currentState,
                };
              }
            }
            return next;
          });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [autoPlay, exampleId]);

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
          const next = stepForward(prev);
          if (next.pointer >= next.events.length) {
            // End of history. Try to generate new event via tick()!
            const newEvents = tick(next.state);
            if (newEvents && newEvents.length > 0) {
              let currentState = next.state;
              const addedEvents = [...newEvents];

              for (const evt of addedEvents) {
                currentState = applyEvent(currentState, evt);
              }

              return {
                ...next,
                events: [...next.events, ...addedEvents],
                pointer: next.pointer + addedEvents.length,
                state: currentState,
              };
            } else {
              cancelled = true;
              setAutoPlay(false);
            }
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

  // --- Derived State & Events ---
  const lastEvent =
    replay.pointer > 0 ? replay.events[replay.pointer - 1] : null;

  // Derived state for the visualizer
  const queueState = state.queues;

  // --- DnD Logic (Interactive Mode) ---
  const [pendingWebAPIs, setPendingWebAPIs] = React.useState<
    {
      id: string;
      label: string;
      type: "timer" | "io";
      start: number;
      duration: number;
    }[]
  >([]);

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

      if (boxId === "box-taskqueue") {
        visualizerEvent = createEnqueueTaskEvent("timers", label);
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
        <GhostOverlay
          lastEvent={replay.events[replay.pointer - 1] || null}
          resetKey={resetKey}
        />
        <div className="flex h-screen flex-col bg-[#0d1117] text-slate-200 font-sans overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0d1117] to-[#0d1117]">
          {/* Toolbar */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-[#010409]/80 backdrop-blur-md px-4 py-3 shadow-md z-50">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-red-500 shadow-custom-red" />
              <div className="h-3 w-3 rounded-full bg-yellow-500 shadow-custom-yellow" />
              <div className="h-3 w-3 rounded-full bg-green-500 shadow-custom-green" />
              <span className="ml-2 font-mono text-sm font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
                JS VISUALIZER
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
                className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs px-3"
                onClick={() => setAutoPlay(!autoPlay)}
              >
                {autoPlay ? "STOP" : "RUN"}
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

          {/* Main Content Grid */}
          <div className="flex flex-1 overflow-hidden flex-col">
            <TokenTransitionManager state={state} lastEvent={lastEvent} />
            <div className="flex flex-1 overflow-hidden">
              {/* LEFT COL: Palette & Code (35%) */}
              <div className="flex w-[35%] min-w-[350px] flex-col border-r border-slate-800 bg-[#0d1117]">
                {/* Palette Area (New) */}

                {/* Code Editor Area */}
                <div id="box-code" className="relative flex-1 overflow-hidden">
                  <div className="absolute inset-0 overflow-auto custom-scrollbar">
                    <div className="min-h-full relative">
                      <CodeHighlighter
                        code={code}
                        activeRange={state.focus?.activeRange}
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

                {/* Console Area */}
                <div className="h-[30%] min-h-[200px] border-t border-slate-800 bg-[#010409] flex flex-col">
                  <div className="border-b border-slate-800 bg-[#0d1117] px-4 py-1 text-xs font-semibold text-slate-500 uppercase tracking-widest">
                    Console
                  </div>
                  <div className="flex-1 overflow-auto p-4 font-mono text-xs space-y-2">
                    {state.logs.length === 0 && (
                      <span className="text-slate-600 italic">No output</span>
                    )}
                    {state.logs.map((log, i) => (
                      <div key={i} className="flex gap-2">
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
                        <div>
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
                      </div>
                    ))}
                    <div
                      ref={(el) => el?.scrollIntoView({ behavior: "smooth" })}
                    />
                  </div>
                </div>
              </div>

              {/* RIGHT COL: Visualizer (65%) */}
              <div className="flex-1 overflow-hidden bg-[#0d1117] p-6">
                <div className="grid h-full w-full grid-cols-2 grid-rows-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] gap-6">
                  {/* 1. Call Stack (Top Left) */}
                  <div className="row-span-1">
                    <DropZone id="box-stack" className="h-full">
                      <CallStack stack={state.callStack} />
                    </DropZone>
                  </div>

                  {/* 2. Web APIs (Top Right) */}
                  <div className="row-span-1">
                    <DropZone id="box-webapi" className="h-full">
                      <WebAPIs pendingItems={pendingWebAPIs} />
                    </DropZone>
                  </div>

                  {/* 3. Event Loop (Middle Left) */}
                  <div className="row-span-1 flex items-center justify-center py-4">
                    <EventLoopSpinner active={isRunning} />
                  </div>

                  {/* 4. Macrotask Queues (Right Column Split) */}
                  <div className="row-span-3 col-start-2 row-start-1 grid grid-rows-4 gap-4 h-full">
                    <VerticalQueue
                      title="Timers"
                      color="#fca5a5"
                      tasks={queueState.timers}
                    />
                    <VerticalQueue
                      title="I/O Callbacks"
                      color="#d8b4fe"
                      tasks={queueState.io}
                    />
                    <VerticalQueue
                      title="Check (Immediate)"
                      color="#fcd34d"
                      tasks={queueState.check}
                    />
                    <VerticalQueue
                      title="Close Handlers"
                      color="#94a3b8"
                      tasks={queueState.close}
                    />
                  </div>

                  {/* 5. Microtask Queue (Bottom Left) -> Adjusted Layout */}
                  <div className="col-start-1 row-start-3">
                    <DropZone id="box-microtask" className="h-full">
                      <MicrotaskQueue
                        tasks={[
                          ...state.queues.promise,
                          ...state.queues.nextTick,
                        ]}
                      />
                    </DropZone>
                  </div>
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

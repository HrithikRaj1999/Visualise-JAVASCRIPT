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
import "./styles.css";

// --- Types ---
type PhaseName = "timers" | "io" | "check" | "close";
type QueueState = ReplayState["state"]["queues"];

// --- Helper Components ---

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
  prevCallStackLen,
}: {
  state: ReplayState["state"];
  prevCallStackLen: number;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const prevStateRef = React.useRef(state);

  useGSAP(
    () => {
      const prev = prevStateRef.current;

      // 1. Detect Call Stack Push (Code -> Stack)
      if (state.callStack.length > prev.callStack.length) {
        const newFrame = state.callStack[state.callStack.length - 1];
        // Only animate if it's a real push, not a replay reset
        if (state.callStack.length === prev.callStack.length + 1) {
          animateTokenFlow("box-code", "box-stack", "#f97316", newFrame.label);
        }
      }

      // 2. Detect Stack -> Web API (e.g. setTimeout called)
      // Heuristic: If queue item added to WebAPI (timers/io), it came from active stack frame
      const prevWeb = prev.queues.timers.length + prev.queues.io.length;
      const currWeb = state.queues.timers.length + state.queues.io.length;
      if (currWeb > prevWeb) {
        animateTokenFlow("box-stack", "box-webapi", "#d946ef", "API Call");
      }

      // 3. Detect Web API -> Queue (Timer done)
      // Heuristic: Check if any macro task queue grew
      const prevMacro =
        prev.queues.timers.length +
        prev.queues.io.length +
        prev.queues.check.length +
        prev.queues.close.length;
      const currMacro =
        state.queues.timers.length +
        state.queues.io.length +
        state.queues.check.length +
        state.queues.close.length;

      if (currMacro > prevMacro) {
        animateTokenFlow("box-webapi", "box-taskqueue", "#ec4899", "Callback");
      }

      const prevMicro =
        prev.queues.promise.length + prev.queues.nextTick.length;
      const currMicro =
        state.queues.promise.length + state.queues.nextTick.length;

      if (currMicro > prevMicro) {
        animateTokenFlow("box-stack", "box-microtask", "#22d3ee", "Microtask");
      }

      // 4. Detect Queue -> Stack (Event Loop Tick)
      if (state.callStack.length > prev.callStack.length) {
        // If stack grew and queue shrank?
        if (currMacro < prevMacro || currMicro < prevMicro) {
          animateTokenFlow("box-loop", "box-stack", "#fbbf24", "Run");
        }
      }

      prevStateRef.current = state;
    },
    { scope: containerRef, dependencies: [state] },
  );

  const animateTokenFlow = (
    fromId: string,
    toId: string,
    color: string,
    label: string,
  ) => {
    const fromEl = document.getElementById(fromId);
    const toEl = document.getElementById(toId);
    const container = containerRef.current;
    if (!fromEl || !toEl || !container) return;

    const token = document.createElement("div");
    token.className =
      "fixed z-[9999] rounded px-2 py-1 text-[10px] font-bold uppercase text-white shadow-lg flex items-center justify-center border";
    token.style.backgroundColor = "#1e293b";
    token.style.borderColor = color;
    token.style.color = color;
    token.innerText = label;

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    // Debugging
    console.log(`Animating token: ${label} from ${fromId} to ${toId}`);

    const startX = fromRect.left + fromRect.width / 2;
    const startY = fromRect.top + fromRect.height / 2;

    const endX = toRect.left + toRect.width / 2;
    const endY = toRect.top + toRect.height / 2;

    token.style.left = `${startX}px`;
    token.style.top = `${startY}px`;

    document.body.appendChild(token);

    gsap.to(token, {
      x: endX - startX,
      y: endY - startY,
      duration: 0.8,
      ease: "power2.inOut",
      onComplete: () => {
        token.remove();
      },
    });
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 pointer-events-none z-[100]"
    />
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

function TaskToken({
  label,
  color,
  id,
}: {
  label: string;
  color: string;
  id: string;
}) {
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
    >
      <span className="truncate">{label}</span>
    </motion.div>
  );
}

// --- Visualizer Components ---

function CallStack({ stack }: { stack: { id: string; label: string }[] }) {
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
            />
          ))}
        </AnimatePresence>
        {stack.length === 0 && (
          <div className="flex h-full items-center justify-center text-xs text-slate-600 italic">
            Stack Empty
          </div>
        )}
      </div>
    </NeonBox>
  );
}

function WebAPIs({ queues }: { queues: QueueState }) {
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

  const items = [
    ...queues.timers.map((t) => ({ ...t, type: "timer" })),
    ...queues.io.map((t) => ({ ...t, type: "io" })),
  ];

  return (
    <NeonBox
      id="box-webapi"
      title="Web APIs"
      color="#d946ef"
      className="h-full min-h-[200px]"
    >
      <div className="grid grid-cols-2 gap-2 p-2 overflow-auto max-h-full">
        <AnimatePresence>
          {items.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center justify-center rounded border border-slate-700 bg-slate-800 p-2 text-center"
            >
              <div className="text-[10px] text-purple-400 uppercase font-bold">
                {item.type}
              </div>
              <div className="text-xs text-white truncate w-full">
                {item.label}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {items.length === 0 && (
          <div className="col-span-2 flex h-full items-center justify-center text-xs text-slate-600 italic">
            Idle
          </div>
        )}
      </div>
    </NeonBox>
  );
}

function TaskQueue({ tasks }: { tasks: { id: string; label: string }[] }) {
  return (
    <NeonBox
      id="box-taskqueue"
      title="Task Queue"
      color="#ec4899"
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
              className="min-w-[100px] rounded border border-pink-500/30 bg-pink-500/10 px-2 py-2 text-center text-xs text-pink-200"
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

function MicrotaskQueue({ tasks }: { tasks: { id: string; label: string }[] }) {
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
  activeTaskLabel,
}: {
  code: string;
  activeTaskLabel: string | null;
}) {
  const lines = code.split("\n");

  return (
    <div className="absolute inset-0 pointer-events-none font-mono text-xs md:text-sm p-4 leading-relaxed overflow-hidden">
      {lines.map((line, i) => {
        const isActive =
          activeTaskLabel && line.includes(activeTaskLabel.split(" ")[0]);
        return (
          <div
            key={i}
            className={`w-full ${isActive ? "bg-yellow-500/20 shadow-[0_0_10px_rgba(234,179,8,0.2)]" : ""} px-1`}
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
  const [speedInput, setSpeedInput] = React.useState("800"); // Slower default for better vis

  const speed = Number(speedInput) || 0;

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

  // Derived state for the visualizer
  // Derived state for the visualizer
  const macroTasks = [
    ...state.queues.timers,
    ...state.queues.io,
    ...state.queues.check,
    ...state.queues.close,
  ];

  return (
    <div className="flex h-screen flex-col bg-[#0d1117] text-slate-200 font-sans overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-[#010409] px-4 py-3 shadow-md z-50">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-red-500" />
          <div className="h-3 w-3 rounded-full bg-yellow-500" />
          <div className="h-3 w-3 rounded-full bg-green-500" />
          <span className="ml-2 font-mono text-sm font-bold tracking-tight text-white">
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
            }}
          >
            RESET
          </Button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT COL: Code & Console (35%) */}
        <div className="flex w-[35%] min-w-[350px] flex-col border-r border-slate-800 bg-[#0d1117]">
          {/* Code Editor Area */}
          <div id="box-code" className="relative flex-1 overflow-hidden">
            <div className="absolute inset-0 overflow-auto custom-scrollbar">
              <div className="min-h-full relative">
                <CodeHighlighter
                  code={code}
                  activeTaskLabel={state.activeTaskId ?? null}
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
              {replay.toasts.length === 0 && (
                <span className="text-slate-600 italic">...</span>
              )}
              {replay.toasts.map((t, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-slate-500">{">"}</span>
                  <div>
                    <span className="text-slate-300">{t.title}</span>
                    {t.description && (
                      <span className="ml-2 text-slate-500">
                        // {t.description}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              <div ref={(el) => el?.scrollIntoView({ behavior: "smooth" })} />
            </div>
          </div>
        </div>

        {/* RIGHT COL: Visualizer (65%) */}
        <div className="flex-1 overflow-hidden bg-[#0d1117] p-6">
          <div className="grid h-full w-full grid-cols-2 grid-rows-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] gap-6">
            {/* 1. Call Stack (Top Left) */}
            <div className="row-span-1">
              <CallStack stack={state.callStack} />
            </div>

            {/* 2. Web APIs (Top Right) */}
            <div className="row-span-1">
              <WebAPIs queues={state.queues} />
            </div>

            {/* 3. Event Loop (Middle Left) */}
            <div className="row-span-1 flex items-center justify-center py-4">
              <EventLoopSpinner active={isRunning} />
            </div>

            {/* 4. Task Queue (Middle Right) */}
            <div className="row-span-1">
              <TaskQueue tasks={macroTasks} />
            </div>

            {/* 5. Microtask Queue (Bottom) -> Spanning or Just Right? Reference had Micro below Task */}
            {/* We'll put it in col 2, row 3 */}
            <div className="col-start-2 row-start-3">
              <MicrotaskQueue
                tasks={[...state.queues.promise, ...state.queues.nextTick]}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster, toast } from "sonner";
import { motion } from "framer-motion";
import { examples } from "@jsv/protocol";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  createReplayState,
  defaultExampleId,
  exampleList,
  moveToNextPhase,
  type ReplayState,
} from "@/lib/replay";
import "./styles.css";

function QueuePanel({
  title,
  items,
}: {
  title: string;
  items: Array<{ id: string; label: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <span>{title}</span>
        <Badge>{String(items.length)}</Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <div className="text-xs text-slate-500">Empty</div>
        ) : null}
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
          >
            {item.label}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CircularProgress({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(1, value));
  const angle = clamped * 360;
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-14 w-14 rounded-full"
        style={{
          background: `conic-gradient(#0f766e ${angle}deg, #dbeafe ${angle}deg)`,
          display: "grid",
          placeItems: "center",
        }}
      >
        <div className="h-10 w-10 rounded-full bg-white text-center text-[10px] font-semibold leading-10 text-slate-700">
          {Math.round(clamped * 100)}%
        </div>
      </div>
      <div className="text-xs text-slate-700">{label}</div>
    </div>
  );
}

function ToastPulse({ toastKey }: { toastKey: string }) {
  const [progress, setProgress] = React.useState(0);
  React.useEffect(() => {
    let mounted = true;
    let frame = 0;
    const tick = () => {
      if (!mounted) return;
      frame += 1;
      const next = Math.min(100, frame * 5);
      setProgress(next);
      if (next < 100) {
        window.setTimeout(tick, 24);
      }
    };
    tick();
    return () => {
      mounted = false;
    };
  }, [toastKey]);

  return <CircularProgress value={progress / 100} label="Toast progress" />;
}

function Walkthrough({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 p-4">
      <div className="mx-auto max-w-3xl rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">How to Use</h2>
          <Button onClick={onClose}>Close</Button>
        </div>
        <div className="space-y-2 text-sm text-slate-700">
          <p>
            <strong>Editor:</strong> write or edit code (left half).
          </p>
          <p>
            <strong>Example selector:</strong> load built-in scenarios.
          </p>
          <p>
            <strong>Move to next phase:</strong> advances to next event-loop
            phase boundary.
          </p>
          <p>
            <strong>Auto play + speed:</strong> runs automatically with your
            entered delay in milliseconds. `0` means immediate.
          </p>
          <p>
            <strong>Queues:</strong> timers, io, check, close, nextTick, promise
            show pending work.
          </p>
          <p>
            <strong>Macro/Micro boxes:</strong> quick totals for all macrotasks
            and microtasks.
          </p>
          <p>
            <strong>Call stack:</strong> shows currently active callback frames.
          </p>
          <p>
            <strong>Explanation log + toast:</strong> readable narration for
            each important event.
          </p>
          <p>
            <strong>Circular progress:</strong> shows overall replay completion
            progress.
          </p>
        </div>
      </div>
    </div>
  );
}

type PhaseName = "timers" | "io" | "check" | "close";
type DiagramQueues = ReplayState["state"]["queues"];

const phasePositions: Record<PhaseName, { x: number; y: number; label: string }> = {
  timers: { x: 50, y: 12, label: "timers queue" },
  io: { x: 86, y: 50, label: "I/O queue" },
  check: { x: 50, y: 88, label: "check queue" },
  close: { x: 14, y: 50, label: "close queue" },
};

function EventLoopDiagram({
  phase,
  queues,
}: {
  phase: PhaseName | "idle";
  queues: DiagramQueues;
}) {
  const activePhase = phase === "idle" ? "timers" : phase;
  const microCount = queues.nextTick.length + queues.promise.length;

  return (
    <div className="relative mx-auto h-[360px] w-full max-w-[760px] overflow-hidden rounded-xl bg-slate-950 text-slate-100">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <circle cx="50" cy="50" r="38" fill="none" stroke="#334155" strokeWidth="0.8" />
      </svg>

      {(Object.keys(phasePositions) as PhaseName[]).map((phaseKey) => {
        const position = phasePositions[phaseKey];
        const count = queues[phaseKey].length;
        const isActive = activePhase === phaseKey;

        return (
          <motion.div
            key={phaseKey}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-md border px-3 py-2 text-[11px]"
            style={{ left: `${position.x}%`, top: `${position.y}%` }}
            initial={false}
            animate={{
              borderColor: isActive ? "#14b8a6" : "#475569",
              backgroundColor: isActive ? "rgba(15,118,110,0.30)" : "rgba(15,23,42,0.78)",
              scale: isActive ? 1.08 : 1,
              boxShadow: count > 0 ? "0 0 0 1px rgba(20,184,166,0.35)" : "0 0 0 1px rgba(71,85,105,0.2)",
            }}
            transition={{ duration: 0.35 }}
          >
            <div className="text-[10px] uppercase tracking-wide text-slate-300">{phaseKey}</div>
            <div>{position.label}</div>
            <div className="text-teal-300">{count} pending</div>
          </motion.div>
        );
      })}

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md border border-slate-500 bg-slate-900/90 px-3 py-2 text-[11px]">
        <div className="text-[10px] uppercase tracking-wide text-slate-300">microtasks</div>
        <div>nextTick: {queues.nextTick.length}</div>
        <div>promise: {queues.promise.length}</div>
        <div className="text-teal-300">total: {microCount}</div>
      </div>

      <motion.div
        className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-400 shadow-[0_0_14px_rgba(45,212,191,0.85)]"
        initial={false}
        animate={{
          left: `${phasePositions[activePhase].x}%`,
          top: `${phasePositions[activePhase].y}%`,
        }}
        transition={{ type: "spring", stiffness: 170, damping: 20 }}
      />

      <div className="absolute left-3 top-3 text-[11px] text-slate-300">event loop cycle</div>
      <div className="absolute right-3 top-3 text-[11px] text-teal-300">phase: {phase}</div>
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
  const [speedInput, setSpeedInput] = React.useState("400");
  const [showWalkthrough, setShowWalkthrough] = React.useState(false);
  const handledToastCountRef = React.useRef(0);

  const speed =
    Number.isFinite(Number(speedInput)) && Number(speedInput) >= 0
      ? Number(speedInput)
      : 0;

  React.useEffect(() => {
    setCode(examples[exampleId].code);
    setReplay(createReplayState(examples[exampleId].events));
    setAutoPlay(false);
    handledToastCountRef.current = 0;
  }, [exampleId]);

  React.useEffect(() => {
    if (!autoPlay) return;

    let timer: number | undefined;
    let cancelled = false;

    const scheduleNext = () => {
      const delay = speed >= 0 ? speed : 0;
      timer = window.setTimeout(() => {
        if (cancelled) return;

        let reachedEnd = false;
        setReplay((prev) => {
          if (prev.pointer >= prev.events.length) {
            reachedEnd = true;
            return prev;
          }

          const next = moveToNextPhase(prev);
          if (next.pointer >= next.events.length) {
            reachedEnd = true;
          }

          return next;
        });

        if (reachedEnd) {
          cancelled = true;
          setAutoPlay(false);
          return;
        }

        scheduleNext();
      }, delay);
    };

    scheduleNext();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [autoPlay, speed]);

  React.useEffect(() => {
    if (replay.toasts.length <= handledToastCountRef.current) {
      return;
    }

    const latestToast = replay.toasts[replay.toasts.length - 1];
    if (latestToast) {
      toast(latestToast.title, {
        description: latestToast.description,
        duration: 2600,
      });
    }
    handledToastCountRef.current = replay.toasts.length;
  }, [replay.toasts]);

  const state = replay.state;
  const phase = state.phase ?? "idle";
  const macroCount =
    state.queues.timers.length +
    state.queues.io.length +
    state.queues.check.length +
    state.queues.close.length;
  const microCount = state.queues.nextTick.length + state.queues.promise.length;
  const progress =
    replay.events.length === 0 ? 0 : replay.pointer / replay.events.length;
  const latestToast = replay.toasts[replay.toasts.length - 1];
  const stackHistory = state.timeline
    .filter(
      (event) =>
        event.type === "CALLBACK_START" || event.type === "CALLBACK_END",
    )
    .slice(-8);

  return (
    <div className="min-h-screen p-4 md:p-6">
      <Toaster richColors position="top-right" visibleToasts={5} />
      {showWalkthrough ? (
        <Walkthrough onClose={() => setShowWalkthrough(false)} />
      ) : null}

      <div className="mx-auto flex flex-col gap-4">
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-bold">
                Node Event Loop Visualizer
              </div>
              <div className="text-xs text-slate-600">
                Phase pointer: {phase}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                className="bg-slate-700 hover:bg-slate-800"
                onClick={() => setShowWalkthrough(true)}
              >
                Walkthrough
              </Button>
              <select
                className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                value={exampleId}
                onChange={(e) => setExampleId(e.target.value)}
              >
                {exampleList.map((item: { id: string; title: string }) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
              <Button
                onClick={() => {
                  setAutoPlay(false);
                  handledToastCountRef.current = 0;
                  setReplay(createReplayState(examples[exampleId].events));
                }}
              >
                Reset
              </Button>
              <Button
                onClick={() => {
                  setAutoPlay(false);
                  setReplay((prev) => moveToNextPhase(prev));
                }}
              >
                Move to next phase
              </Button>
              <Button
                onClick={() => {
                  if (replay.pointer >= replay.events.length) {
                    handledToastCountRef.current = 0;
                    setReplay(createReplayState(examples[exampleId].events));
                  }
                  setAutoPlay(true);
                }}
              >
                Run all
              </Button>
              <Button onClick={() => setAutoPlay((v) => !v)}>
                {autoPlay ? "Stop auto" : "Auto run"}
              </Button>
              <label className="text-xs">
                Speed (ms)
                <input
                  className="ml-1 w-24 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                  type="number"
                  min={0}
                  step={1}
                  value={speedInput}
                  onChange={(e) => setSpeedInput(e.target.value)}
                />
              </label>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-slate-600">
              Diagram animates the currently active phase and queue movement.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>Animated Event Loop Diagram</CardHeader>
          <CardContent>
            <EventLoopDiagram phase={phase} queues={state.queues} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>Editor (Half Page)</CardHeader>
            <CardContent>
              <textarea
                className="h-80 w-full rounded bg-slate-950 p-3 font-mono text-xs text-emerald-200"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <div className="mt-2 text-xs text-slate-600">
                {examples[exampleId].learn}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <QueuePanel title="Timers Queue" items={state.queues.timers} />
            <QueuePanel title="I/O Queue" items={state.queues.io} />
            <QueuePanel title="Check Queue" items={state.queues.check} />
            <QueuePanel title="Close Queue" items={state.queues.close} />
            <QueuePanel title="nextTick Queue" items={state.queues.nextTick} />
            <QueuePanel title="Promise Queue" items={state.queues.promise} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>Call Stack</CardHeader>
            <CardContent className="space-y-2">
              <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs">
                Active task: {state.activeTaskId ?? "none"}
              </div>
              {state.callStack.length === 0 ? (
                <div className="text-xs text-slate-500">Empty</div>
              ) : null}
              {state.callStack.map((frame: { id: string; label: string }) => (
                <div
                  key={frame.id}
                  className="rounded border border-slate-200 px-2 py-1 text-xs"
                >
                  {frame.label}
                </div>
              ))}
              <div className="mt-3 text-xs font-semibold text-slate-700">
                Recent stack activity
              </div>
              {stackHistory.length === 0 ? (
                <div className="text-xs text-slate-500">
                  No stack activity yet.
                </div>
              ) : null}
              {stackHistory.map((event, index) => (
                <div
                  key={`${event.type}-${event.ts}-${index}`}
                  className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
                >
                  {event.type === "CALLBACK_START" ? "Start" : "End"}:{" "}
                  {"taskId" in event ? event.taskId : "unknown"}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>Explanation Log + Latest Toast</CardHeader>
            <CardContent className="max-h-80 space-y-2 overflow-auto">
              {latestToast ? (
                <div className="rounded border border-teal-300 bg-teal-50 px-3 py-2">
                  <div className="text-sm font-semibold text-teal-900">
                    {latestToast.title}
                  </div>
                  <div className="text-xs text-teal-800">
                    {latestToast.description}
                  </div>
                </div>
              ) : null}
              {replay.toasts.length === 0 ? (
                <div className="text-xs text-slate-500">
                  No events explained yet.
                </div>
              ) : null}
              {replay.toasts.map(
                (entry: {
                  id: string;
                  ts: number;
                  title: string;
                  description: string;
                }) => (
                  <div
                    key={entry.id + entry.ts}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-1"
                  >
                    <div className="text-xs font-semibold">{entry.title}</div>
                    <div className="text-xs text-slate-700">
                      {entry.description}
                    </div>
                  </div>
                ),
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>Runtime Metrics</CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4">
            <CircularProgress value={progress} label="Replay completion" />
            {autoPlay ? (
              <div className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-800">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
                Running at {speed}ms
              </div>
            ) : null}
            {latestToast ? (
              <ToastPulse toastKey={latestToast.id + latestToast.ts} />
            ) : null}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="font-semibold">Macro task queue</div>
              <div>{macroCount} pending</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="font-semibold">Micro task queue</div>
              <div>{microCount} pending</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>Diagnostics</CardHeader>
          <CardContent className="space-y-2">
            {state.diagnostics.length === 0 ? (
              <div className="text-xs text-slate-500">
                No TypeScript diagnostics.
              </div>
            ) : null}
            {state.diagnostics.map((diag) => (
              <div
                key={`${diag.line}:${diag.col}:${diag.message}`}
                className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs"
              >
                {diag.line}:{diag.col} {diag.message}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

import React from "react";
import { toast } from "sonner";
import { createReplayState, stepForward, type ReplayState } from "@/lib/replay";
import { tick } from "@/lib/simulation";
import { runCode } from "../ws/wsClient";
import {
  applyEvent,
  createInitialState,
  type VisualizerEvent,
  type SourceRange,
} from "@jsv/protocol";
import { examples } from "@jsv/protocol"; // Or wherever examples are
// Actually examples are in @jsv/protocol/examples per index.ts export?
// No, main.tsx imports { examples } from "@jsv/protocol";
// So we need to ensure that works.

import {
  createCallbackStartEvent,
  createEnqueueMicrotaskEvent,
  createEnqueueTaskEvent,
} from "@/lib/interactive";

const generateId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export type WebApiPendingType =
  | "timer"
  | "io"
  | "immediate"
  | "pending"
  | "api";
export type WebApiItem = {
  id: string;
  label: string;
  type: WebApiPendingType;
  start: number;
  duration: number;
  sourceLine?: number;
};

export function useReplayEngine(
  initialExampleId: string,
  timelineMode: "deterministic" | "realtime",
  speed: number,
) {
  const [exampleId, setExampleId] = React.useState(initialExampleId);
  const [code, setCode] = React.useState(
    examples[initialExampleId]?.code || "",
  );
  const [replay, setReplay] = React.useState<ReplayState>(() =>
    createReplayState([]),
  );
  const [autoPlay, setAutoPlay] = React.useState(false);
  const [isCodeDirty, setIsCodeDirty] = React.useState(false);
  const [isLoadingCode, setIsLoadingCode] = React.useState(false);
  const [runtimeOutputErrors, setRuntimeOutputErrors] = React.useState<
    string[]
  >([]);
  const [resetKey, setResetKey] = React.useState(0);
  const [pendingWebAPIs, setPendingWebAPIs] = React.useState<WebApiItem[]>([]);

  // --- Auto Play Logic ---
  const computeAutoDelay = React.useCallback(
    (prevReplay: ReplayState, nextReplay: ReplayState) => {
      if (timelineMode === "deterministic") {
        return Math.max(150, speed);
      }
      const currentEvent = nextReplay.events[nextReplay.pointer - 1];
      const previousEvent = prevReplay.events[nextReplay.pointer - 2];
      if (!currentEvent || !previousEvent) {
        return Math.max(220, Math.round(speed * 0.6));
      }
      const delta = Math.max(1, currentEvent.ts - previousEvent.ts);
      const speedFactor = Math.max(
        0.2,
        Math.min(4, 1500 / Math.max(200, speed)),
      );
      return Math.max(220, Math.min(2600, Math.round(delta * speedFactor)));
    },
    [speed, timelineMode],
  );

  const advanceReplayByOne = (input: ReplayState): ReplayState => {
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
  };

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

  React.useEffect(() => {
    if (!autoPlay) return;
    let timer: number;
    let cancelled = false;

    const scheduleNext = (delay: number) => {
      timer = window.setTimeout(() => {
        if (cancelled) return;
        let nextDelay = delay;
        setReplay((prev) => {
          const next = advanceReplayByOne(prev);
          if (next === prev) {
            cancelled = true;
            setAutoPlay(false);
            return prev;
          }
          nextDelay = computeAutoDelay(prev, next);
          return next;
        });
        if (!cancelled) {
          scheduleNext(nextDelay);
        }
      }, delay);
    };
    scheduleNext(
      timelineMode === "deterministic"
        ? speed
        : Math.max(220, Math.round(speed * 0.6)),
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [autoPlay, computeAutoDelay, speed, timelineMode]);

  const pushRuntimeOutputError = React.useCallback((message: string) => {
    setRuntimeOutputErrors((prev) => [...prev, message]);
  }, []);

  const loadReplayFromEditorCode = React.useCallback(async () => {
    if (isLoadingCode) {
      return false;
    }

    const trimmed = code.trim();
    if (trimmed.length === 0) {
      const message = "Editor code is empty";
      pushRuntimeOutputError(message);
      toast.error(message);
      return false;
    }

    setIsLoadingCode(true);
    setAutoPlay(false);
    try {
      const events = await runCode(trimmed, { language: "js" });
      if (events.length === 0) {
        const message = "No runtime events received from backend";
        pushRuntimeOutputError(message);
        toast.error(message);
        return false;
      }

      setReplay(createReplayState(events));
      setPendingWebAPIs([]);
      setResetKey((prev) => prev + 1);
      setIsCodeDirty(false);
      setRuntimeOutputErrors([]);
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to execute editor code";
      pushRuntimeOutputError(message);
      toast.error(message);
      return false;
    } finally {
      setIsLoadingCode(false);
    }
  }, [code, isLoadingCode, pushRuntimeOutputError]);

  const ensureEditorReplaySynced = React.useCallback(async () => {
    if (!isCodeDirty && replay.events.length > 0) {
      return true;
    }
    return loadReplayFromEditorCode();
  }, [isCodeDirty, loadReplayFromEditorCode, replay.events.length]);

  const handleNextStep = React.useCallback(async () => {
    if (autoPlay || isLoadingCode) {
      return;
    }
    const ready = await ensureEditorReplaySynced();
    if (!ready) {
      return;
    }
    advanceReplay(1);
  }, [advanceReplay, autoPlay, ensureEditorReplaySynced, isLoadingCode]);

  const handleRunAtOnce = React.useCallback(async () => {
    if (isLoadingCode) {
      return;
    }
    if (autoPlay) {
      setAutoPlay(false);
      return;
    }
    const ready = await ensureEditorReplaySynced();
    if (!ready) {
      return;
    }
    setAutoPlay(true);
  }, [autoPlay, ensureEditorReplaySynced, isLoadingCode]);

  const handleReset = React.useCallback(() => {
    setAutoPlay(false);
    setReplay((prev) => createReplayState(prev.events));
    setPendingWebAPIs([]);
    setRuntimeOutputErrors([]);
    setResetKey((prev) => prev + 1);
    toast.info("Reset");
  }, []);

  // --- Keyboard Shortcuts ---
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if (e.code === "Space") {
        e.preventDefault();
        void handleRunAtOnce();
      } else if (e.code === "KeyR") {
        handleReset();
      } else if (e.code === "ArrowRight") {
        void handleNextStep();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNextStep, handleRunAtOnce, handleReset]);

  // --- Example Switching ---
  React.useEffect(() => {
    if (examples[exampleId]) {
      setCode(examples[exampleId].code);
      if (examples[exampleId].events) {
        setReplay(createReplayState(examples[exampleId].events));
        setIsCodeDirty(false);
      } else {
        setReplay(createReplayState([]));
        setIsCodeDirty(true);
      }
      setAutoPlay(false);
      setPendingWebAPIs([]);
      setRuntimeOutputErrors([]);
    }
  }, [exampleId]);

  // --- Interactive/DnD Logic (Schedule Event) ---
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
          scheduleEvent(createEnqueueTaskEvent("poll", label), label);
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

  return {
    // State
    replay,
    code,
    exampleId,
    autoPlay,
    isCodeDirty,
    isLoadingCode,
    runtimeOutputErrors,
    resetKey,
    pendingWebAPIs,

    // Setters
    setExampleId,
    setCode,
    setIsCodeDirty,

    // Actions
    handleNextStep,
    handleRunAtOnce,
    handleReset,
    handleScheduleTask,
    scheduleEvent, // Exposed for Dnd
  };
}

import React from "react";
import { type ReplayState } from "@/lib/replay";
import { type VisualizerEvent } from "@jsv/protocol";
import { DropZone } from "../features/runtime/DropZone";
import { useFontSize } from "../context/FontSizeContext";
import { TextSizeControl } from "../components/ui/TextSizeControl";

// Components
import { CallStack } from "../features/visualizer/components/CallStack";
import { WebAPIs } from "../features/visualizer/components/WebAPIs";
import { EventLoopSpinner } from "../features/visualizer/components/EventLoopSpinner";
import { TimerHeap } from "../features/visualizer/components/TimerHeap";
import { MicrotaskQueue } from "../features/visualizer/components/MicrotaskQueue";
import { HorizontalQueue } from "../features/visualizer/components/HorizontalQueue";

import type { WebApiItem } from "../features/runtime/useReplayEngine";

type VisualizerLayoutProps = {
  state: ReplayState["state"];
  lastEvent: VisualizerEvent | null;
  visibleWebApiItems: WebApiItem[];
  isRunning: boolean;
  focusClassForBox: (boxId: string) => string;
};

export function VisualizerLayout({
  state,
  lastEvent,
  visibleWebApiItems,
  isRunning,
  focusClassForBox,
}: VisualizerLayoutProps) {
  const queueState = state.queues;

  return (
    <div className="flex w-[44%] flex-col border-r border-slate-800 bg-[#0d1117] p-2 min-h-0 overflow-hidden h-full">
      {/* Visualizer Content: Full Height Container */}
      <div className="flex gap-2.5 flex-1 min-h-0 w-full px-1">
        {/* Left: Call Stack - tall, full height, scrollable */}
        <div
          className={`w-[238px] shrink-0 h-full flex flex-col transition-all duration-300 ${focusClassForBox("box-stack")}`}
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
        <div className="flex-1 min-h-0 grid grid-rows-[minmax(0,0.95fr)_minmax(0,0.74fr)_minmax(0,0.86fr)_minmax(1,1.25fr)] gap-2.5 overflow-hidden">
          {/* Band 1: Web APIs & Event Loop */}
          <div className="grid grid-cols-2 gap-2.5 min-h-0">
            <div
              className={`flex-1 transition-all duration-300 ${focusClassForBox("box-webapi")}`}
            >
              <DropZone id="box-webapi" className="h-full">
                <WebAPIs
                  pendingItems={visibleWebApiItems}
                  handles={state.activeHandles}
                  requests={state.activeRequests}
                  pollWait={state.pollWait}
                />
              </DropZone>
            </div>

            <div
              className={`flex-1 flex items-center justify-center transition-all duration-300 ${focusClassForBox("box-loop")}`}
            >
              <EventLoopSpinner
                active={isRunning}
                phase={state.phase}
                pollWait={state.pollWait}
              />
            </div>
          </div>

          {/* Band 2: Timer Heap */}
          <div
            className={`min-h-0 transition-all duration-300 ${focusClassForBox("box-timer-heap")}`}
          >
            <TimerHeap
              timers={state.timerHeap}
              isActive={
                lastEvent?.type === "TIMER_HEAP_SCHEDULE" ||
                lastEvent?.type === "TIMER_HEAP_READY" ||
                state.timerHeap.length > 0
              }
            />
          </div>

          {/* Band 3: Microtask Queue */}
          <div
            className={`min-h-0 transition-all duration-300 ${focusClassForBox("box-microtask")}`}
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

          {/* Band 4: Macrotask Queues */}
          <div className="grid grid-cols-3 gap-2 min-h-0">
            <HorizontalQueue
              boxId="box-timers"
              title="Timers"
              color="#fca5a5"
              tasks={queueState.timers}
              isActive={state.phase === "timers"}
              className={`transition-all duration-300 ${focusClassForBox("box-timers")}`}
            />
            <HorizontalQueue
              boxId="box-pending"
              title="Pending"
              color="#fdba74"
              tasks={queueState.pending}
              isActive={state.phase === "pending"}
              className={`transition-all duration-300 ${focusClassForBox("box-pending")}`}
            />
            <HorizontalQueue
              boxId="box-poll"
              title="Poll / I/O"
              color="#d8b4fe"
              tasks={queueState.poll}
              isActive={state.phase === "poll"}
              className={`transition-all duration-300 ${focusClassForBox("box-poll")}`}
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
  );
}

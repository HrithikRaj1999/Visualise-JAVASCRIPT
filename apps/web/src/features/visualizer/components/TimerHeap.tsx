import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { type SourceRange } from "@jsv/protocol";
import { useRectRegistry } from "../../animation/RectRegistry";
import { NeonBox } from "../../../components/ui/NeonBox";

export function TimerHeap({
  timers,
  isActive = false,
}: {
  timers: { id: string; label: string; source?: SourceRange }[];
  isActive?: boolean;
}) {
  const { register } = useRectRegistry();
  return (
    <NeonBox
      id="box-timer-heap"
      title="Timers Heap"
      color="#fb7185"
      className={`h-full min-h-0 ${
        isActive
          ? "ring-2 ring-rose-300/70 shadow-[0_0_18px_rgba(251,113,133,0.25)]"
          : ""
      }`}
    >
      <div className="flex h-full flex-col gap-1.5 overflow-auto p-1.5">
        <AnimatePresence mode="popLayout">
          {timers.map((timer, index) => (
            <motion.div
              key={timer.id}
              layoutId={`timer-heap-${timer.id}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="rounded border border-rose-400/35 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-100"
              id={`token-timer-heap-${timer.id}`}
              ref={(el) => register(`token-timer-heap-${timer.id}`, el)}
            >
              <div className="truncate">{timer.label}</div>
              {index === 0 && (
                <div className="mt-0.5 text-[10px] uppercase tracking-wide text-rose-200">
                  Next Expiry
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {timers.length === 0 && (
          <div className="flex h-full items-center justify-center text-xs text-slate-600 italic">
            Empty
          </div>
        )}
      </div>
    </NeonBox>
  );
}

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { type SourceRange } from "@jsv/protocol";
import { useRectRegistry } from "../../animation/RectRegistry";
import { NeonBox } from "../../../components/ui/NeonBox";

export function MicrotaskQueue({
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
      className={`h-full min-h-0 ${
        isActive
          ? "ring-2 ring-cyan-300/80 shadow-[0_0_18px_rgba(34,211,238,0.25)]"
          : ""
      }`}
    >
      <div className="flex h-full flex-col gap-1.5 overflow-auto p-1.5">
        <div>
          <div className="mb-1 text-xs uppercase tracking-wider text-cyan-400">
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
                  className="min-w-[112px] rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-center text-xs text-cyan-200"
                  id={`token-${task.id}`}
                  data-source-line={task.source?.line}
                  ref={(el) => register(`token-${task.id}`, el)}
                >
                  <div className="truncate">{task.label}</div>
                  {index === 0 && (
                    <div className="mt-0.5 text-[10px] uppercase tracking-wide text-cyan-300">
                      Next
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs uppercase tracking-wider text-cyan-400">
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
                  className="min-w-[112px] rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-center text-xs text-cyan-200"
                  id={`token-${task.id}`}
                  data-source-line={task.source?.line}
                  ref={(el) => register(`token-${task.id}`, el)}
                >
                  <div className="truncate">{task.label}</div>
                  {index === 0 && (
                    <div className="mt-0.5 text-[10px] uppercase tracking-wide text-cyan-300">
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

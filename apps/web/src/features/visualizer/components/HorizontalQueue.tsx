import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { type SourceRange } from "@jsv/protocol";
import { useRectRegistry } from "../../animation/RectRegistry";
import { NeonBox } from "../../../components/ui/NeonBox";

export function HorizontalQueue({
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
      <div className="flex flex-1 items-center gap-1.5 overflow-x-auto p-1.5 custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {tasks.map((task, index) => (
            <motion.div
              key={task.id}
              layoutId={task.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="shrink-0 rounded border px-2.5 py-1 text-center text-[11px] font-medium shadow-sm"
              style={{
                borderColor: `${color}50`,
                backgroundColor: `${color}15`,
                color: `${color}ee`,
                minWidth: "62px",
              }}
              id={`token-${task.id}`}
              data-source-line={task.source?.line}
              ref={(el) => register(`token-${task.id}`, el)}
            >
              <div className="truncate">{task.label}</div>
              {index === 0 && (
                <div className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-300">
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

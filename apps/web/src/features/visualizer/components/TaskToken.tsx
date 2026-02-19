import React from "react";
import { motion } from "framer-motion";
import { type SourceRange } from "@jsv/protocol";
import { useRectRegistry } from "../../animation/RectRegistry";

export function TaskToken({
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
      initial={{ scale: 0.9, opacity: 0, y: 10 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.9, opacity: 0, transition: { duration: 0.2 } }}
      className="group relative mb-1.5 flex items-center justify-between overflow-hidden rounded-lg border bg-gradient-to-r from-slate-900 to-slate-800/80 px-2.5 py-1.5 text-xs font-medium shadow-md transition-all hover:border-opacity-100 hover:shadow-lg hover:brightness-110 max-w-full"
      style={{
        borderColor: `${color}40`,
        borderLeftWidth: "4px",
        borderLeftColor: color,
        boxShadow: `0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.1)`,
      }}
      data-source-line={source?.line}
      ref={(el) => register(`token-${id}`, el)}
    >
      {/* Glossy highlight effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none" />

      <span
        className="truncate font-mono text-slate-200 z-10 relative mr-2 flex-1"
        title={label}
      >
        {label}
      </span>
      {badge && (
        <span className="shrink-0 rounded bg-slate-800/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400 border border-slate-700 z-10 relative">
          {badge}
        </span>
      )}
    </motion.div>
  );
}

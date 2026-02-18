import React from "react";
import type { ExecutionFocus } from "@jsv/protocol/src/events";

export function FocusBar({ focus }: { focus: ExecutionFocus }) {
  if (focus.activeBox === "IDLE") {
    return (
      <div className="flex items-center gap-4 border-b border-slate-800 bg-[#0d1117]/50 backdrop-blur px-4 py-2 font-mono text-xs text-slate-500">
        IDLE
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 border-b border-slate-800 bg-[#0d1117]/90 backdrop-blur px-4 py-2 font-mono text-xs text-slate-400 transition-colors duration-300">
      <div className="flex items-center gap-2">
        <span className="text-blue-400 animate-pulse">▶</span>
        <span className="font-bold text-slate-200 uppercase tracking-wider">
          {focus.activeBox}
        </span>
      </div>
      {focus.activeTokenId && (
        <div className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
          {focus.activeTokenId}
        </div>
      )}
      {focus.reason && (
        <div className="text-slate-500 italic">// {focus.reason}</div>
      )}
      {focus.activeRange && (
        <div className="ml-auto text-xs text-slate-600">
          Ln {focus.activeRange.line}, Col {focus.activeRange.col}
        </div>
      )}
    </div>
  );
}

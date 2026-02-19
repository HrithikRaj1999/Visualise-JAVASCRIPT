import React from "react";
import { useFontSize } from "../../context/FontSizeContext";
import { TextSizeControl } from "../../components/ui/TextSizeControl";
import { FlowAnchor } from "../../components/ui/FlowAnchor";

type LogEntry = {
  level: "log" | "error" | "warn" | "info";
  args: unknown[];
};

type ErrorEntry = {
  message: string;
};

type ConsolePanelProps = {
  logs: LogEntry[];
  errors: ErrorEntry[];
  runtimeErrors?: string[];
};

export function ConsolePanel({
  logs,
  errors,
  runtimeErrors = [],
}: ConsolePanelProps) {
  const { scale } = useFontSize("box-code-output");

  return (
    <div
      id="box-code-output"
      className="relative flex flex-col min-h-0 border-t border-slate-800 transition-all duration-300 group/output h-full bg-[#0d1117]"
    >
      <FlowAnchor id="anchor-code-output-center" />
      <div className="border-b border-slate-800 bg-[#0d1117] px-4 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-widest shrink-0 flex justify-between items-center">
        <span
          style={{
            fontSize: `${scale * 0.75}rem`,
          }}
        >
          User Console Output
        </span>
        <div className="opacity-0 group-hover/output:opacity-100 transition-opacity duration-200">
          <TextSizeControl boxId="box-code-output" />
        </div>
      </div>
      <div
        id="box-code-output-body"
        className="flex-1 overflow-auto p-3 font-mono space-y-1.5 min-h-0 transition-all duration-200 origin-top-left"
        style={{
          fontSize: `${scale * 0.85}rem`,
        }}
      >
        {logs.length === 0 &&
          errors.length === 0 &&
          runtimeErrors.length === 0 && (
            <span className="text-slate-600 italic">
              No user console output
            </span>
          )}
        {logs.map((log, i) => (
          <div key={`log-${i}`} className="flex gap-2">
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
                  typeof arg === "object" ? JSON.stringify(arg) : String(arg),
                )
                .join(" ")}
            </span>
          </div>
        ))}
        {errors.map((error, i) => (
          <div key={`error-${i}`} className="text-red-400 text-[11px]">
            x {error.message}
          </div>
        ))}
        {runtimeErrors.map((message, i) => (
          <div
            key={`runtime-load-error-${i}`}
            className="text-red-400 text-[11px]"
          >
            x {message}
          </div>
        ))}
      </div>
    </div>
  );
}

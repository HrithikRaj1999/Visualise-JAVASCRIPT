import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { type ReplayState } from "@/lib/replay";
import { useRectRegistry } from "../../animation/RectRegistry";
import { NeonBox } from "../../../components/ui/NeonBox";
import type { WebApiItem } from "../../runtime/useReplayEngine";

export function WebAPIs({
  pendingItems,
  handles,
  requests,
  pollWait,
  children,
}: {
  pendingItems: WebApiItem[];
  handles: ReplayState["state"]["activeHandles"];
  requests: ReplayState["state"]["activeRequests"];
  pollWait: ReplayState["state"]["pollWait"];
  children?: React.ReactNode;
}) {
  const { register } = useRectRegistry();

  return (
    <NeonBox
      id="box-webapi"
      title="Web APIs"
      color="#d946ef"
      className="h-full min-h-0 bg-[#0f172a]/40"
    >
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at center, #d946ef 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      ></div>
      <div className="relative z-10 mb-1.5 grid grid-cols-2 gap-1.5 p-1.5 text-[10px] uppercase tracking-wide">
        <div className="rounded border border-fuchsia-400/30 bg-fuchsia-500/10 px-2 py-1 text-fuchsia-200 text-center">
          Handles: {handles.length}
        </div>
        <div className="rounded border border-indigo-400/30 bg-indigo-500/10 px-2 py-1 text-indigo-200 text-center">
          Requests: {requests.length}
        </div>
        <div
          className={`col-span-2 rounded border px-2 py-1 text-center ${
            pollWait.active
              ? "border-amber-300/40 bg-amber-500/10 text-amber-200"
              : "border-slate-700 bg-slate-800/50 text-slate-400"
          }`}
        >
          Poll: {pollWait.active ? "waiting" : "ready"}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-1.5 p-1.5 overflow-auto max-h-full relative z-10">
        <AnimatePresence>
          {pendingItems.map((item) => (
            <motion.div
              key={item.id}
              id={item.id}
              ref={(el) => register(item.id, el)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center justify-center rounded border border-slate-700 bg-slate-800 p-1.5 text-center relative overflow-hidden"
            >
              <div
                className={`text-xs uppercase font-bold z-10 ${
                  item.type === "timer"
                    ? "text-rose-300"
                    : item.type === "io"
                      ? "text-indigo-300"
                      : item.type === "immediate"
                        ? "text-amber-300"
                        : item.type === "pending"
                          ? "text-orange-300"
                          : "text-purple-300"
                }`}
              >
                {item.type}
              </div>
              <div className="text-xs text-white truncate w-full z-10">
                {item.label}
              </div>
              {/* Progress Bar */}
              <motion.div
                className={`absolute bottom-0 left-0 h-1 ${
                  item.type === "timer"
                    ? "bg-rose-400"
                    : item.type === "io"
                      ? "bg-indigo-400"
                      : item.type === "immediate"
                        ? "bg-amber-400"
                        : item.type === "pending"
                          ? "bg-orange-400"
                          : "bg-purple-500"
                }`}
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: item.duration / 1000, ease: "linear" }}
              />
            </motion.div>
          ))}
        </AnimatePresence>
        {children}
        {pendingItems.length === 0 && !children && (
          <div className="col-span-1 flex h-full items-center justify-center text-xs text-slate-600 italic">
            Idle
          </div>
        )}
      </div>
    </NeonBox>
  );
}

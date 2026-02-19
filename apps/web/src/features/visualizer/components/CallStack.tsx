import React from "react";
import { AnimatePresence } from "framer-motion";
import { type SourceRange } from "@jsv/protocol";
import { NeonBox } from "../../../components/ui/NeonBox";
import { FlowAnchor } from "../../../components/ui/FlowAnchor";
import { TaskToken } from "./TaskToken";

export function CallStack({
  stack,
  children,
  isActive = false,
}: {
  stack: { id: string; label: string; source?: SourceRange }[];
  children?: React.ReactNode;
  isActive?: boolean;
}) {
  return (
    <NeonBox
      id="box-stack"
      title="Call Stack"
      color="#f97316"
      className={`h-full min-h-0 ${
        isActive
          ? "ring-2 ring-orange-400/80 shadow-[0_0_20px_rgba(249,115,22,0.25)]"
          : ""
      }`}
    >
      <FlowAnchor id="anchor-stack-center" />
      <div className="flex h-full flex-col justify-start overflow-auto p-2">
        <AnimatePresence mode="popLayout">
          {[...stack].reverse().map((frame, index) => (
            <TaskToken
              key={frame.id}
              id={frame.id}
              label={frame.label}
              color="#f97316" // Orange
              source={frame.source}
              badge={index === 0 ? "Top" : undefined}
            />
          ))}
        </AnimatePresence>
        {children}
        {stack.length === 0 && !children && (
          <div className="flex h-full items-center justify-center text-xs text-slate-600 italic">
            Stack Empty
          </div>
        )}
      </div>
    </NeonBox>
  );
}

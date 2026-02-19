import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { VisualizerEvent } from "@jsv/protocol";
import { useRectRegistry } from "./RectRegistry";

const TASK_QUEUE_TO_BOX: Record<"timers" | "io" | "check" | "close", string> = {
  timers: "box-timers",
  io: "box-io",
  check: "box-check",
  close: "box-close",
};

type GhostToken = {
  id: string;
  label: string;
  sourceRect: DOMRect;
  targetRect: DOMRect;
  color: string;
};

export function GhostOverlay({
  lastEvent,
  resetKey,
}: {
  lastEvent: VisualizerEvent | null;
  resetKey: number; // Increment to clear ghosts
}) {
  const { getRect } = useRectRegistry();
  const [ghosts, setGhosts] = useState<GhostToken[]>([]);

  // Clear ghosts when resetKey changes
  useEffect(() => {
    setGhosts([]);
  }, [resetKey]);

  useEffect(() => {
    if (!lastEvent) return;

    let sourceId: string | null = null;
    let targetId: string | null = null;
    let label = "";
    let color = "cyan"; // default

    // Determine Source & Target based on Event
    switch (lastEvent.type) {
      case "WEBAPI_SCHEDULE":
        if (lastEvent.source) {
          sourceId = `code-line-${lastEvent.source.line}`;
        }
        targetId = "box-webapi";
        label = "Timer";
        color = "#d946ef";
        break;

      case "ENQUEUE_MICROTASK":
        if (lastEvent.source) {
          sourceId = `code-line-${lastEvent.source.line}`;
        }
        targetId = "box-microtask";
        label = "Promise";
        color = "#22d3ee";
        break;

      case "ENQUEUE_TASK":
        if (lastEvent.queue === "timers" || lastEvent.queue === "io") {
          sourceId = "box-webapi";
        } else {
          if (lastEvent.source) {
            sourceId = `code-line-${lastEvent.source.line}`;
          }
        }
        targetId = TASK_QUEUE_TO_BOX[lastEvent.queue];
        label = lastEvent.label || "Task";
        color = "#fbbf24";
        break;
    }

    if (sourceId && targetId) {
      const sRect = getRect(sourceId);
      const tRect = getRect(targetId);

      if (sRect && tRect) {
        const id = Math.random().toString(36);
        setGhosts((prev) => [
          ...prev,
          {
            id,
            label, // Pass visual label
            sourceRect: sRect,
            targetRect: tRect,
            color,
          },
        ]);
      }
    }
  }, [lastEvent, getRect]);

  const removeGhost = (id: string) => {
    setGhosts((prev) => prev.filter((g) => g.id !== id));
  };

  return createPortal(
    <div className="fixed inset-0 pointer-events-none z-[100]">
      <AnimatePresence>
        {ghosts.map((ghost) => (
          <motion.div
            key={ghost.id}
            initial={{
              top: ghost.sourceRect.top,
              left: ghost.sourceRect.left,
              width: ghost.sourceRect.width,
              height: ghost.sourceRect.height,
              opacity: 0.8,
              scale: 1,
            }}
            animate={{
              top: ghost.targetRect.top,
              left: ghost.targetRect.left,
              width: ghost.sourceRect.width, // Keep width? Or shrink to box?
              height: 28, // Fixed height for label
              x: ghost.targetRect.width / 2 - ghost.sourceRect.width / 2,
              y: ghost.targetRect.height / 2 - 14,
              opacity: 0,
              scale: 0.5,
            }}
            transition={{ duration: 1.2, ease: "easeInOut" }}
            onAnimationComplete={() => removeGhost(ghost.id)}
            style={{
              position: "absolute",
              backgroundColor: ghost.color,
              borderRadius: "4px",
              boxShadow: `0 0 10px ${ghost.color}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#000",
              fontWeight: "bold",
              fontSize: "12px",
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}
          >
            {ghost.label}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

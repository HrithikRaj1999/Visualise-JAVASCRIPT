import React, { useEffect, useState } from "react";

const BOX_IDS = [
  "box-stack",
  "box-webapi",
  "box-timer-heap",
  "box-timers",
  "box-pending",
  "box-poll",
  "box-check",
  "box-close",
  "box-microtask",
  "box-loop",
  "box-code",
];

export function DebugOverlay() {
  const [rects, setRects] = useState<Record<string, DOMRect>>({});
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!visible) return;

    const updateRects = () => {
      const newRects: Record<string, DOMRect> = {};
      BOX_IDS.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          newRects[id] = el.getBoundingClientRect();
        }
      });
      setRects(newRects);
    };

    updateRects();
    window.addEventListener("resize", updateRects);
    window.addEventListener("scroll", updateRects);

    const interval = setInterval(updateRects, 1000);

    return () => {
      window.removeEventListener("resize", updateRects);
      window.removeEventListener("scroll", updateRects);
      clearInterval(interval);
    };
  }, [visible]);

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="fixed bottom-4 right-4 z-[9999] rounded bg-red-600 px-2 py-1 text-xs font-bold text-white shadow-lg opacity-50 hover:opacity-100"
      >
        DEBUG LAYOUT
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      <button
        onClick={() => setVisible(false)}
        className="fixed bottom-4 right-4 pointer-events-auto rounded bg-slate-800 border border-slate-600 px-2 py-1 text-xs font-bold text-white shadow-lg"
      >
        HIDE DEBUG
      </button>
      {Object.entries(rects).map(([id, rect]) => (
        <div
          key={id}
          className="absolute border-2 border-red-500 bg-red-500/10"
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          }}
        >
          <span className="absolute -top-5 left-0 bg-red-600 text-[10px] text-white px-1">
            {id} ({Math.round(rect.width)}x{Math.round(rect.height)})
          </span>
        </div>
      ))}
    </div>
  );
}

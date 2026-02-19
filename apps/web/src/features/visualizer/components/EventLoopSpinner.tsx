import React from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { type ReplayState } from "@/lib/replay";
import { NeonBox } from "../../../components/ui/NeonBox";

export function EventLoopSpinner({
  active,
  phase,
  pollWait,
}: {
  active: boolean;
  phase: ReplayState["state"]["phase"];
  pollWait: ReplayState["state"]["pollWait"];
}) {
  const spinnerRef = React.useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (active) {
      gsap.to(spinnerRef.current, {
        rotation: 360,
        duration: 1,
        repeat: -1,
        ease: "linear",
      });
    } else {
      gsap.to(spinnerRef.current, { rotation: 0, duration: 0.5 });
    }
  }, [active]);

  return (
    <NeonBox
      id="box-loop"
      title="Event Loop"
      color="#fbbf24"
      className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-2"
    >
      <div className="relative flex items-center justify-center">
        {/* Glow Effect */}
        <div
          className={`absolute inset-0 rounded-full bg-amber-400/30 blur-xl transition-all duration-700 ${active ? "opacity-100 scale-150" : "opacity-0 scale-50"}`}
        />

        <div ref={spinnerRef} className="relative h-12 w-12 z-10">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-full w-full drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </div>
      </div>
      <div
        className={`text-center text-xs font-mono font-bold tracking-widest transition-colors ${active ? "text-amber-300 drop-shadow-[0_0_5px_rgba(251,191,36,0.8)]" : "text-amber-200/50"}`}
      >
        {active ? "RUNNING" : "IDLE"}
      </div>
      <div className="text-[11px] font-mono uppercase tracking-wider text-amber-200/70">
        {pollWait.active ? "POLL WAIT" : (phase ?? "idle")}
      </div>
    </NeonBox>
  );
}

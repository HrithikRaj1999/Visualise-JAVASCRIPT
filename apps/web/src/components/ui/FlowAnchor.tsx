import React from "react";
import { useRegisterRect } from "../../features/animation/RectRegistry";

export function FlowAnchor({ id }: { id: string }) {
  const setRef = useRegisterRect(id);
  return (
    <div
      id={id}
      ref={setRef}
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 opacity-0"
    />
  );
}

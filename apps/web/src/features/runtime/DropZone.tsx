import React, { useCallback } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useRegisterRect } from "../animation/RectRegistry";

interface DropZoneProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  pulse?: boolean;
}

export function DropZone({ id, children, className, pulse }: DropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });
  const registerRect = useRegisterRect(id);
  const [justArrived, setJustArrived] = React.useState(false);
  const prevCount = React.useRef(React.Children.count(children));

  const setRef = useCallback(
    (node: HTMLElement | null) => {
      setNodeRef(node);
      registerRect(node);
    },
    [setNodeRef, registerRect],
  );

  React.useEffect(() => {
    const count = React.Children.count(children);
    if (count > prevCount.current) {
      setJustArrived(true);
      const t = setTimeout(() => setJustArrived(false), 500);
      return () => clearTimeout(t);
    }
    prevCount.current = count;
  }, [children]);

  return (
    <div
      ref={setRef}
      className={`transition-all duration-300 ${className} 
        ${isOver ? "ring-2 ring-yellow-400 bg-yellow-400/10" : ""}
        ${justArrived ? "ring-2 ring-emerald-400 bg-emerald-400/10 scale-[1.02]" : ""}
      `}
    >
      {children}
    </div>
  );
}

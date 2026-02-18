import React from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

interface DraggableTokenProps {
  id: string;
  label: string;
  color?: string;
  className?: string;
  onAction?: () => void;
}

export function DraggableToken({
  id,
  label,
  color = "#3b82f6",
  className,
  onAction,
}: DraggableTokenProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id,
      data: { label, color },
    });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    backgroundColor: "#1e293b",
    borderColor: isDragging ? "#fbbf24" : color,
    color: isDragging ? "#fbbf24" : "#e2e8f0",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        if (!isDragging && onAction) {
          onAction();
          e.stopPropagation();
        }
      }}
      className={`relative cursor-grab active:cursor-grabbing select-none rounded-md border border-l-4 px-3 py-2 text-xs font-medium shadow-sm transition-shadow ${className}`}
    >
      <span className="truncate">{label}</span>
      {isDragging && <div className="absolute inset-0 z-50 bg-transparent" />}
    </div>
  );
}

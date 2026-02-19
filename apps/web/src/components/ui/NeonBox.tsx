import React from "react";
import { useFontSize } from "../../context/FontSizeContext";
import { TextSizeControl } from "./TextSizeControl";

function BoxHeader({
  title,
  color,
  boxId,
}: {
  title: string;
  color: string;
  boxId?: string;
}) {
  const { scale } = boxId ? useFontSize(boxId) : { scale: 1 };

  return (
    <div
      className="absolute top-1 left-1/2 -translate-x-1/2 rounded-full border px-4 py-1 font-bold uppercase tracking-wider bg-[#0d1117] shadow-lg transition-all whitespace-nowrap z-50"
      style={{
        borderColor: `${color}40`,
        color: color,
        boxShadow: `0 0 15px ${color}20`,
        fontSize: `${0.75 * scale}rem`, // Base xs (0.75rem) * scale
        padding: `${0.25 * scale}rem ${1.25 * scale}rem`,
      }}
    >
      {title}
    </div>
  );
}

export function NeonBox({
  id,
  title,
  color,
  children,
  className = "",
}: {
  id?: string;
  title: string;
  color: string;
  children: React.ReactNode;
  className?: string;
}) {
  // Use "unknown-box" if no ID provided, though all boxes should have IDs now.
  const safeId = id || "unknown-box";
  const { scale } = useFontSize(safeId);

  return (
    <div
      id={id}
      className={`relative rounded-xl border bg-slate-900/40 backdrop-blur-sm px-3 pb-3 pt-8 transition-all duration-300 group/box ${className}`}
      style={{
        borderColor: `${color}30`,
        boxShadow: `0 0 30px -10px ${color}15, inset 0 0 20px ${color}05`,
      }}
    >
      <BoxHeader title={title} color={color} boxId={safeId} />

      {/* Settings Control - Visible on hover or when open */}
      <div className="opacity-0 group-hover/box:opacity-100 transition-opacity duration-200 absolute top-2 right-2">
        <TextSizeControl boxId={safeId} />
      </div>

      {/* Content Wrapper with Scaling */}
      <div
        className="w-full h-full min-h-0 transition-all duration-200 origin-top-left"
        style={{
          fontSize: `${scale}rem`,
          lineHeight: scale > 1.2 ? 1.4 : 1.5,
        }}
      >
        {children}
      </div>
    </div>
  );
}

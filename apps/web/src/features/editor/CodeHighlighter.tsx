import React from "react";
import { type SourceRange } from "@jsv/protocol";
import { useRectRegistry } from "../animation/RectRegistry";

export function CodeHighlighter({
  code,
  activeRange,
  viewportRef,
}: {
  code: string;
  activeRange?: SourceRange | undefined;
  viewportRef?: React.RefObject<HTMLDivElement>;
}) {
  const lines = code.split("\n");
  const { register } = useRectRegistry();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const lastScrolledLineRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!activeRange?.line || !scrollRef.current || !viewportRef?.current) {
      lastScrolledLineRef.current = null;
      return;
    }
    if (lastScrolledLineRef.current === activeRange.line) {
      return;
    }
    const lineEl = scrollRef.current.children[activeRange.line - 1] as
      | HTMLElement
      | undefined;
    if (lineEl) {
      const viewport = viewportRef.current;
      const lineRect = lineEl.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const lineMidInViewport =
        lineRect.top -
        viewportRect.top +
        viewport.scrollTop +
        lineRect.height / 2;
      const targetScrollTop = Math.max(
        0,
        lineMidInViewport - viewport.clientHeight / 2,
      );
      viewport.scrollTo({
        top: targetScrollTop,
        behavior: "smooth",
      });
      lastScrolledLineRef.current = activeRange.line;
    }
  }, [activeRange?.line, viewportRef]);

  return (
    <div
      ref={scrollRef}
      className="absolute inset-0 pointer-events-none font-mono text-sm md:text-base p-6 leading-relaxed overflow-hidden"
    >
      {lines.map((line, i) => {
        const lineNumber = i + 1;
        // activeRange is 1-based and may optionally cover multiple lines.
        const startLine = activeRange?.line ?? -1;
        const endLine = activeRange?.endLine ?? startLine;
        const isActive =
          activeRange !== undefined &&
          lineNumber >= startLine &&
          lineNumber <= endLine;

        return (
          <div
            key={i}
            id={`code-line-${lineNumber}`}
            ref={(el) => register(`code-line-${lineNumber}`, el)}
            className={`relative w-full transition-all duration-500 rounded-sm
                ${
                  isActive
                    ? "bg-yellow-500/45 shadow-[0_0_24px_rgba(234,179,8,0.45)] border-l-4 border-yellow-300 pl-5 scale-[1.01]"
                    : "pl-2 border-l-0 border-transparent hover:bg-slate-800/30"
                } 
            `}
          >
            {isActive && (
              <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-yellow-200 text-xs font-bold drop-shadow-[0_0_4px_rgba(250,204,21,0.7)]">
                {">"}
              </span>
            )}
            <span className="opacity-0">{line || " "}</span>
          </div>
        );
      })}
    </div>
  );
}

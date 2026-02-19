import React from "react";
import { type SourceRange } from "@jsv/protocol";
import { useFontSize } from "../../context/FontSizeContext";
import { TextSizeControl } from "../../components/ui/TextSizeControl";
import { CodeHighlighter } from "./CodeHighlighter";

type CodeEditorProps = {
  code: string;
  setCode: (code: string) => void;
  activeRange?: SourceRange;
  isDirty?: boolean;
  onCodeChange?: () => void;
};

export function CodeEditor({
  code,
  setCode,
  activeRange,
  onCodeChange,
}: CodeEditorProps) {
  const codeViewportRef = React.useRef<HTMLDivElement>(null);
  const { scale } = useFontSize("box-code");

  // Determine focus class (this was in main.tsx, assuming passed in or context...
  // actually for now let's keep it simple or accept a prop.
  // main.tsx logic: focusClassForBox("box-code")
  // We can pass `isDimmed` prop if needed. For now, we'll ignore external focus dimming or add it later.
  // actually let's just make it self-contained for now.

  return (
    <div
      id="box-code"
      className={`relative flex-1 min-h-0 overflow-hidden transition-all duration-300 group/code h-full`}
    >
      {/* Settings Control - Visible on hover */}
      <div className="absolute top-2 right-4 z-50 opacity-0 group-hover/code:opacity-100 transition-opacity duration-200">
        <TextSizeControl boxId="box-code" />
      </div>

      <div
        ref={codeViewportRef}
        className="absolute inset-0 overflow-auto custom-scrollbar"
      >
        <div
          className="min-h-full relative transition-all duration-200 origin-top-left"
          style={{
            fontSize: `${scale}rem`,
          }}
        >
          <CodeHighlighter
            code={code}
            activeRange={activeRange}
            viewportRef={codeViewportRef}
          />
          <textarea
            className="w-full h-full min-h-[400px] bg-transparent p-6 font-mono outline-none resize-none leading-relaxed relative z-10 caret-white selection:bg-blue-500/30"
            style={{
              fontSize: "inherit",
              lineHeight: "1.625",
            }}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              onCodeChange?.();
            }}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}

import * as esbuild from "esbuild";
import ts from "typescript";
import { createTransformer } from "./transformer";
import { AppError } from "../lib/errors";
import type { VisualizerEvent } from "@jsv/protocol";

export async function transpileCode(
  code: string,
  language: "js" | "ts" = "js",
): Promise<{ js: string; diagnostics: VisualizerEvent[] }> {
  const result = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      strict: false,
      allowJs: true,
      sourceMap: false,
    },
    reportDiagnostics: true,
    transformers: {
      before: [createTransformer()],
    },
  });

  const diagnostics: VisualizerEvent[] = result.diagnostics?.length
    ? [
        {
          type: "TS_DIAGNOSTIC",
          ts: Date.now(),
          diagnostics: result.diagnostics.map((diagnostic) => {
            const position = diagnostic.file?.getLineAndCharacterOfPosition(
              diagnostic.start ?? 0,
            );
            return {
              message: ts.flattenDiagnosticMessageText(
                diagnostic.messageText,
                "\n",
              ),
              line: (position?.line ?? 0) + 1,
              col: (position?.character ?? 0) + 1,
            };
          }),
        },
      ]
    : [];

  return { js: result.outputText, diagnostics };
}

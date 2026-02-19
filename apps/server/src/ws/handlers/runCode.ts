import { WebSocket } from "ws";
import { transpileCode } from "../../runner/transpile";
import { startWorker } from "../../runner/worker/startWorker";
import { logger } from "../../lib/logger";
import { env } from "../../config/env";

export async function handleRunCode(
  ws: WebSocket,
  payload: { code: string; language?: "js" | "ts"; maxEvents?: number },
) {
  const language = payload.language ?? "js";
  const maxEvents = payload.maxEvents ?? env.MAX_EVENTS;

  logger.info("Handling RUN_CODE", { language, codeLen: payload.code.length });

  try {
    const { js, diagnostics } = await transpileCode(payload.code);

    // Send diagnostics first (TS errors, etc.)
    if (diagnostics && diagnostics.length > 0) {
      diagnostics.forEach((event) => ws.send(JSON.stringify(event)));
    }

    // Proceed to run logic
    if (!js.trim()) {
      ws.send(JSON.stringify({ type: "SCRIPT_END", ts: Date.now() }));
      return;
    }

    const worker = startWorker(
      js,
      (event) => ws.send(JSON.stringify(event)),
      maxEvents,
    );

    worker.once("exit", () => {
      ws.send(JSON.stringify({ type: "SCRIPT_END", ts: Date.now() }));
    });
  } catch (error) {
    logger.error("Failed to run code", error);
    ws.send(
      JSON.stringify({
        type: "RUNTIME_ERROR",
        ts: Date.now(),
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
  }
}

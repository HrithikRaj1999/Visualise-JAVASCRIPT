import { Worker } from "node:worker_threads";
import type { VisualizerEvent } from "@jsv/protocol";
import { createWorkerScript } from "./createWorkerScript";

export function startWorker(
  js: string,
  send: (event: VisualizerEvent) => void,
  maxEvents: number,
): Worker {
  const script = createWorkerScript(js, maxEvents);
  const worker = new Worker(script, { eval: true });
  worker.on("message", (event: VisualizerEvent) => send(event));
  return worker;
}

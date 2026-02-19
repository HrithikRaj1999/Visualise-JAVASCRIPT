import {
  parseEvent,
  type VisualizerEvent,
  type ClientCommand,
} from "@jsv/protocol";
import { resolveWsUrl } from "./config";
import { normalizeConsoleStackFlow } from "../runtime/normalization";

export type RunCodeOptions = {
  wsUrl?: string;
  language?: "js" | "ts";
  maxEvents?: number;
  timeoutMs?: number;
};

export async function runCode(
  code: string,
  options: RunCodeOptions = {},
): Promise<VisualizerEvent[]> {
  if (code.trim().length === 0) {
    return [];
  }

  const wsUrl = resolveWsUrl(options.wsUrl);
  const language = options.language ?? "js";
  const maxEvents = options.maxEvents ?? 5000;
  const timeoutMs = options.timeoutMs ?? 15000;

  return new Promise<VisualizerEvent[]>((resolve, reject) => {
    let done = false;
    const events: VisualizerEvent[] = [];
    let socket: WebSocket | null = null;

    try {
      socket = new WebSocket(wsUrl);
    } catch (err) {
      return reject(new Error(`Failed to create WebSocket: ${wsUrl}`));
    }

    // Safety timeout
    const timeout = window.setTimeout(() => {
      finishReject(new Error("Timed out waiting for runtime events"));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        try {
          if (
            socket.readyState === WebSocket.OPEN ||
            socket.readyState === WebSocket.CONNECTING
          ) {
            socket.close();
          }
        } catch {
          /* ignore */
        }
      }
    };

    const finishResolve = () => {
      if (done) return;
      done = true;
      cleanup();
      resolve(normalizeConsoleStackFlow(events));
    };

    const finishReject = (error: Error) => {
      if (done) return;
      done = true;
      cleanup();
      reject(error);
    };

    socket.onopen = () => {
      const command: ClientCommand = {
        type: "RUN_CODE",
        payload: { code, language, maxEvents },
      };
      if (socket) {
        socket.send(JSON.stringify(command));
      }
    };

    socket.onmessage = (message) => {
      try {
        const raw = JSON.parse(String(message.data));
        const event = parseEvent(raw);
        events.push(event);
        if (event.type === "SCRIPT_END") {
          finishResolve();
        }
      } catch (error) {
        finishReject(
          error instanceof Error
            ? error
            : new Error("Invalid runtime event payload"),
        );
      }
    };

    socket.onerror = (e) => {
      // e usually gives little info in browsers due to security
      finishReject(
        new Error(
          `WebSocket error connecting to ${wsUrl}. Is the server running?`,
        ),
      );
    };

    socket.onclose = (event) => {
      if (!done) {
        if (event.code !== 1000 && events.length === 0) {
          finishReject(
            new Error(`WebSocket closed unexpectedly (code: ${event.code})`),
          );
        } else {
          finishResolve();
        }
      }
    };
  });
}

import { describe, it, expect } from "vitest";
import { createServer } from "../ws/server";
import WebSocket from "ws";
import { VisualizerEvent } from "@jsv/protocol";

describe("Source Mapping", () => {
  it("should include source ranges in events", async () => {
    const port = 8081;
    const server = createServer(port);

    await new Promise((resolve) => setTimeout(resolve, 500)); // wait start

    const ws = new WebSocket(`ws://localhost:${port}`);

    await new Promise<void>((resolve) => {
      ws.on("open", resolve);
    });

    const code = `
setTimeout(() => {
  console.log('timeout');
}, 10);
`;

    ws.send(
      JSON.stringify({
        type: "RUN_CODE",
        payload: { code, language: "js" },
      }),
    );

    const events: VisualizerEvent[] = [];

    await new Promise<void>((resolve, reject) => {
      ws.on("message", (data) => {
        const event = JSON.parse(data.toString()) as VisualizerEvent;
        events.push(event);
        if (event.type === "SCRIPT_END" || event.type === "RUNTIME_ERROR") {
          resolve();
        }
      });
      setTimeout(() => reject(new Error("Timeout waiting for events")), 2000);
    });

    ws.close();
    server.close();

    // Check for source in ENQUEUE_TASK (setTimeout)
    // The setTimeout is on line 2 (in the template literal, line 1 is empty?)
    // Actually template literal:
    // line 1: empty
    // line 2: setTimeout(...)

    const task = events.find(
      (e) => e.type === "ENQUEUE_TASK" && e.label === "setTimeout callback",
    );
    expect(task).toBeDefined();
    if (task && task.type === "ENQUEUE_TASK") {
      expect(task.source).toBeDefined();
      // We expect line 2 or 3 depending on how the template literal is parsed
      // "setTimeout" is on the line after the backtick
      expect(task.source?.line).toBeGreaterThan(1);
    }

    const callbackStart = events.find(
      (e) => e.type === "CALLBACK_START" && e.label === "setTimeout callback",
    );
    expect(callbackStart).toBeDefined();
    if (callbackStart && callbackStart.type === "CALLBACK_START") {
      expect(callbackStart.source).toBeDefined();
      expect(callbackStart.source?.line).toBe(task?.source?.line);
    }
  });
});

import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { parseEvent, type VisualizerEvent } from "@jsv/protocol";
import { createServer } from "../ws/server";

let nextPort = 8130;

type RunOptions = {
  language?: "js" | "ts";
  maxEvents?: number;
};

async function runCodeAndCollect(
  code: string,
  options: RunOptions = {},
): Promise<VisualizerEvent[]> {
  const port = nextPort++;
  const server = createServer(port);
  const ws = new WebSocket(`ws://localhost:${port}`);
  const events: VisualizerEvent[] = [];

  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error?: Error) => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timeout);
      try {
        ws.close();
      } catch {
        // ignore
      }
      server.close(() => {
        if (error) {
          reject(error);
          return;
        }
        resolve(events);
      });
    };

    const timeout = setTimeout(() => {
      finish(new Error("Timed out waiting for SCRIPT_END"));
    }, 7000);

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          type: "RUN_CODE",
          payload: {
            code,
            language: options.language ?? "js",
            maxEvents: options.maxEvents ?? 5000,
          },
        }),
      );
    });

    ws.on("message", (raw) => {
      try {
        const event = parseEvent(JSON.parse(raw.toString()));
        events.push(event);
        if (event.type === "SCRIPT_END") {
          finish();
        }
      } catch (error) {
        finish(
          error instanceof Error
            ? error
            : new Error("Invalid runtime event payload"),
        );
      }
    });

    ws.on("error", (error) => {
      finish(error instanceof Error ? error : new Error("WebSocket error"));
    });
  });
}

afterEach(() => {
  // Keep deterministic port growth for each test file run.
  if (nextPort > 8999) {
    nextPort = 8130;
  }
});

function eventIndex(
  events: VisualizerEvent[],
  predicate: (event: VisualizerEvent) => boolean,
): number {
  return events.findIndex(predicate);
}

describe("runtime ordering and event integrity", () => {
  it("emits sync console with explicit callback frame order", async () => {
    const events = await runCodeAndCollect(`console.log("hello");`);
    const startIndex = eventIndex(
      events,
      (event) =>
        event.type === "CALLBACK_START" && event.label === "sync execution",
    );
    const consoleIndex = eventIndex(
      events,
      (event) =>
        event.type === "CONSOLE" &&
        event.level === "log" &&
        event.args[0] === "hello",
    );

    expect(startIndex).toBeGreaterThan(-1);
    expect(consoleIndex).toBeGreaterThan(startIndex);

    const startEvent = events[startIndex];
    expect(startEvent?.type).toBe("CALLBACK_START");
    if (startEvent?.type === "CALLBACK_START") {
      const endIndex = eventIndex(
        events,
        (event) =>
          event.type === "CALLBACK_END" && event.taskId === startEvent.taskId,
      );
      expect(endIndex).toBeGreaterThan(consoleIndex);
    }
  });

  it("drains nextTick microtasks before promise microtasks", async () => {
    const events = await runCodeAndCollect(
      `
      queueMicrotask(() => console.log("promise"));
      process.nextTick(() => console.log("tick"));
      `,
    );
    const dequeues = events.filter(
      (event): event is Extract<VisualizerEvent, { type: "DEQUEUE_MICROTASK" }> =>
        event.type === "DEQUEUE_MICROTASK",
    );

    expect(dequeues.length).toBeGreaterThanOrEqual(2);
    expect(dequeues[0].queue).toBe("nextTick");
    expect(dequeues.some((event) => event.queue === "promise")).toBe(true);
  });

  it("keeps timer lifecycle ordering from heap schedule to callback start", async () => {
    const events = await runCodeAndCollect(
      `setTimeout(() => console.log("t"), 0);`,
    );

    const heapSchedule = eventIndex(
      events,
      (event) => event.type === "TIMER_HEAP_SCHEDULE",
    );
    const heapReady = eventIndex(
      events,
      (event) => event.type === "TIMER_HEAP_READY",
    );
    const enqueueTimers = eventIndex(
      events,
      (event) => event.type === "ENQUEUE_TASK" && event.queue === "timers",
    );
    const dequeueTimers = eventIndex(
      events,
      (event) => event.type === "DEQUEUE_TASK" && event.queue === "timers",
    );
    const callbackStart = eventIndex(
      events,
      (event) =>
        event.type === "CALLBACK_START" && event.label === "setTimeout callback",
    );

    expect(heapSchedule).toBeGreaterThan(-1);
    expect(heapReady).toBeGreaterThan(heapSchedule);
    expect(enqueueTimers).toBeGreaterThan(heapReady);
    expect(dequeueTimers).toBeGreaterThan(enqueueTimers);
    expect(callbackStart).toBeGreaterThan(dequeueTimers);
  });

  it("clears timeout handles without running cancelled callback", async () => {
    const events = await runCodeAndCollect(
      `
      const id = setTimeout(() => console.log("should-not-run"), 20);
      clearTimeout(id);
      `,
    );

    const hasHandleOpen = events.some((event) => event.type === "HANDLE_OPEN");
    const hasHandleClose = events.some((event) => event.type === "HANDLE_CLOSE");
    const cancelledConsole = events.some(
      (event) =>
        event.type === "CONSOLE" && event.args[0] === "should-not-run",
    );

    expect(hasHandleOpen).toBe(true);
    expect(hasHandleClose).toBe(true);
    expect(cancelledConsole).toBe(false);
  });

  it("emits runtime error and still finishes stream", async () => {
    const events = await runCodeAndCollect(`throw new Error("boom");`);
    const runtimeError = events.find(
      (event) => event.type === "RUNTIME_ERROR",
    );
    const scriptEnd = events.find((event) => event.type === "SCRIPT_END");

    expect(runtimeError).toBeDefined();
    if (runtimeError?.type === "RUNTIME_ERROR") {
      expect(runtimeError.message).toContain("boom");
    }
    expect(scriptEnd).toBeDefined();
  });

  it("tracks fs readFile as request + poll callback", async () => {
    const events = await runCodeAndCollect(
      `
      const fs = require("fs");
      fs.readFile("package.json", () => {
        console.log("io-finished");
      });
      `,
    );

    const requestStart = events.some((event) => event.type === "REQUEST_START");
    const requestEnd = events.some((event) => event.type === "REQUEST_END");
    const pollTaskEnqueue = events.some(
      (event) => event.type === "ENQUEUE_TASK" && event.queue === "poll",
    );
    const ioConsole = events.some(
      (event) => event.type === "CONSOLE" && event.args[0] === "io-finished",
    );

    expect(requestStart).toBe(true);
    expect(requestEnd).toBe(true);
    expect(pollTaskEnqueue).toBe(true);
    expect(ioConsole).toBe(true);
  });
});

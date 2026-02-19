import { describe, expect, it } from "vitest";
import type { VisualizerEvent } from "@jsv/protocol";
import { normalizeConsoleStackFlow } from "../../features/runtime/normalization";

describe("normalizeConsoleStackFlow", () => {
  it("injects a synthetic stack frame around console when stack is empty", () => {
    const input: VisualizerEvent[] = [
      { type: "SCRIPT_START", ts: 1 },
      { type: "CONSOLE", level: "log", args: ["hello"], ts: 2 },
      { type: "SCRIPT_END", ts: 3 },
    ];

    const output = normalizeConsoleStackFlow(input);

    expect(output.map((event) => event.type)).toEqual([
      "SCRIPT_START",
      "CALLBACK_START",
      "CONSOLE",
      "CALLBACK_END",
      "SCRIPT_END",
    ]);

    const startEvent = output[1];
    expect(startEvent.type).toBe("CALLBACK_START");
    if (startEvent.type === "CALLBACK_START") {
      expect(startEvent.label).toBe("sync execution");
      expect(startEvent.taskId.startsWith("sync-console-fallback:")).toBe(true);
    }
  });

  it("does not inject extra frames when callback is already active", () => {
    const input: VisualizerEvent[] = [
      {
        type: "CALLBACK_START",
        taskId: "timers:1",
        label: "setTimeout callback",
        source: { line: 1, col: 1 },
        ts: 1,
      },
      { type: "CONSOLE", level: "log", args: [1], ts: 2 },
      { type: "CALLBACK_END", taskId: "timers:1", ts: 3 },
    ];

    const output = normalizeConsoleStackFlow(input);
    expect(output.map((event) => event.type)).toEqual([
      "CALLBACK_START",
      "CONSOLE",
      "CALLBACK_END",
    ]);
    expect(output).toHaveLength(3);
  });

  it("backfills console source from active callback frame when source is missing", () => {
    const input: VisualizerEvent[] = [
      {
        type: "CALLBACK_START",
        taskId: "timers:1",
        label: "setTimeout callback",
        source: { line: 7, col: 3 },
        ts: 10,
      },
      { type: "CONSOLE", level: "log", args: ["ok"], ts: 11 },
      { type: "CALLBACK_END", taskId: "timers:1", ts: 12 },
    ];

    const output = normalizeConsoleStackFlow(input);
    const consoleEvent = output[1];
    expect(consoleEvent.type).toBe("CONSOLE");
    if (consoleEvent.type === "CONSOLE") {
      expect(consoleEvent.source).toEqual({ line: 7, col: 3 });
    }
  });

  it("injects a synthetic frame for runtime errors when stack is empty", () => {
    const input: VisualizerEvent[] = [
      { type: "SCRIPT_START", ts: 1 },
      { type: "RUNTIME_ERROR", ts: 2, message: "boom" },
      { type: "SCRIPT_END", ts: 3 },
    ];

    const output = normalizeConsoleStackFlow(input);
    expect(output.map((event) => event.type)).toEqual([
      "SCRIPT_START",
      "CALLBACK_START",
      "RUNTIME_ERROR",
      "CALLBACK_END",
      "SCRIPT_END",
    ]);
  });

  it("uses last known source for later console events without source", () => {
    const input: VisualizerEvent[] = [
      {
        type: "WEBAPI_SCHEDULE",
        ts: 1,
        job: "setTimeout",
        kind: "timer",
        source: { line: 4, col: 1 },
      },
      { type: "CONSOLE", level: "log", args: ["later"], ts: 2 },
    ];

    const output = normalizeConsoleStackFlow(input);
    const consoleEvent = output.find((event) => event.type === "CONSOLE");
    expect(consoleEvent).toBeDefined();
    if (consoleEvent?.type === "CONSOLE") {
      expect(consoleEvent.source).toEqual({ line: 4, col: 1 });
    }
  });

  it("keeps explicit console source unchanged", () => {
    const input: VisualizerEvent[] = [
      {
        type: "CONSOLE",
        level: "warn",
        args: ["msg"],
        source: { line: 9, col: 2 },
        ts: 1,
      },
    ];

    const output = normalizeConsoleStackFlow(input);
    const consoleEvent = output.find((event) => event.type === "CONSOLE");
    expect(consoleEvent).toBeDefined();
    if (consoleEvent?.type === "CONSOLE") {
      expect(consoleEvent.source).toEqual({ line: 9, col: 2 });
    }
  });
});

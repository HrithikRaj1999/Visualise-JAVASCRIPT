import { describe, expect, it } from "vitest";
import { examples, type VisualizerEvent } from "@jsv/protocol";
import {
  createReplayState,
  jumpTo,
  moveToNextPhase,
  phaseJumpIndex,
  stepForward,
} from "../replay";

describe("replay engine extended behavior", () => {
  it("stepForward is a no-op at end of event stream", () => {
    const replay = createReplayState([]);
    const next = stepForward(replay);
    expect(next).toBe(replay);
  });

  it("jumpTo clamps pointer to lower bound", () => {
    const replay = createReplayState(examples.timersVsMicrotasks.events);
    const jumped = jumpTo(replay, -50);
    expect(jumped.pointer).toBe(0);
  });

  it("jumpTo clamps pointer to upper bound", () => {
    const replay = createReplayState(examples.timersVsMicrotasks.events);
    const jumped = jumpTo(replay, 99999);
    expect(jumped.pointer).toBe(replay.events.length);
  });

  it("phaseJumpIndex returns first matching phase index + 1", () => {
    const index = phaseJumpIndex(examples.ioVsImmediate.events, "check");
    const phaseEnterIndex = examples.ioVsImmediate.events.findIndex(
      (event) => event.type === "PHASE_ENTER" && event.phase === "check",
    );
    expect(index).toBe(phaseEnterIndex + 1);
  });

  it("phaseJumpIndex returns 0 when phase does not exist", () => {
    const events = examples.pendingCallbacks.events.filter(
      (event) => !(event.type === "PHASE_ENTER" && event.phase === "pending"),
    );
    expect(phaseJumpIndex(events, "pending")).toBe(0);
  });

  it("moveToNextPhase advances to first phase when currently idle", () => {
    const replay = createReplayState(examples.timersVsMicrotasks.events);
    const moved = moveToNextPhase(replay);

    expect(moved.pointer).toBeGreaterThan(0);
    expect(
      moved.events
        .slice(0, moved.pointer)
        .some((event) => event.type === "PHASE_ENTER"),
    ).toBe(true);
  });

  it("moveToNextPhase advances to a different phase when already inside one", () => {
    const replay = createReplayState(examples.ioVsImmediate.events);
    const pollIndex = phaseJumpIndex(replay.events, "poll");
    const inPoll = jumpTo(replay, pollIndex);
    expect(inPoll.state.phase).toBe("poll");

    const moved = moveToNextPhase(inPoll);
    const seenPhases = moved.events
      .slice(0, moved.pointer)
      .filter(
        (
          event,
        ): event is Extract<VisualizerEvent, { type: "PHASE_ENTER" }> =>
          event.type === "PHASE_ENTER",
      )
      .map((event) => event.phase);
    expect(seenPhases).toContain("check");
  });

  it("stepForward keeps timeline length aligned with pointer", () => {
    const replay = createReplayState(examples.nextTickPriority.events);
    const next = stepForward(replay);
    expect(next.pointer).toBe(1);
    expect(next.state.timeline).toHaveLength(1);
  });
});

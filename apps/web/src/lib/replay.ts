import { applyEvent, createInitialState, examples, type VisualizerEvent, type VisualizerState } from '@jsv/protocol';
import { explainEvent, type ToastMessage, type ExplainContext, defaultContext } from '@jsv/explain';

export type ReplayState = {
  events: VisualizerEvent[];
  pointer: number;
  state: VisualizerState;
  toasts: ToastMessage[];
  context: ExplainContext;
};

export function createReplayState(events: VisualizerEvent[], context: ExplainContext = defaultContext): ReplayState {
  return { events, pointer: 0, state: createInitialState(), toasts: [], context };
}

export function stepForward(input: ReplayState): ReplayState {
  if (input.pointer >= input.events.length) {
    return input;
  }

  const event = input.events[input.pointer];
  const state = applyEvent(input.state, event);
  const toast = explainEvent(event, input.context);
  return {
    ...input,
    pointer: input.pointer + 1,
    state,
    toasts: toast ? [...input.toasts, toast] : input.toasts,
  };
}

export function moveToNextPhase(input: ReplayState): ReplayState {
  if (input.pointer >= input.events.length) {
    return input;
  }

  const currentPhase = input.state.phase;
  let replay = input;
  let enteredAnyPhase = false;

  while (replay.pointer < replay.events.length) {
    const event = replay.events[replay.pointer];
    replay = stepForward(replay);

    if (event.type !== 'PHASE_ENTER') {
      continue;
    }

    if (currentPhase === null) {
      return replay;
    }

    if (event.phase !== currentPhase) {
      return replay;
    }

    enteredAnyPhase = true;
  }

  return enteredAnyPhase ? replay : stepForward(input);
}

export function jumpTo(input: ReplayState, nextPointer: number): ReplayState {
  let replay = createReplayState(input.events, input.context);
  while (replay.pointer < Math.max(0, Math.min(nextPointer, replay.events.length))) {
    replay = stepForward(replay);
  }
  return replay;
}

export function phaseJumpIndex(
  events: VisualizerEvent[],
  phase: "timers" | "pending" | "poll" | "check" | "close",
): number {
  const index = events.findIndex((event) => event.type === 'PHASE_ENTER' && event.phase === phase);
  return index === -1 ? 0 : index + 1;
}

export const defaultExampleId = 'timersVsMicrotasks';
export const exampleList = Object.entries(examples).map(([id, value]) => ({ id, ...value }));

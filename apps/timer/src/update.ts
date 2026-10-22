import { advanceTimer, parseConfig, pauseTimer, startTimer, withSoundResult } from "./domain";
import { audio, getModel, navigate, now, setModel } from "./effects";
import type { Outcome, Program } from "./effects";
import { initialModel, timerModel } from "./model";
import type { Model } from "./model";

export type Action =
  | {
      kind: "home";
      action:
        | { kind: "edit"; field: "minutes" | "seconds" | "rounds"; value: string }
        | { kind: "submit" };
    }
  | { kind: "timer"; action: { kind: "start" | "pause" | "reset" } }
  | { kind: "tick"; clockId: number; timestamp: number }
  | { kind: "wakeLockResult"; clockId: number; result: Outcome }
  | { kind: "homeRequested" }
  | { kind: "locationChanged"; pathname: string }
  | { kind: "testSound" }
  | { kind: "visible"; timestamp: number };

export function canHandle(model: Model, action: Action): boolean {
  if (action.kind === "home") {
    return model.route.kind === "home";
  }
  if (action.kind !== "timer") {
    return true;
  }
  if (model.route.kind !== "timer") {
    return false;
  }
  const status = model.route.model.status;
  if (action.action.kind === "start") {
    return status === "ready" || status === "paused";
  }
  if (action.action.kind === "pause") {
    return status === "starting" || status === "running";
  }
  return true;
}

export function workflowScope(action: Action): string | null {
  if (
    action.kind === "timer" ||
    action.kind === "homeRequested" ||
    action.kind === "locationChanged" ||
    (action.kind === "home" && action.action.kind === "submit")
  ) {
    return "workout";
  }
  return null;
}

function* updateHome(action: Extract<Action, { kind: "home" }>["action"]): Program {
  const model = yield* getModel();
  if (model.route.kind !== "home") {
    return;
  }
  if (action.kind === "edit") {
    yield* setModel({
      ...model,
      route: {
        kind: "home",
        model: { ...model.route.model, [action.field]: action.value, error: null },
      },
    });
    return;
  }
  const result = parseConfig(model.route.model);
  if (!result.ok) {
    yield* setModel({
      ...model,
      route: { kind: "home", model: { ...model.route.model, error: result.error } },
    });
    return;
  }
  const config = result.value;
  yield* setModel({ ...model, config, route: { kind: "timer", model: timerModel(config) } });
  yield* navigate("/timer");
}

function* beep(clockId: number): Program {
  const [result, model] = yield* audio("beep");
  if (model.clockId === clockId && model.route.kind === "timer") {
    yield* setModel(withSoundResult(model, result));
  }
}

function* tick(timestamp: number, clockId: number): Program {
  const model = yield* getModel();
  if (
    model.clockId !== clockId ||
    model.route.kind !== "timer" ||
    model.route.model.status !== "running"
  ) {
    return;
  }
  const previous = model.route.model;
  const next = advanceTimer(previous, model.config, timestamp);
  yield* setModel({ ...model, route: { kind: "timer", model: next } });
  if (next.completed > previous.completed) {
    // Catch up delayed ticks with one beep, not a burst of missed intervals.
    yield* beep(clockId);
  }
}

function* start(): Program {
  const initial = yield* getModel();
  if (
    initial.route.kind !== "timer" ||
    initial.route.model.status === "complete" ||
    initial.route.model.status === "running"
  ) {
    return;
  }
  yield* setModel({
    ...initial,
    clockId: initial.clockId + 1,
    route: { kind: "timer", model: { ...initial.route.model, status: "starting" } },
  });
  const [sound, _afterSound] = yield* audio("unlock");
  const [timestamp, model] = yield* now();
  if (model.route.kind !== "timer" || model.route.model.status !== "starting") {
    return;
  }
  let soundError: string | null = null;
  if (!sound.ok) {
    soundError = sound.error;
  }
  yield* setModel({
    ...model,
    route: { kind: "timer", model: startTimer(model.route.model, timestamp, soundError) },
  });
}

function* updateTimer(action: Extract<Action, { kind: "timer" }>["action"]): Program {
  if (action.kind === "start") {
    yield* start();
    return;
  }
  const initial = yield* getModel();
  if (initial.route.kind !== "timer") {
    return;
  }
  if (action.kind === "reset") {
    yield* setModel({
      ...initial,
      clockId: initial.clockId + 1,
      route: { kind: "timer", model: timerModel(initial.config) },
    });
    return;
  }
  const [timestamp, model] = yield* now();
  if (model.route.kind !== "timer") {
    return;
  }
  const next = pauseTimer(model.route.model, model.config, timestamp);
  yield* setModel({ ...model, route: { kind: "timer", model: next } });
  if (next.completed > model.route.model.completed) {
    yield* beep(model.clockId);
  }
}

export function* update(action: Action): Program {
  switch (action.kind) {
    case "home": {
      yield* updateHome(action.action);
      return;
    }
    case "timer": {
      yield* updateTimer(action.action);
      return;
    }
    case "tick": {
      yield* tick(action.timestamp, action.clockId);
      return;
    }
    case "homeRequested":
    case "locationChanged": {
      const model = yield* getModel();
      let pathname = "/";
      if (action.kind === "locationChanged") {
        pathname = action.pathname;
      }
      yield* setModel({
        ...model,
        clockId: model.clockId + 1,
        route: initialModel(pathname, model.config).route,
      });
      if (action.kind === "homeRequested") {
        yield* navigate("/");
      }
      return;
    }
    case "testSound": {
      const [result, model] = yield* audio("unlock");
      if (!result.ok) {
        yield* setModel(withSoundResult(model, result));
        return;
      }
      const [beepResult, afterBeep] = yield* audio("beep");
      yield* setModel(withSoundResult(afterBeep, beepResult));
      return;
    }
    case "visible": {
      const model = yield* getModel();
      yield* tick(action.timestamp, model.clockId);
      return;
    }
    case "wakeLockResult": {
      const model = yield* getModel();
      if (
        model.clockId === action.clockId &&
        model.route.kind === "timer" &&
        model.route.model.status === "running"
      ) {
        let wakeLockError: string | null = null;
        if (!action.result.ok) {
          wakeLockError = action.result.error;
        }
        yield* setModel({
          ...model,
          route: { kind: "timer", model: { ...model.route.model, wakeLockError } },
        });
      }
      return;
    }
  }
}

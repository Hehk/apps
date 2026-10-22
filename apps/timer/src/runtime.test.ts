import { describe, expect, it, vi } from "vitest";
import type { Outcome } from "./effects";
import { initialModel } from "./model";
import type { Model, TimerModel } from "./model";
import { createRuntime } from "./runtime";
import { createSession } from "./session";
import { createTestEnvironment } from "./testing/environment";

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return {
    promise,
    resolve(value: T) {
      if (resolve == null) {
        throw new Error("Missing resolver");
      }
      resolve(value);
    },
  };
}

function fixture(model: Model = initialModel("/timer", { intervalMs: 2000, rounds: 3 })) {
  const test = createTestEnvironment();
  const session = createSession(model, test.environment);
  const { runtime } = session;
  const control = (kind: "start" | "pause" | "reset") =>
    runtime.dispatch({ kind: "timer", action: { kind } });
  const tick = () =>
    runtime.dispatch({
      kind: "tick",
      clockId: runtime.getModel().clockId,
      timestamp: test.clock.now(),
    });
  const timer = (): TimerModel => {
    const route = runtime.getModel().route;
    if (route.kind !== "timer") {
      throw new Error("Expected timer route");
    }
    return route.model;
  };
  return { ...test, session, runtime, handlers: test.environment.handlers, control, tick, timer };
}

it("advances on timestamped actions, beeping at every boundary including the final one", () => {
  const { runtime, control, tick, clock, timer, sounds } = fixture();
  control("start");
  for (let interval = 1; interval <= 3; interval++) {
    clock.elapse(2000);
    tick();
    expect(timer().completed).toBe(interval);
  }
  expect(timer()).toMatchObject({ status: "complete", remainingMs: 0, deadline: null });
  expect(sounds.filter((operation) => operation === "beep")).toHaveLength(3);
  expect(runtime.getActiveCount()).toBe(0);
});

it("pauses at the current time and resumes the remaining duration", () => {
  const { control, clock, timer, tick } = fixture();
  control("start");
  clock.elapse(650);
  control("pause");
  expect(timer()).toMatchObject({ status: "paused", remainingMs: 1350 });
  clock.elapse(5000);
  tick();
  expect(timer().remainingMs).toBe(1350);
  control("start");
  clock.elapse(1350);
  tick();
  expect(timer()).toMatchObject({ completed: 1, remainingMs: 2000 });
});

it("ignores ticks from a previous workout after reset, navigation, or resume", () => {
  const { control, clock, runtime, timer } = fixture();
  control("start");
  const oldClockId = runtime.getModel().clockId;
  control("reset");
  runtime.dispatch({ kind: "homeRequested" });
  runtime.dispatch({ kind: "locationChanged", pathname: "/timer" });
  control("start");
  clock.elapse(6000);
  runtime.dispatch({ kind: "tick", clockId: oldClockId, timestamp: clock.now() });
  expect(timer()).toMatchObject({ status: "running", completed: 0 });
  expect(runtime.getModel().clockId).not.toBe(oldClockId);
});

it("does not restart the deadline on duplicate Start", () => {
  const { control, clock, timer } = fixture();
  control("start");
  const deadline = timer().deadline;
  clock.elapse(600);
  control("start");
  expect(timer().deadline).toBe(deadline);
});

it("cancels an in-flight Start and ignores its late effect result", async () => {
  const { handlers, control, runtime, timer } = fixture();
  const sound = deferred<Outcome>();
  handlers.audio = () => sound.promise;
  control("start");
  expect(timer().status).toBe("starting");
  control("pause");
  const count = runtime.getEventCount();
  sound.resolve({ ok: true });
  await Promise.resolve();
  expect(timer().status).toBe("paused");
  expect(runtime.getEventCount()).toBe(count);
  expect(runtime.getActiveCount()).toBe(0);
  expect(runtime.getEvents().some((event) => event.kind === "cancelled")).toBe(true);
});

it("does not cancel Start when a stale Home action arrives", async () => {
  const { handlers, control, runtime, timer } = fixture();
  const sound = deferred<Outcome>();
  handlers.audio = () => sound.promise;
  control("start");
  runtime.dispatch({ kind: "home", action: { kind: "submit" } });
  expect(runtime.getActiveCount()).toBe(1);
  expect(runtime.getEvents().some((event) => event.kind === "cancelled")).toBe(false);
  sound.resolve({ ok: true });
  await Promise.resolve();
  expect(timer().status).toBe("running");
  expect(runtime.getActiveCount()).toBe(0);
  const first = runtime.getEvents()[0];
  if (first?.kind !== "initial") {
    throw new Error("Missing initial event");
  }
  const replay = createRuntime(first.model, handlers, runtime.getEvents());
  expect(replay.replay()).toEqual(runtime.getModel());
});

it("ignores duplicate Start while its sound effect is pending", async () => {
  const { handlers, control, runtime, timer } = fixture();
  const sound = deferred<Outcome>();
  const unlock = vi.fn(() => sound.promise);
  handlers.audio = unlock;
  control("start");
  const clockId = runtime.getModel().clockId;
  control("start");
  expect(unlock).toHaveBeenCalledTimes(1);
  expect(runtime.getModel().clockId).toBe(clockId);
  expect(runtime.getActiveCount()).toBe(1);
  sound.resolve({ ok: true });
  await Promise.resolve();
  expect(timer().status).toBe("running");
});

it.each(["/", "/timer"])("reports and clears a Test sound beep failure on %s", (pathname) => {
  const { handlers, runtime } = fixture(initialModel(pathname));
  handlers.audio = ({ operation }) => {
    if (operation === "unlock") {
      return { ok: true };
    }
    return { ok: false, error: "Speaker unavailable" };
  };
  runtime.dispatch({ kind: "testSound" });
  expect(runtime.getModel().route.model).toMatchObject({ soundError: "Speaker unavailable" });
  handlers.audio = () => ({ ok: true });
  runtime.dispatch({ kind: "testSound" });
  expect(runtime.getModel().route.model).toMatchObject({ soundError: null });
});

it("preserves form validation errors across sound failures and retries", () => {
  const { handlers, runtime } = fixture(initialModel("/"));
  runtime.dispatch({ kind: "home", action: { kind: "edit", field: "minutes", value: "0" } });
  runtime.dispatch({ kind: "home", action: { kind: "submit" } });
  const invalid = runtime.getModel().route;
  if (invalid.kind !== "home") {
    throw new Error("Expected home route");
  }
  const error = invalid.model.error;
  expect(error).not.toBeNull();
  handlers.audio = () => ({ ok: false, error: "No audio" });
  runtime.dispatch({ kind: "testSound" });
  expect(runtime.getModel().route.model).toMatchObject({ error, soundError: "No audio" });
  handlers.audio = () => ({ ok: true });
  runtime.dispatch({ kind: "testSound" });
  expect(runtime.getModel().route.model).toMatchObject({ error, soundError: null });
});

it("clears recovered sound and wake-lock errors independently", () => {
  const { handlers, runtime, control, timer } = fixture();
  control("start");
  const clockId = runtime.getModel().clockId;
  runtime.dispatch({
    kind: "wakeLockResult",
    clockId,
    result: { ok: false, error: "Screen unavailable" },
  });
  handlers.audio = () => ({ ok: false, error: "Audio unavailable" });
  runtime.dispatch({ kind: "testSound" });
  expect(timer()).toMatchObject({
    soundError: "Audio unavailable",
    wakeLockError: "Screen unavailable",
  });
  handlers.audio = () => ({ ok: true });
  runtime.dispatch({ kind: "testSound" });
  expect(timer()).toMatchObject({ soundError: null, wakeLockError: "Screen unavailable" });
  handlers.audio = () => ({ ok: false, error: "Audio unavailable" });
  runtime.dispatch({ kind: "testSound" });
  runtime.dispatch({ kind: "wakeLockResult", clockId, result: { ok: true } });
  expect(timer()).toMatchObject({ soundError: "Audio unavailable", wakeLockError: null });
});

it("gives concurrent effect continuations the latest model", async () => {
  const { runtime, handlers, control, timer } = fixture();
  control("start");
  const sound = deferred<Outcome>();
  handlers.audio = () => sound.promise;
  runtime.dispatch({ kind: "testSound" });
  control("reset");
  sound.resolve({ ok: false, error: "No sound" });
  await Promise.resolve();
  expect(timer()).toMatchObject({ status: "ready", completed: 0, soundError: "No sound" });
});

it("delegates form edits and validates before navigating", () => {
  const { runtime, navigations } = fixture();
  runtime.dispatch({ kind: "homeRequested" });
  runtime.dispatch({ kind: "home", action: { kind: "edit", field: "minutes", value: "0" } });
  runtime.dispatch({ kind: "home", action: { kind: "edit", field: "seconds", value: "0" } });
  runtime.dispatch({ kind: "home", action: { kind: "submit" } });
  expect(runtime.getModel().route).toMatchObject({
    kind: "home",
    model: { error: expect.any(String) as unknown },
  });
  runtime.dispatch({ kind: "home", action: { kind: "edit", field: "seconds", value: "3" } });
  runtime.dispatch({ kind: "home", action: { kind: "submit" } });
  expect(runtime.getModel().config.intervalMs).toBe(3000);
  expect(runtime.getModel().route.kind).toBe("timer");
  expect(navigations).toEqual(["/", "/timer"]);
});

describe("replay", () => {
  it("replays ticks and interleaved effects without mounting subscriptions or running handlers", async () => {
    const { runtime, handlers, control, clock, tick } = fixture();
    control("start");
    clock.elapse(2000);
    tick();
    const sound = deferred<Outcome>();
    handlers.audio = () => sound.promise;
    runtime.dispatch({ kind: "testSound" });
    control("pause");
    sound.resolve({ ok: false, error: "Test error" });
    await Promise.resolve();
    handlers.audio = () => ({ ok: true });
    control("start");
    clock.elapse(4000);
    tick();
    const events = structuredClone([...runtime.getEvents()]);
    const first = events[0];
    if (first?.kind !== "initial") {
      throw new Error("Missing initial event");
    }
    const unexpected = vi.fn(() => {
      throw new Error("External effect executed during replay");
    });
    const replay = createRuntime(
      first.model,
      { now: unexpected, audio: unexpected, navigate: unexpected },
      events,
    );
    expect(replay.replay()).toEqual(runtime.getModel());
    expect(replay.getEvents()).toEqual(events);
    expect(unexpected).not.toHaveBeenCalled();
  });

  it("detects divergence from a changed clock result", () => {
    const { runtime, handlers, control } = fixture();
    control("start");
    const events = structuredClone([...runtime.getEvents()]);
    const clock = events.find(
      (event) => event.kind === "effect-result" && typeof event.value === "number",
    );
    if (clock?.kind !== "effect-result" || typeof clock.value !== "number") {
      throw new Error("Missing clock result");
    }
    clock.value += 1;
    const first = events[0];
    if (first?.kind !== "initial") {
      throw new Error("Missing initial event");
    }
    const replay = createRuntime(first.model, handlers, events);
    expect(() => replay.replay()).toThrow("Replay diverged");
  });

  it("can replay a prefix ending in an unresolved effect", () => {
    const { runtime, control, handlers } = fixture();
    handlers.audio = () => deferred<Outcome>().promise;
    control("start");
    const first = runtime.getEvents()[0];
    if (first?.kind !== "initial") {
      throw new Error("Missing initial event");
    }
    const replay = createRuntime(first.model, handlers, runtime.getEvents());
    expect(replay.replay()).toEqual(runtime.getModel());
    expect(replay.getActiveCount()).toBe(1);
    replay.dispose();
  });
});

// @vitest-environment jsdom
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { act, fireEvent, render } from "@testing-library/react/pure";
import { describe, expect, it } from "vitest";
import { App } from "./app";
import type { Outcome } from "./effects";
import { initialModel, timerModel } from "./model";
import type { Model } from "./model";
import { createSession } from "./session";
import { createTestEnvironment } from "./testing/environment";
import type { Action } from "./update";

const config = { intervalMs: 2000, rounds: 3 };
const start: Action = { kind: "timer", action: { kind: "start" } };
const pause: Action = { kind: "timer", action: { kind: "pause" } };

function mount(
  test = createTestEnvironment(),
  model = initialModel("/timer", config),
  strict = false,
) {
  const session = createSession(model, test.environment);
  let ui = <App session={session} />;
  if (strict) {
    ui = <StrictMode>{ui}</StrictMode>;
  }
  const view = render(ui);
  return {
    ...test,
    ...view,
    session,
    dispatch(action: Action) {
      act(() => session.runtime.dispatch(action));
    },
    async advanceBy(ms: number) {
      await act(async () => {
        await test.clock.advanceBy(ms);
      });
    },
    dispose: () => {
      view.unmount();
      view.container.remove();
      session.dispose();
    },
  };
}

describe("session and mounted subscriptions", () => {
  it("keeps setup and timer controls available without explainer or developer panels", ({
    onTestFinished,
  }) => {
    const app = mount(createTestEnvironment("/"), initialModel("/"));
    onTestFinished(app.dispose);
    expect(app.getByLabelText("Minutes")).toBeDefined();
    expect(app.getByLabelText("Seconds")).toBeDefined();
    expect(app.getByLabelText("Intervals")).toBeDefined();
    expect(app.queryByText(/Event stream/)).toBeNull();
    expect(app.queryByText(/Keep this page open/)).toBeNull();
    fireEvent.click(app.getByRole("button", { name: "Continue" }));
    fireEvent.click(app.getByRole("button", { name: "Start" }));
    expect(app.getByRole("button", { name: "Pause" })).toBeDefined();
    fireEvent.click(app.getByRole("button", { name: "Pause" }));
    expect(app.getByRole("button", { name: "Resume" })).toBeDefined();
    fireEvent.click(app.getByRole("button", { name: "Reset" }));
    expect(app.getByRole("button", { name: "Start" })).toBeDefined();
    fireEvent.click(app.getByRole("link", { name: "Edit" }));
    expect(app.getByRole("button", { name: "Continue" })).toBeDefined();
    expect(app.getByRole("button", { name: "Test sound" })).toBeDefined();
  });

  it("creates a session without connecting subscriptions or changing document metadata", () => {
    const test = createTestEnvironment();
    const previousTitle = document.title;
    const model = initialModel("/");
    const session = createSession(model, test.environment);
    expect(session.runtime.getModel()).toBe(model);
    expect(session.runtime.getEventCount()).toBe(1);
    expect(test.getSubscriptionCounts()).toEqual({ events: 0, clocks: 0, wakeLocks: 0 });
    expect(document.title).toBe(previousTitle);
    const html = renderToString(<App session={session} />);
    expect(html).toContain("<title>Interval Timer</title>");
    expect(test.getSubscriptionCounts()).toEqual({ events: 0, clocks: 0, wakeLocks: 0 });
    session.dispose();
  });

  it("mounts the clock only while running and renders a derived title", async ({
    onTestFinished,
  }) => {
    const app = mount();
    onTestFinished(app.dispose);
    expect(app.getSubscriptionCounts()).toEqual({ events: 1, clocks: 0, wakeLocks: 0 });
    expect(document.title).toBe("00:02 · Timer");
    app.dispatch(start);
    expect(app.getSubscriptionCounts()).toEqual({ events: 1, clocks: 1, wakeLocks: 1 });
    await app.advanceBy(650);
    app.dispatch(pause);
    expect(app.session.runtime.getModel().route).toMatchObject({ model: { remainingMs: 1350 } });
    expect(app.getSubscriptionCounts()).toEqual({ events: 1, clocks: 0, wakeLocks: 0 });
    await app.advanceBy(5000);
    app.dispatch(start);
    await app.advanceBy(1350);
    expect(app.session.runtime.getModel().route).toMatchObject({
      model: { completed: 1, remainingMs: 2000 },
    });
    await app.advanceBy(4000);
    expect(app.session.runtime.getModel().route).toMatchObject({
      model: { status: "complete", completed: 3 },
    });
    expect(app.sounds.filter((sound) => sound === "beep")).toHaveLength(3);
    expect(app.getSubscriptionCounts()).toEqual({ events: 1, clocks: 0, wakeLocks: 0 });
    expect(document.title).toBe("00:00 · Timer");
  });

  it("uses an explicitly supplied paused model without reconstructing it", async ({
    onTestFinished,
  }) => {
    const model: Model = {
      ...initialModel("/timer", config),
      route: {
        kind: "timer",
        model: { ...timerModel(config), status: "paused", completed: 1, remainingMs: 700 },
      },
    };
    const app = mount(createTestEnvironment("/"), model);
    onTestFinished(app.dispose);
    expect(app.session.runtime.getModel()).toBe(model);
    expect(document.title).toBe("00:01 · Timer");
    app.dispatch(start);
    await app.advanceBy(700);
    expect(app.session.runtime.getModel().route).toMatchObject({
      model: { completed: 2, remainingMs: 2000 },
    });
  });

  it("cleans up unmounted subscriptions and catches up when remounted", async ({
    onTestFinished,
  }) => {
    const app = mount();
    onTestFinished(app.dispose);
    app.dispatch(start);
    app.unmount();
    expect(app.getSubscriptionCounts()).toEqual({ events: 0, clocks: 0, wakeLocks: 0 });
    const count = app.session.runtime.getEventCount();
    app.goTo("/");
    await app.advanceBy(8500);
    expect(app.session.runtime.getEventCount()).toBe(count);
    const remounted = render(<App session={app.session} />);
    onTestFinished(() => {
      remounted.unmount();
      remounted.container.remove();
    });
    expect(app.session.runtime.getModel().route).toMatchObject({ model: { status: "complete" } });
    expect(app.sounds.filter((sound) => sound === "beep")).toHaveLength(1);
    expect(app.getSubscriptionCounts()).toEqual({ events: 1, clocks: 0, wakeLocks: 0 });
  });

  it("tolerates Strict Mode's setup-cleanup-setup without duplicate clocks or beeps", async ({
    onTestFinished,
  }) => {
    const app = mount(createTestEnvironment(), initialModel("/timer", config), true);
    onTestFinished(app.dispose);
    app.dispatch(start);
    expect(app.getSubscriptionCounts()).toEqual({ events: 1, clocks: 1, wakeLocks: 1 });
    await app.advanceBy(2000);
    expect(app.sounds.filter((sound) => sound === "beep")).toHaveLength(1);
    expect(app.getSubscriptionCounts()).toEqual({ events: 1, clocks: 1, wakeLocks: 1 });
    app.dispatch({ kind: "timer", action: { kind: "reset" } });
    expect(app.getSubscriptionCounts()).toEqual({ events: 1, clocks: 0, wakeLocks: 0 });
  });

  it("switches sessions through a prop without sharing clocks or listeners", async ({
    onTestFinished,
  }) => {
    const first = mount();
    onTestFinished(first.dispose);
    first.dispatch(start);
    const second = createTestEnvironment("/");
    const session = createSession(initialModel("/"), second.environment);
    onTestFinished(() => session.dispose());
    first.rerender(<App session={session} />);
    expect(first.getSubscriptionCounts()).toEqual({ events: 0, clocks: 0, wakeLocks: 0 });
    expect(second.getSubscriptionCounts()).toEqual({ events: 1, clocks: 0, wakeLocks: 0 });
    expect(document.title).toBe("Interval Timer");
    const count = first.session.runtime.getEventCount();
    await first.advanceBy(6000);
    expect(first.session.runtime.getEventCount()).toBe(count);
    expect(first.clock.now()).toBe(16_000);
    expect(second.clock.now()).toBe(10_000);
  });

  it("handles visibility as a timestamped action and browser navigation without pushing history", ({
    onTestFinished,
  }) => {
    const app = mount();
    onTestFinished(app.dispose);
    app.dispatch(start);
    app.clock.elapse(4500);
    act(() => app.becomeVisible());
    expect(app.session.runtime.getModel().route).toMatchObject({
      model: { completed: 2, remainingMs: 1500 },
    });
    expect(app.sounds.filter((sound) => sound === "beep")).toHaveLength(1);
    act(() => app.goTo("/"));
    expect(app.session.runtime.getModel().route.kind).toBe("home");
    expect(app.navigations).toHaveLength(0);
    expect(app.getSubscriptionCounts()).toEqual({ events: 1, clocks: 0, wakeLocks: 0 });
  });

  it("shows a failed sound test on Home and removes it after a successful retry", ({
    onTestFinished,
  }) => {
    const app = mount(createTestEnvironment("/"), initialModel("/"));
    onTestFinished(app.dispose);
    app.environment.handlers.audio = ({ operation }) => {
      if (operation === "unlock") {
        return { ok: true };
      }
      return { ok: false, error: "Speaker unavailable" };
    };
    app.dispatch({ kind: "testSound" });
    expect(app.getByRole("alert").textContent).toBe("Speaker unavailable");
    app.environment.handlers.audio = () => ({ ok: true });
    app.dispatch({ kind: "testSound" });
    expect(app.queryByRole("alert")).toBeNull();
  });

  it("renders sound and wake-lock warnings independently through recovery", ({
    onTestFinished,
  }) => {
    const app = mount();
    onTestFinished(app.dispose);
    app.dispatch(start);
    const clockId = app.session.runtime.getModel().clockId;
    app.dispatch({
      kind: "wakeLockResult",
      clockId,
      result: { ok: false, error: "Screen unavailable" },
    });
    app.environment.handlers.audio = () => ({ ok: false, error: "Audio unavailable" });
    app.dispatch({ kind: "testSound" });
    expect(app.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
      "Audio unavailable",
      "Screen unavailable",
    ]);
    app.environment.handlers.audio = () => ({ ok: true });
    app.dispatch({ kind: "testSound" });
    expect(app.getByRole("alert").textContent).toBe("Screen unavailable");
    app.dispatch({ kind: "wakeLockResult", clockId, result: { ok: true } });
    expect(app.queryByRole("alert")).toBeNull();
  });

  it("ignores wake-lock results arriving after their component unmounts", ({ onTestFinished }) => {
    const test = createTestEnvironment();
    let report: ((result: Outcome) => void) | undefined;
    test.environment.keepAwake = (callback) => {
      report = callback;
      return () => {};
    };
    const app = mount(test);
    onTestFinished(app.dispose);
    app.dispatch(start);
    const oldReport = report;
    if (oldReport == null) {
      throw new Error("Missing callback");
    }
    app.dispatch(pause);
    const count = app.session.runtime.getEventCount();
    act(() => oldReport({ ok: false, error: "Too late" }));
    expect(app.session.runtime.getEventCount()).toBe(count);
  });
});

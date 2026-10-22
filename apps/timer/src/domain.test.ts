import { describe, expect, it } from "vitest";
import {
  advanceTimer,
  nextClockDelay,
  pageTitle,
  parseConfig,
  pauseTimer,
  startTimer,
} from "./domain";
import { defaultConfig, initialModel, timerModel } from "./model";

const config = { intervalMs: 2000, rounds: 10 };

it("defaults to two minutes × thirty intervals", () => {
  expect(defaultConfig).toEqual({ intervalMs: 120_000, rounds: 30 });
  expect(initialModel("/").route).toMatchObject({
    model: { minutes: "2", seconds: "0", rounds: "30" },
  });
});

describe("configuration", () => {
  it.each([
    { minutes: "0", seconds: "1", intervalMs: 1000 },
    { minutes: "0", seconds: "59", intervalMs: 59_000 },
    { minutes: "1", seconds: "3", intervalMs: 63_000 },
    { minutes: "180", seconds: "0", intervalMs: 10_800_000 },
  ])("accepts $minutes minutes and $seconds seconds", ({ minutes, seconds, intervalMs }) => {
    expect(parseConfig({ minutes, seconds, rounds: "3", error: null, soundError: null })).toEqual({
      ok: true,
      value: { intervalMs, rounds: 3 },
    });
  });
  it.each([
    { minutes: "", seconds: "1" },
    { minutes: "0", seconds: "" },
    { minutes: "0", seconds: "0" },
    { minutes: "NaN", seconds: "0" },
    { minutes: "181", seconds: "0" },
    { minutes: "180", seconds: "1" },
    { minutes: "-1", seconds: "0" },
    { minutes: "0.5", seconds: "0" },
    { minutes: "0", seconds: "60" },
    { minutes: "0", seconds: "-1" },
    { minutes: "0", seconds: "1.5" },
    { minutes: "0", seconds: "NaN" },
  ])("rejects duration $minutes:$seconds", ({ minutes, seconds }) => {
    expect(parseConfig({ minutes, seconds, rounds: "3", error: null, soundError: null }).ok).toBe(
      false,
    );
  });
  it.each(["", "0", "1.5", "1000", "NaN"])("rejects invalid intervals %s", (rounds) => {
    expect(
      parseConfig({ minutes: "1", seconds: "0", rounds, error: null, soundError: null }).ok,
    ).toBe(false);
  });
});

it("advances delayed callbacks without drift", () => {
  const running = startTimer(timerModel(config), 10_000, null);
  expect(advanceTimer(running, config, 18_500)).toMatchObject({
    completed: 4,
    remainingMs: 1500,
    deadline: 20_000,
  });
  expect(advanceTimer(running, config, 100_000)).toMatchObject({
    status: "complete",
    completed: 10,
    remainingMs: 0,
  });
});

it("pauses and resumes partial intervals without changing the input model", () => {
  const running = Object.freeze(startTimer(timerModel(config), 10_000, null));
  const paused = pauseTimer(running, config, 10_650);
  expect(paused).toMatchObject({ status: "paused", remainingMs: 1350, deadline: null });
  expect(startTimer(paused, 20_000, null).deadline).toBe(21_350);
  expect(running.deadline).toBe(12_000);
});

it("does not pause a completed workout", () => {
  const running = startTimer(timerModel(config), 10_000, null);
  expect(pauseTimer(running, config, 30_000).status).toBe("complete");
});

it("derives titles without an environment", () => {
  expect(pageTitle(initialModel("/"))).toBe("Interval Timer");
  expect(pageTitle(initialModel("/timer", config))).toBe("00:02 · Timer");
});

it("aligns clock callbacks with deadline boundaries", () => {
  expect(nextClockDelay(12_000, 10_000)).toBe(1000);
  expect(nextClockDelay(12_000, 10_650)).toBe(350);
  expect(nextClockDelay(12_000, 18_500)).toBe(500);
});

import type { Outcome } from "./effects";
import { formatTime } from "./model";
import type { Config, Model, SetupModel, TimerModel } from "./model";

export function parseConfig(
  setup: SetupModel,
): { ok: true; value: Config } | { ok: false; error: string } {
  const minutes = Number(setup.minutes);
  const seconds = Number(setup.seconds);
  const intervalMs = (minutes * 60 + seconds) * 1000;
  const rounds = Number(setup.rounds);
  if (
    setup.minutes.trim() === "" ||
    setup.seconds.trim() === "" ||
    !Number.isInteger(minutes) ||
    minutes < 0 ||
    !Number.isInteger(seconds) ||
    seconds < 0 ||
    seconds > 59 ||
    intervalMs < 1000 ||
    intervalMs > 180 * 60_000 ||
    !Number.isInteger(rounds) ||
    rounds < 1 ||
    rounds > 999
  ) {
    return {
      ok: false,
      error:
        "Use whole minutes and seconds (0–59), totaling 1 second–180 minutes, and 1–999 intervals.",
    };
  }
  return { ok: true, value: { intervalMs, rounds } };
}

export function advanceTimer(timer: TimerModel, config: Config, timestamp: number): TimerModel {
  if (timer.status !== "running" || timer.deadline === null) {
    return timer;
  }
  let elapsed = 0;
  if (timestamp >= timer.deadline) {
    elapsed = Math.floor((timestamp - timer.deadline) / config.intervalMs) + 1;
  }
  const completed = Math.min(config.rounds, timer.completed + elapsed);
  if (completed === config.rounds) {
    return { ...timer, status: "complete", completed, deadline: null, remainingMs: 0 };
  }
  const deadline = timer.deadline + elapsed * config.intervalMs;
  return { ...timer, completed, deadline, remainingMs: Math.max(0, deadline - timestamp) };
}

export function startTimer(
  timer: TimerModel,
  timestamp: number,
  soundError: string | null,
): TimerModel {
  return { ...timer, status: "running", deadline: timestamp + timer.remainingMs, soundError };
}

export function pauseTimer(timer: TimerModel, config: Config, timestamp: number): TimerModel {
  const next = advanceTimer(timer, config, timestamp);
  if (next.status === "complete") {
    return next;
  }
  return { ...next, status: "paused", deadline: null };
}

export function withSoundResult(model: Model, result: Outcome): Model {
  let soundError: string | null = null;
  if (!result.ok) {
    soundError = result.error;
  }
  if (model.route.kind === "timer") {
    return { ...model, route: { kind: "timer", model: { ...model.route.model, soundError } } };
  }
  return { ...model, route: { kind: "home", model: { ...model.route.model, soundError } } };
}

export function pageTitle(model: Model): string {
  if (model.route.kind === "timer") {
    return `${formatTime(model.route.model.remainingMs)} · Timer`;
  }
  return "Interval Timer";
}

export function nextClockDelay(deadline: number, timestamp: number): number {
  return 1000 - ((((timestamp - deadline) % 1000) + 1000) % 1000);
}

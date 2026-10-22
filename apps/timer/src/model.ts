export type Config = Readonly<{ intervalMs: number; rounds: number }>;

export type SetupModel = Readonly<{
  minutes: string;
  seconds: string;
  rounds: string;
  error: string | null;
  soundError: string | null;
}>;

export type TimerModel = Readonly<{
  status: "ready" | "starting" | "running" | "paused" | "complete";
  completed: number;
  remainingMs: number;
  deadline: number | null;
  soundError: string | null;
  wakeLockError: string | null;
}>;

export type Route =
  | Readonly<{ kind: "home"; model: SetupModel }>
  | Readonly<{ kind: "timer"; model: TimerModel }>;

export type Model = Readonly<{ config: Config; route: Route; clockId: number }>;

export const defaultConfig: Config = { intervalMs: 120_000, rounds: 30 };

export function setupModel(config: Config): SetupModel {
  return {
    minutes: String(Math.floor(config.intervalMs / 60_000)),
    seconds: String(Math.floor(config.intervalMs / 1000) % 60),
    rounds: String(config.rounds),
    error: null,
    soundError: null,
  };
}

export function timerModel(config: Config): TimerModel {
  return {
    status: "ready",
    completed: 0,
    remainingMs: config.intervalMs,
    deadline: null,
    soundError: null,
    wakeLockError: null,
  };
}

export function initialModel(pathname: string, config = defaultConfig): Model {
  if (pathname === "/timer") {
    return { config, route: { kind: "timer", model: timerModel(config) }, clockId: 0 };
  }
  return { config, route: { kind: "home", model: setupModel(config) }, clockId: 0 };
}

export function formatTime(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

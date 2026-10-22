import type { Handlers, Outcome } from "./effects";
import type { RuntimeEvent } from "./runtime";
import type { Action } from "./update";

type EnvironmentAction = Extract<Action, { kind: "locationChanged" | "visible" }>;

export interface Environment {
  readonly pathname: string;
  handlers: Handlers;
  subscribe(dispatch: (action: EnvironmentAction) => void): () => void;
  subscribeClock(deadline: number, tick: (timestamp: number) => void): () => void;
  keepAwake(report: (result: Outcome) => void): () => void;
  downloadLog(events: readonly RuntimeEvent[]): void;
  dispose(): void;
}

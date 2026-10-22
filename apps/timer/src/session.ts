import type { Environment } from "./environment";
import type { Model } from "./model";
import { createRuntime } from "./runtime";

export function createSession(initial: Model, environment: Environment) {
  const runtime = createRuntime(initial, environment.handlers);
  return {
    environment,
    runtime,
    dispose: () => {
      runtime.dispose();
      environment.dispose();
    },
  };
}

export type Session = ReturnType<typeof createSession>;

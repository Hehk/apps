import { handle } from "./effects";
import type { Effect, Handlers, Program } from "./effects";
import type { Model } from "./model";
import { canHandle, update, workflowScope } from "./update";
import type { Action } from "./update";

type Entry =
  | { kind: "initial"; model: Model }
  | { kind: "action"; workflowId: number; action: Action }
  | { kind: "effect-request"; workflowId: number; effectId: number; effect: Effect }
  | { kind: "effect-result"; workflowId: number; effectId: number; value: unknown }
  | { kind: "model"; workflowId: number; effectId: number; model: Model }
  | { kind: "completed" | "cancelled" | "ignored"; workflowId: number }
  | { kind: "failed"; workflowId: number; error: string };

export type RuntimeEvent = Entry & { sequence: number };

type Workflow = {
  id: number;
  scope: string | null;
  generator: Program;
  controller: AbortController;
};

export function createRuntime(
  initial: Model,
  handlers: Handlers,
  recording?: readonly RuntimeEvent[],
) {
  let model = initial;
  let nextWorkflowId = 0;
  let nextEffectId = 0;
  let disposed = false;
  const active = new Map<number, Workflow>();
  const pending = new Map<number, { id: number; effect: Effect }>();
  const events: RuntimeEvent[] = [];
  const listeners = new Set<() => void>();
  const eventListeners = new Set<() => void>();

  function record(entry: Entry) {
    const event = structuredClone({ ...entry, sequence: events.length });
    if (recording != null && JSON.stringify(event) !== JSON.stringify(recording[events.length])) {
      throw new Error(`Replay diverged at event ${events.length}`);
    }
    events.push(event);
    for (const listener of eventListeners) {
      listener();
    }
  }

  function fail(workflow: Workflow, error: unknown) {
    active.delete(workflow.id);
    pending.delete(workflow.id);
    workflow.controller.abort();
    record({ kind: "failed", workflowId: workflow.id, error: String(error) });
  }

  function deliver(workflow: Workflow, value: unknown) {
    const request = pending.get(workflow.id);
    if (!active.has(workflow.id) || request == null) {
      return;
    }
    const { id, effect } = request;
    pending.delete(workflow.id);
    record({ kind: "effect-result", workflowId: workflow.id, effectId: id, value });
    if (effect.kind === "setModel") {
      model = effect.model;
      record({ kind: "model", workflowId: workflow.id, effectId: id, model });
      for (const listener of listeners) {
        listener();
      }
    }
    if (effect.kind === "getModel" || effect.kind === "setModel") {
      step(workflow, model);
    } else {
      step(workflow, [value, model]);
    }
  }

  function step(workflow: Workflow, reply?: unknown) {
    if (!active.has(workflow.id)) {
      return;
    }
    let next: IteratorResult<Effect, void>;
    try {
      next = workflow.generator.next(reply);
    } catch (error) {
      fail(workflow, error);
      return;
    }
    if (next.done === true) {
      active.delete(workflow.id);
      record({ kind: "completed", workflowId: workflow.id });
      return;
    }
    const effect = next.value;
    const effectId = ++nextEffectId;
    pending.set(workflow.id, { id: effectId, effect });
    record({ kind: "effect-request", workflowId: workflow.id, effectId, effect });
    if (recording != null) {
      return;
    }
    try {
      let value: unknown;
      if (effect.kind === "getModel") {
        value = model;
      } else if (effect.kind === "setModel") {
        value = effect.model;
      } else {
        value = handle(effect, handlers, workflow.controller.signal);
      }
      if (value instanceof Promise) {
        void value.then(
          (result) => deliver(workflow, result),
          (error: unknown) => {
            if (active.has(workflow.id)) {
              fail(workflow, error);
            }
          },
        );
      } else {
        deliver(workflow, value);
      }
    } catch (error) {
      fail(workflow, error);
    }
  }

  function cancel(workflow: Workflow, log = true) {
    active.delete(workflow.id);
    pending.delete(workflow.id);
    workflow.controller.abort();
    workflow.generator.return();
    if (log) {
      record({ kind: "cancelled", workflowId: workflow.id });
    }
  }

  function dispatch(action: Action) {
    if (disposed) {
      return;
    }
    const id = ++nextWorkflowId;
    record({ kind: "action", workflowId: id, action });
    if (!canHandle(model, action)) {
      record({ kind: "ignored", workflowId: id });
      return;
    }
    const scope = workflowScope(action);
    if (scope !== null) {
      for (const workflow of active.values()) {
        if (workflow.scope === scope) {
          cancel(workflow);
        }
      }
    }
    const workflow: Workflow = {
      id,
      scope,
      generator: update(action),
      controller: new AbortController(),
    };
    active.set(id, workflow);
    step(workflow);
  }

  record({ kind: "initial", model });

  function replay() {
    if (recording == null) {
      throw new Error("No recording supplied");
    }
    while (events.length < recording.length) {
      const event = recording[events.length];
      if (event?.kind === "action") {
        dispatch(event.action);
      } else if (event?.kind === "effect-result") {
        const workflow = active.get(event.workflowId);
        const request = pending.get(event.workflowId);
        if (workflow == null || request?.id !== event.effectId) {
          throw new Error("Replay effect mismatch");
        }
        const effect = request.effect;
        let value = event.value;
        if (effect.kind === "getModel") {
          value = model;
        } else if (effect.kind === "setModel") {
          value = effect.model;
        }
        deliver(workflow, value);
      } else if (event?.kind === "failed") {
        const workflow = active.get(event.workflowId);
        if (workflow == null) {
          throw new Error("Replay workflow mismatch");
        }
        // Failed effects terminate a workflow; expected application failures use typed results instead.
        active.delete(workflow.id);
        pending.delete(workflow.id);
        workflow.controller.abort();
        record({ kind: "failed", workflowId: workflow.id, error: event.error });
      } else {
        throw new Error(`Unexpected replay event at ${events.length}`);
      }
    }
    return model;
  }

  return {
    dispatch,
    getModel: () => model,
    getEvents: (): readonly RuntimeEvent[] => events,
    getEventCount: () => events.length,
    subscribeEvents: (listener: () => void) => {
      eventListeners.add(listener);
      return () => {
        eventListeners.delete(listener);
      };
    },
    getActiveCount: () => active.size,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    replay,
    dispose: () => {
      disposed = true;
      for (const workflow of active.values()) {
        cancel(workflow, false);
      }
      listeners.clear();
      eventListeners.clear();
    },
  };
}

export type Runtime = ReturnType<typeof createRuntime>;

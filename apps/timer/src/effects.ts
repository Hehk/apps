/* oxlint-disable typescript/no-unsafe-type-assertion -- Typed helpers bridge the generator next() boundary. */
import type { Model } from "./model";

export type Outcome = { ok: true } | { ok: false; error: string };

type Operations = {
  now: { params: null; result: number };
  audio: { params: { operation: "unlock" | "beep" }; result: Outcome };
  navigate: { params: { path: string }; result: null };
};

export type Operation = keyof Operations;
export type OperationEffect = {
  [K in Operation]: { kind: K; params: Operations[K]["params"] };
}[Operation];

export type Effect = { kind: "getModel" } | { kind: "setModel"; model: Model } | OperationEffect;

export type Program = Generator<Effect, void, unknown>;
export type EffectReply<T> = readonly [value: T, model: Model];
export type Handlers = {
  [K in Operation]: (
    params: Operations[K]["params"],
    signal: AbortSignal,
  ) => Operations[K]["result"] | Promise<Operations[K]["result"]>;
};

export function* getModel(): Generator<Effect, Model, unknown> {
  return (yield { kind: "getModel" }) as Model;
}

export function* setModel(model: Model): Generator<Effect, Model, unknown> {
  return (yield { kind: "setModel", model }) as Model;
}

// The runtime dispatches on kind; these assertions bridge TypeScript's uncorrelated next() type.
function* perform<K extends Operation>(
  kind: K,
  params: Operations[K]["params"],
): Generator<Effect, EffectReply<Operations[K]["result"]>, unknown> {
  return (yield { kind, params } as OperationEffect) as EffectReply<Operations[K]["result"]>;
}

export const now = () => perform("now", null);
export const audio = (operation: "unlock" | "beep") => perform("audio", { operation });
export const navigate = (path: string) => perform("navigate", { path });

export function handle(effect: OperationEffect, handlers: Handlers, signal: AbortSignal): unknown {
  // Keep the handler lookup assertion here, not in app workflows or browser handlers.
  const handler = handlers[effect.kind] as (params: unknown, signal: AbortSignal) => unknown;
  return handler(effect.params, signal);
}

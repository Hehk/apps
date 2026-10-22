# App architecture

This is the first pass at a shared architecture for the small apps in this repository. The timer app will be the first implementation to validate it.

## Shape of an app

- `model.ts` defines the app's data as plain JavaScript/TypeScript objects.
- The view is React. It renders UI and document metadata, sends actions, and mounts subscriptions according to the model. Subscription components connect in effects and clean up on unmount; they never update model state directly.
- `update` is a generator that handles an action and can express a multi-step workflow in ordinary sequential code.
- A central runtime interprets yielded effects, manages the current model, and resumes generators with effect results.

The intended generator shape is `Generator<Effect, void, Result>`: it yields effect requests, has no meaningful final return value, and receives results from the runtime through `next(result)`.

## Model access and effect results

`getModel` and `setModel` are special effects:

- `getModel` returns the current model.
- `setModel` applies a model update and returns the model after that update.

Other effect handlers return both their value and the current model as a tuple:

```ts
type EffectReply<A> = readonly [value: A, model: Model];
```

For example, an API effect returns a typed result such as `Result<Response, ApiError>` together with the latest model. App code threads the returned model forward; intentionally ignoring it should be explicit.

Effect helpers provide the typed interface used by generators. Effect descriptors describe the requested operation; the central runtime dispatches them to handlers that perform the actual work. TypeScript does not correlate a generator's yielded effect with its `next()` result automatically, so any necessary type assertion should be isolated at this helper/runtime boundary.

The runtime owns the current model; only `setModel` commits a change. Operation handlers return their typed value, and the runtime pairs that value with the current model when delivering the result to the generator. This avoids an asynchronous handler accidentally returning and committing an old snapshot. After an effect yields control, code should use the model returned at that boundary rather than assume a previously captured model is still current.

## Environment boundary

`createSession(model, environment)` allocates a runtime from the supplied model without connecting subscriptions or changing the browser. React receives `<App session={session} />`. The caller creates the session outside rendering and disposes it after unmounting.

Mounted components own external subscriptions. `EnvironmentEvents` connects navigation and visibility events; a running workout mounts `TimerClock` and `ScreenAwake`. Each component cleans up its own subscription. Cleanup tolerates React Strict Mode's setup-cleanup-setup cycle, ignores late callbacks, and releases wake locks even when acquisition finishes after unmount. Unmounting disconnects subscriptions, not the session; remounting a running timer samples the clock and catches up.

Titles are derived by the pure `pageTitle(model)` function and rendered as React `<title>` metadata. They are not a constructor side effect or a separate logged command. Domain calculations and validation live in `domain.ts`; generators in `update.ts` retain effect sequencing.

The environment supplies typed effect handlers, the initial pathname, subscriptions, and log downloads. The runtime receives only `environment.handlers`. Browser APIs live in `browser.ts`; test environments hold independent clocks and captured effects. `await clock.advanceBy(ms)` runs mounted clock subscriptions, while `clock.elapse(ms)` simulates suspension without firing callbacks. Tests do not patch global clocks. Runtime tests can dispatch timestamped actions without mounting React; component tests verify subscription lifetimes.

## Routing and model composition

The active route is part of the model. Routes are a discriminated union whose variants contain the model for that route, for example `{ kind: "home", model: Home.Model }` or `{ kind: "timer", id: string, model: Timer.Model }`.

The React view switches on the active route and delegates to that route's view. The parent update delegates route-specific actions to the matching child update and stores the resulting child model back in the active route. This keeps route state and behavior locally composed while all updates still pass through the central runtime.

The browser URL is synchronized with the active route: startup and `popstate` parse the URL into route changes; app navigation updates the model and requests a History API effect. Route-local UI state need not be serialized into the URL. Whether route models are discarded, recreated, or retained when navigating is app-specific.

Data shared between routes belongs at their nearest common model ancestor; route models own route-specific UI state. Route models organize state and ownership rather than eliminating the need to decide where shared data lives.

## Actions and replay

The runtime should record an ordered event stream containing:

- Actions received by the app.
- Effects requested, with IDs linking them to their originating action/workflow.
- Effect results, including failures.
- Model updates made by `setModel`.

Replay starts from an initial model (or a checkpoint), replays actions, and supplies recorded effect results without re-running external effects. Recording only effect requests is insufficient: API responses, clock reads, and other external results can be nondeterministic. Event ordering and workflow/effect IDs are needed to reproduce interleaving.

Logging should be implemented behind a runtime adapter so development logging and durable storage can differ. Logs may contain user data or secrets, so effect inputs and results need a redaction policy. Checkpoints can keep replay practical as logs grow.

## Concurrent workflows

The runtime can keep a registry of active workflows keyed by workflow ID. Each entry holds the generator and its current state (for example, running or waiting on an effect). Yielded effects receive their own IDs and are correlated with the workflow that requested them.

Effects may complete in any order. The append order of the central event log is authoritative: record action receipt, effect requests and results, and model commits with a monotonic sequence. On completion, the runtime pairs the result with the latest model and resumes only the matching generator. `setModel` commits are serialized through the runtime, even when handlers complete concurrently.

Generator instances are in-memory continuations and cannot themselves be persisted. Replay reconstructs them from actions and feeds recorded effect results back in event-log order. Recovery from an effect that was in flight during a crash needs an explicit policy, particularly for effects that may not be safe to run twice.

Timeouts should be effect-specific rather than a blanket workflow timeout; a long-running timer or sleep can be valid. A timeout should produce a recorded result, and cancellation should be an explicit, recorded operation. Handlers should receive a cancellation signal where possible, and late results from cancelled or timed-out effects must not resume a workflow twice.

## Open decisions

- The concrete TypeScript API for typed effect helpers and handler registration.
- Exact timeout and cancellation policies, including recovery of in-flight effects.
- Where durable event logs and checkpoints live, and their retention/schema-version policy.
- Which effect data is recorded verbatim versus redacted.

## Timer as the first implementation

The first implementation lives in `apps/timer/src`. Models, pure domain functions, React views/subscriptions, generator updates, the runtime, and browser adapters have separate modules. Keep the runtime here until a second app clarifies what should be shared.

The active route owns either the configuration form or the workout model. While running, React mounts a clock that dispatches timestamped tick actions. Pure timer transitions use absolute deadlines rather than counting ticks. Clock reads, tick timestamps, and wake-lock results are recorded, so replay needs neither mounted subscriptions nor live browser effects. A model clock ID identifies each run; stale ticks cannot affect a new workout.

Workout control and navigation actions share a workflow scope. A new action in that scope cancels its predecessor, aborts its pending handler, and closes the generator. This can cancel Start while audio is being enabled; no long-running generator is needed to drive the countdown. Sound testing can run concurrently. Results arriving after cancellation are ignored. Cancellation cleanup belongs in abort-aware handlers and the replacement workflow; yielding cleanup effects from generator `finally` blocks is not supported yet.

An in-memory event viewer supports download and replay verification. Reloading discards configuration, workout state, and logs; cloud persistence and crash recovery are not implemented in this slice. Replay requires compatible model and update code. Logs are currently unredacted timer data, so do not add sensitive effects without a redaction policy.

See `apps/timer/PLAN.md` for scope and mobile-browser limitations.

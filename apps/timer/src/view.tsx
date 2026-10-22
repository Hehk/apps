import { pageTitle } from "./domain";
import type { Config, Model, SetupModel, TimerModel } from "./model";
import { formatTime } from "./model";
import type { Action } from "./update";

type Dispatch = (action: Action) => void;

function Warning({ message }: { message: string | null }) {
  if (message == null || message === "") {
    return null;
  }
  return <p role="alert">{message}</p>;
}

function SetupView({ model, dispatch }: { model: SetupModel; dispatch: Dispatch }) {
  return (
    <section aria-label="Setup">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          dispatch({ kind: "home", action: { kind: "submit" } });
        }}
      >
        <div className="fields">
          {(
            [
              ["minutes", "Minutes", 0, 180],
              ["seconds", "Seconds", 0, 59],
              ["rounds", "Intervals", 1, 999],
            ] as const
          ).map(([field, label, min, max]) => (
            <label key={field}>
              {label}
              <input
                type="number"
                inputMode="numeric"
                min={min}
                max={max}
                step="1"
                value={model[field]}
                required
                onChange={(event) =>
                  dispatch({
                    kind: "home",
                    action: { kind: "edit", field, value: event.target.value },
                  })
                }
              />
            </label>
          ))}
        </div>
        <Warning message={model.error} />
        <button type="submit">Continue</button>
      </form>
      <Warning message={model.soundError} />
    </section>
  );
}

const startButtonLabels: Record<TimerModel["status"], string> = {
  complete: "Done",
  starting: "Pause",
  running: "Pause",
  paused: "Resume",
  ready: "Start",
};

function TimerView({
  model,
  config,
  dispatch,
}: {
  model: TimerModel;
  config: Config;
  dispatch: Dispatch;
}) {
  const complete = model.status === "complete";
  const running = model.status === "running" || model.status === "starting";
  let interval = `${Math.min(model.completed + 1, config.rounds)} / ${config.rounds}`;
  if (complete) {
    interval = "Done";
  }
  return (
    <section aria-label="Interval timer">
      <header>
        <span>
          {formatTime(config.intervalMs)} × {config.rounds}
        </span>
        <a
          href="/"
          onClick={(event) => {
            event.preventDefault();
            dispatch({ kind: "homeRequested" });
          }}
        >
          Edit
        </a>
      </header>
      <div className="countdown">
        <time aria-live="off">{formatTime(model.remainingMs)}</time>
        <output aria-live="polite">{interval}</output>
      </div>
      {model.soundError !== null && (
        <button onClick={() => dispatch({ kind: "testSound" })}>Enable sound</button>
      )}
      <div className="controls">
        <button
          disabled={complete}
          onClick={() => {
            if (running) {
              dispatch({ kind: "timer", action: { kind: "pause" } });
            } else {
              dispatch({ kind: "timer", action: { kind: "start" } });
            }
          }}
        >
          {startButtonLabels[model.status]}
        </button>
        <button onClick={() => dispatch({ kind: "timer", action: { kind: "reset" } })}>
          Reset
        </button>
      </div>
      <Warning message={model.soundError} />
      <Warning message={model.wakeLockError} />
    </section>
  );
}

export function View({ model, dispatch }: { model: Model; dispatch: Dispatch }) {
  return (
    <main>
      <title>{pageTitle(model)}</title>
      {model.route.kind === "home" && <SetupView model={model.route.model} dispatch={dispatch} />}
      {model.route.kind === "timer" && (
        <TimerView model={model.route.model} config={model.config} dispatch={dispatch} />
      )}
    </main>
  );
}

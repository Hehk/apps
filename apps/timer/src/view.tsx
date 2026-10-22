import * as stylex from "@stylexjs/stylex";
import { pageTitle } from "./domain";
import type { Config, Model, SetupModel, TimerModel } from "./model";
import { formatTime } from "./model";
import type { Action } from "./update";

type Dispatch = (action: Action) => void;

function Warning({ message }: { message: string | null }) {
  if (message == null || message === "") {
    return null;
  }
  return (
    <p {...stylex.props(styles.warning)} role="alert">
      {message}
    </p>
  );
}

function SetupView({ model, dispatch }: { model: SetupModel; dispatch: Dispatch }) {
  return (
    <section {...stylex.props(styles.section)} aria-label="Setup">
      <form
        {...stylex.props(styles.form)}
        onSubmit={(event) => {
          event.preventDefault();
          dispatch({ kind: "home", action: { kind: "submit" } });
        }}
      >
        <div {...stylex.props(styles.fields)}>
          {(
            [
              ["minutes", "Minutes", 0, 180],
              ["seconds", "Seconds", 0, 59],
              ["rounds", "Intervals", 1, 999],
            ] as const
          ).map(([field, label, min, max]) => (
            <label {...stylex.props(styles.label)} key={field}>
              {label}
              <input
                {...stylex.props(styles.field, styles.input)}
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
        <button {...stylex.props(styles.field, styles.button)} type="submit">
          Continue
        </button>
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
    <section {...stylex.props(styles.section)} aria-label="Interval timer">
      <header {...stylex.props(styles.row)}>
        <span>
          {formatTime(config.intervalMs)} × {config.rounds}
        </span>
        <a
          {...stylex.props(styles.link)}
          href="/"
          onClick={(event) => {
            event.preventDefault();
            dispatch({ kind: "homeRequested" });
          }}
        >
          Edit
        </a>
      </header>
      <div {...stylex.props(styles.countdown)}>
        <time {...stylex.props(styles.time)} aria-live="off">
          {formatTime(model.remainingMs)}
        </time>
        <output aria-live="polite">{interval}</output>
      </div>
      {model.soundError !== null && (
        <button
          {...stylex.props(styles.field, styles.button)}
          onClick={() => dispatch({ kind: "testSound" })}
        >
          Enable sound
        </button>
      )}
      <div {...stylex.props(styles.row)}>
        <button
          {...stylex.props(styles.field, styles.button, styles.control)}
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
        <button
          {...stylex.props(styles.field, styles.button, styles.control)}
          onClick={() => dispatch({ kind: "timer", action: { kind: "reset" } })}
        >
          Reset
        </button>
      </div>
      <Warning message={model.soundError} />
      <Warning message={model.wakeLockError} />
    </section>
  );
}

const styles = stylex.create({
  main: {
    boxSizing: "border-box",
    height: "100dvh",
    maxWidth: 480,
    margin: "auto",
    paddingTop: "calc(16px + env(safe-area-inset-top))",
    paddingRight: "calc(16px + env(safe-area-inset-right))",
    paddingBottom: "calc(32px + env(safe-area-inset-bottom))",
    paddingLeft: "calc(16px + env(safe-area-inset-left))",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  section: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 16,
  },
  form: {
    display: "grid",
    gap: 24,
  },
  fields: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 8,
  },
  label: {
    display: "grid",
    gap: 8,
  },
  field: {
    boxSizing: "border-box",
    font: "inherit",
    color: "#000",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#000",
    borderRadius: 0,
    minHeight: 48,
    padding: 8,
  },
  input: {
    width: "100%",
    minWidth: 0,
    fontSize: 24,
  },
  button: {
    borderStyle: { default: "solid", ":disabled": "dashed" },
  },
  control: {
    flex: 1,
  },
  link: {
    color: "inherit",
    padding: 12,
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  countdown: {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  time: {
    fontSize: "min(20vw, 20dvh, 96px)",
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1,
  },
  warning: {
    margin: 0,
    fontSize: 14,
  },
});

export function View({ model, dispatch }: { model: Model; dispatch: Dispatch }) {
  return (
    <main {...stylex.props(styles.main)}>
      <title>{pageTitle(model)}</title>
      {model.route.kind === "home" && <SetupView model={model.route.model} dispatch={dispatch} />}
      {model.route.kind === "timer" && (
        <TimerView model={model.route.model} config={model.config} dispatch={dispatch} />
      )}
    </main>
  );
}

import { useEffect } from "react";
import type { Environment } from "./environment";
import type { Model } from "./model";
import type { Session } from "./session";
import type { Action } from "./update";

type Dispatch = (action: Action) => void;
type SubscriptionProps = { environment: Environment; dispatch: Dispatch };

function EnvironmentEvents({ environment, dispatch }: SubscriptionProps) {
  useEffect(() => {
    let active = true;
    const unsubscribe = environment.subscribe((action) => {
      if (active) {
        dispatch(action);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [environment, dispatch]);
  return null;
}

function TimerClock({
  environment,
  dispatch,
  clockId,
  deadline,
}: SubscriptionProps & { clockId: number; deadline: number }) {
  useEffect(() => {
    let active = true;
    const unsubscribe = environment.subscribeClock(deadline, (timestamp) => {
      if (active) {
        dispatch({ kind: "tick", clockId, timestamp });
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [environment, dispatch, clockId, deadline]);
  return null;
}

function ScreenAwake({ environment, dispatch, clockId }: SubscriptionProps & { clockId: number }) {
  useEffect(() => {
    let active = true;
    const unsubscribe = environment.keepAwake((result) => {
      if (active) {
        dispatch({ kind: "wakeLockResult", clockId, result });
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [environment, dispatch, clockId]);
  return null;
}

export function Subscriptions({ session, model }: { session: Session; model: Model }) {
  const { environment, runtime } = session;
  return (
    <>
      <EnvironmentEvents environment={environment} dispatch={runtime.dispatch} />
      {model.route.kind === "timer" &&
        model.route.model.status === "running" &&
        model.route.model.deadline !== null && (
          <>
            <TimerClock
              environment={environment}
              dispatch={runtime.dispatch}
              clockId={model.clockId}
              deadline={model.route.model.deadline}
            />
            <ScreenAwake
              environment={environment}
              dispatch={runtime.dispatch}
              clockId={model.clockId}
            />
          </>
        )}
    </>
  );
}

import { useSyncExternalStore } from "react";
import type { Session } from "./session";
import { Subscriptions } from "./subscriptions";
import { View } from "./view";

export function App({ session }: { session: Session }) {
  const { runtime } = session;
  const model = useSyncExternalStore(runtime.subscribe, runtime.getModel, runtime.getModel);
  return (
    <>
      <Subscriptions session={session} model={model} />
      <View model={model} dispatch={runtime.dispatch} />
    </>
  );
}

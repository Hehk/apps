import { nextClockDelay } from "./domain";
import type { Handlers, Outcome } from "./effects";
import type { Environment } from "./environment";

const failure = (error: unknown): Outcome => ({ ok: false, error: String(error) });

export function createBrowserEnvironment(): Environment {
  let context: AudioContext | null = null;
  let disposed = false;
  const subscriptions = new Set<() => void>();

  const handlers: Handlers = {
    now: () => Date.now(),
    audio: ({ operation }, signal) => {
      try {
        context ??= new AudioContext();
        const audio = context;
        if (operation === "unlock") {
          // Keep this synchronous with the Start click to preserve the user gesture.
          return new Promise<Outcome>((resolve) => {
            const timeout = window.setTimeout(
              () => resolve(failure("Sound could not start. Tap Test sound to retry.")),
              3000,
            );
            void audio.resume().then(
              () => {
                window.clearTimeout(timeout);
                if (signal.aborted) {
                  resolve(failure("Cancelled"));
                  return;
                }
                resolve({ ok: true });
              },
              (error: unknown) => {
                window.clearTimeout(timeout);
                resolve(failure(error));
              },
            );
          });
        }
        if (audio.state !== "running") {
          return failure("Sound is suspended. Tap Test sound to enable it.");
        }
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = "square";
        const start = audio.currentTime;
        gain.gain.setValueAtTime(0, start);
        for (let pulse = 0; pulse < 3; pulse++) {
          const at = start + pulse * 0.35;
          oscillator.frequency.setValueAtTime(880, at);
          oscillator.frequency.setValueAtTime(1320, at + 0.13);
          gain.gain.setValueAtTime(0, at);
          gain.gain.linearRampToValueAtTime(0.8, at + 0.01);
          gain.gain.setValueAtTime(0.8, at + 0.24);
          gain.gain.linearRampToValueAtTime(0, at + 0.27);
        }
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start(start);
        oscillator.stop(start + 1);
        oscillator.addEventListener(
          "ended",
          () => {
            oscillator.disconnect();
            gain.disconnect();
          },
          { once: true },
        );
        return { ok: true };
      } catch (error) {
        return failure(error);
      }
    },
    navigate: ({ path }) => {
      window.history.pushState(null, "", path);
      return null;
    },
  };

  return {
    handlers,
    get pathname() {
      return window.location.pathname;
    },
    subscribe(dispatch) {
      const locationChanged = () =>
        dispatch({ kind: "locationChanged", pathname: window.location.pathname });
      const visibilityChanged = () => {
        if (document.visibilityState === "visible") {
          dispatch({ kind: "visible", timestamp: Date.now() });
        }
      };
      window.addEventListener("popstate", locationChanged);
      document.addEventListener("visibilitychange", visibilityChanged);
      const unsubscribe = () => {
        window.removeEventListener("popstate", locationChanged);
        document.removeEventListener("visibilitychange", visibilityChanged);
        subscriptions.delete(unsubscribe);
      };
      subscriptions.add(unsubscribe);
      return unsubscribe;
    },
    subscribeClock(deadline, tick) {
      let active = true;
      let timeout: number | undefined;
      function emit() {
        if (!active || disposed) {
          return;
        }
        tick(Date.now());
        if (active) {
          timeout = window.setTimeout(emit, nextClockDelay(deadline, Date.now()));
        }
      }
      const unsubscribe = () => {
        active = false;
        window.clearTimeout(timeout);
        subscriptions.delete(unsubscribe);
      };
      subscriptions.add(unsubscribe);
      emit();
      return unsubscribe;
    },
    keepAwake(report) {
      let active = true;
      let version = 0;
      let lock: WakeLockSentinel | null = null;
      async function acquire() {
        const requestVersion = ++version;
        if (lock != null && !lock.released) {
          return;
        }
        if (!("wakeLock" in navigator)) {
          report(failure("Screen wake lock is unavailable. Keep your screen awake manually."));
          return;
        }
        try {
          const next = await navigator.wakeLock.request("screen");
          if (!active || disposed || requestVersion !== version) {
            await next.release();
            return;
          }
          lock = next;
          report({ ok: true });
        } catch {
          if (active && requestVersion === version) {
            report(
              failure(
                "Could not keep the screen awake. Keep this page visible and your screen unlocked.",
              ),
            );
          }
        }
      }
      const visible = () => {
        if (document.visibilityState === "visible") {
          void acquire().catch((error: unknown) => console.error(error));
        }
      };
      document.addEventListener("visibilitychange", visible);
      const unsubscribe = () => {
        active = false;
        ++version;
        document.removeEventListener("visibilitychange", visible);
        if (lock != null) {
          void lock.release().catch(() => {});
        }
        subscriptions.delete(unsubscribe);
      };
      subscriptions.add(unsubscribe);
      void acquire().catch((error: unknown) => console.error(error));
      return unsubscribe;
    },
    downloadLog(events) {
      const blob = new Blob([JSON.stringify({ version: 1, events }, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "timer-events.json";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    dispose() {
      disposed = true;
      for (const unsubscribe of subscriptions) {
        unsubscribe();
      }
      if (context != null) {
        void context.close().catch(() => {});
      }
    },
  };
}

import { nextClockDelay } from "../domain";
import type { Environment } from "../environment";
import type { RuntimeEvent } from "../runtime";

type Clock = { at: number; emit(): void };

export function createTestEnvironment(pathname = "/timer", startTime = 10_000) {
  let time = startTime;
  let path = pathname;
  const listeners = new Set<Parameters<Environment["subscribe"]>[0]>();
  const clocks = new Set<Clock>();
  const locks = new Set<() => void>();
  const sounds: ("unlock" | "beep")[] = [];
  const wakeLocks: boolean[] = [];
  const navigations: string[] = [];
  const downloads: (readonly RuntimeEvent[])[] = [];

  const environment: Environment = {
    get pathname() {
      return path;
    },
    handlers: {
      now: () => time,
      audio: ({ operation }) => {
        sounds.push(operation);
        return { ok: true };
      },
      navigate: ({ path: next }) => {
        path = next;
        navigations.push(next);
        return null;
      },
    },
    subscribe(dispatch) {
      listeners.add(dispatch);
      return () => {
        listeners.delete(dispatch);
      };
    },
    subscribeClock(deadline, tick) {
      const clock: Clock = {
        at: time + nextClockDelay(deadline, time),
        emit() {
          clock.at = time + nextClockDelay(deadline, time);
          tick(time);
        },
      };
      clocks.add(clock);
      tick(time);
      return () => {
        clocks.delete(clock);
      };
    },
    keepAwake(report) {
      wakeLocks.push(true);
      const release = () => {
        if (locks.delete(release)) {
          wakeLocks.push(false);
        }
      };
      locks.add(release);
      report({ ok: true });
      return release;
    },
    downloadLog(events) {
      downloads.push(structuredClone(events));
    },
    dispose() {
      clocks.clear();
      listeners.clear();
      for (const release of locks) {
        release();
      }
    },
  };

  const clock = {
    now: () => time,
    elapse(ms: number) {
      if (!Number.isFinite(ms) || ms < 0) {
        throw new Error("Expected a non-negative duration");
      }
      time += ms;
    },
    async advanceBy(ms: number) {
      if (!Number.isFinite(ms) || ms < 0) {
        throw new Error("Expected a non-negative duration");
      }
      const target = time + ms;
      await Promise.resolve();
      while (true) {
        let next: Clock | undefined;
        for (const entry of clocks) {
          if (entry.at <= target && (next == null || entry.at < next.at)) {
            next = entry;
          }
        }
        if (next == null) {
          break;
        }
        time = Math.max(time, next.at);
        next.emit();
        await Promise.resolve();
      }
      time = target;
    },
  };

  return {
    environment,
    clock,
    sounds,
    wakeLocks,
    navigations,
    downloads,
    getSubscriptionCounts: () => ({
      events: listeners.size,
      clocks: clocks.size,
      wakeLocks: locks.size,
    }),
    goTo(next: string) {
      path = next;
      for (const listener of listeners) {
        listener({ kind: "locationChanged", pathname: next });
      }
    },
    becomeVisible() {
      for (const listener of listeners) {
        listener({ kind: "visible", timestamp: time });
      }
    },
  };
}

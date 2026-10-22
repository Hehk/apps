// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createBrowserEnvironment } from "./browser";

// jsdom does not implement Web Audio or the Audio Session API.
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([true, false])("unlocks audio with Audio Session support: %s", async (supported) => {
  const audioSession = { type: "auto" };
  let browser: { audioSession?: { type: string } } = {};
  if (supported) {
    browser = { audioSession };
  }
  vi.stubGlobal("navigator", browser);
  const resume = vi.fn(() => Promise.resolve());
  const close = vi.fn(() => Promise.resolve());
  vi.stubGlobal(
    "AudioContext",
    class {
      state = "running";
      resume = resume;
      close = close;
      constructor() {
        if (supported) {
          expect(audioSession.type).toBe("playback");
        }
      }
    },
  );
  const environment = createBrowserEnvironment();
  try {
    const result = await environment.handlers.audio(
      { operation: "unlock" },
      new AbortController().signal,
    );
    expect(result).toEqual({ ok: true });
    expect(resume).toHaveBeenCalledOnce();
  } finally {
    environment.dispose();
  }
  expect(close).toHaveBeenCalledOnce();
});

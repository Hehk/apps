# Interval timer: first architecture slice

Build a foreground workout timer, defaulting to 2 minutes × 30 intervals. Beep at each boundary, restart the countdown automatically, and stop after the final interval. Support configuration, pause/resume, reset, and a sound test.

1. Define plain route-owned setup and workout models, with shared configuration at the root. Render them with React and dispatch typed actions.
2. Implement typed `yield*` effect helpers and a small runtime. Keep model access synchronous; other effects return `[value, latestModel]`. Track active generators, cancel superseded timer workflows, and log actions, requests, results, commits, and workflow lifecycle events.
3. Mount a clock component while the workout is running. Dispatch timestamped actions and use pure transitions with absolute deadlines, catching up without a burst of missed beeps.
4. Let React own clock, navigation, and wake-lock subscription lifetimes. Keep audio and navigation requests as typed generator effects. Replay recorded actions and results without mounting subscriptions or repeating browser effects.
5. Test interval completion, pause/resume, delayed wakeups, cancellation, model freshness, and replay. Run the repository checks and build.

Keep the first runtime inside the timer app until another app demonstrates what should be shared. Event history is in memory with an export button; durable recovery and cloud persistence are not part of this slice.

Mobile browsers can suspend timers and audio in the background or while locked. Request a wake lock when supported, show that limitation in the UI, and treat foreground use as the supported workout mode.

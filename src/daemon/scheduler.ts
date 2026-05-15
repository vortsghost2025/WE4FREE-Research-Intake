/**
 * Scheduler for daemon mode.
 * Phase 1: Single run. Phase 2: Cron-like interval scheduling.
 */
export function startDaemon(runFn: () => Promise<void>, intervalMs: number = 3600000): void {
  console.log(`[daemon:scheduler] Starting daemon with interval ${intervalMs}ms`);
  
  // Run immediately on start
  runFn().then(() => {
    // Then schedule periodic runs
    setInterval(() => {
      runFn().catch(err => {
        console.error(`[daemon:scheduler] Run failed: ${err.message}`);
      });
    }, intervalMs);
  }).catch(err => {
    console.error(`[daemon:scheduler] Initial run failed: ${err.message}`);
  });
}

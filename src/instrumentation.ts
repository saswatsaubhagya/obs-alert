// ponytail: a daily timer inside the app process rather than an external cron —
// the app is already a long-running single instance, so there is nothing to
// coordinate. Move to a real scheduler if it ever runs more than one instance.
//
// `instrumentation.ts` is picked up automatically by Next (no
// `experimental.instrumentationHook` needed as of Next 13.4+ / stable since
// Next 15 — Next 16.3.4 warns if that flag is still set).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { pruneAlertLogs } = await import('./lib/retention');
  const run = () =>
    pruneAlertLogs()
      .then((n) => n && console.log(`pruned ${n} alert logs`))
      .catch((e) => console.error('prune failed', e));
  setTimeout(run, 60_000).unref();
  setInterval(run, 86_400_000).unref();
}

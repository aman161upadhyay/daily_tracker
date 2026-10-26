/**
 * One read-modify-write at a time for the headless writers.
 *
 * A widget tap and a notification button can arrive together; Android runs
 * both headless tasks on the same JavaScript runtime, so a plain promise chain
 * is a real mutex here. Without it both tasks load the same state, each adds
 * its own row and the second `persist` is computed against a stale base — a
 * YES_NO habit ends up logged twice. The SQLite connection serialises single
 * statements, not whole load → apply → persist sequences, which is what this
 * covers.
 */
let chain: Promise<unknown> = Promise.resolve();

export function withHeadlessLock<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job);
  chain = run.catch(() => undefined);
  return run;
}

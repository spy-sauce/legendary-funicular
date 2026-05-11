// Concurrency-limited promise pool — shared utility.
//
// Originally inlined in cli/src/commands/cultivate.ts as runWithConcurrency.
// Extracted to make the pool consumable by audit-run testers (cli/src/lib/audit/)
// without duplicating the implementation or forcing audit code to import from
// commands/. Same signature, same cursor-based scheduling semantics.

export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  }

  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    () => runner()
  );
  await Promise.all(runners);
  return results;
}

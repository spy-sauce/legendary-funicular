// Mycelium Framework — VibeSpace LLC — The network provides.
//
// DuckDB stub — real WASM implementation requires the `duckdb` npm package.
// Install with: cd cli && npm install duckdb
// Until installed, all queries return empty arrays so the server starts cleanly.

export async function query<T>(sql: string, params: unknown[]): Promise<T[]> {
  try {
    // Attempt dynamic import so the package is optional at build time
    // @ts-ignore — duckdb is an optional runtime dep
    const duckdb = await import("duckdb").catch(() => null);
    if (!duckdb) return [];

    return new Promise((resolve, reject) => {
      const db = new duckdb.default.Database(":memory:");
      const conn = db.connect();
      conn.all(sql, ...(params as any[]), (err: Error | null, rows: T[]) => {
        db.close();
        if (err) reject(err);
        else resolve(rows ?? []);
      });
    });
  } catch {
    return [];
  }
}

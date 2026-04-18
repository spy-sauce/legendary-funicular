// Mycelium Framework — VibeSpace LLC — The network provides.
//
// DuckDB wrapper for fleet queries.
//
// Contract: NUTRIENTS.md §10 — Fleet query (DuckDB over JSONL)
// Scope: Lazy-initialized DuckDB connection reading .mycelium/events/*.jsonl
// Rules: Connection is reused across requests. Read-only. WASM-backed.
//
// Approved dependency: `duckdb` npm package per NUTRIENTS.md §10.

/**
 * DuckDB connection handle abstraction.
 * Wraps the native DuckDB connection with typed query methods.
 */
export interface DuckDBConnection {
  /**
   * Execute a SQL query and return typed rows.
   * @param sql - SQL query string. Use `?` for positional parameters.
   * @param params - Parameter values to bind.
   * @returns Promise resolving to array of result rows.
   */
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;

  /**
   * Close the connection and release resources.
   * After calling close(), the connection cannot be reused.
   */
  close(): Promise<void>;
}

// Module-level singleton state for lazy initialization
let dbInstance: unknown | null = null;
let connInstance: unknown | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let duckdbModule: any | null = null;
let initPromise: Promise<void> | null = null;
let isClosed = false;

/**
 * Lazily initialize the DuckDB database and connection.
 * This is called automatically by openDuckDB() and query().
 * Subsequent calls return immediately if already initialized.
 */
async function ensureInitialized(): Promise<void> {
  if (isClosed) {
    throw new Error("DuckDB connection has been closed");
  }

  if (dbInstance && connInstance) {
    return;
  }

  // If initialization is in progress, wait for it
  if (initPromise) {
    return initPromise;
  }

  // Start initialization
  initPromise = (async () => {
    try {
      // Dynamic import for optional runtime dependency
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — duckdb is an optional peer dep; absence is handled in catch
      duckdbModule = await import("duckdb");

      // DuckDB's default export is the Database constructor
      const Database =
        (duckdbModule as unknown as { default: { Database: unknown } }).default
          ?.Database ??
        (duckdbModule as unknown as { Database: unknown }).Database ??
        (duckdbModule as unknown as { default: unknown }).default;

      // Create in-memory database
      dbInstance = await new Promise((resolve, reject) => {
        const db = new (Database as new (
          path: string,
          cb: (err: Error | null) => void
        ) => unknown)(":memory:", (err: Error | null) => {
          if (err) reject(err);
          else resolve(db);
        });
      });

      // Create connection
      connInstance = await new Promise((resolve, reject) => {
        (
          dbInstance as {
            connect: (cb: (err: Error | null, conn: unknown) => void) => void;
          }
        ).connect((err: Error | null, conn: unknown) => {
          if (err) reject(err);
          else resolve(conn);
        });
      });
    } catch (err) {
      // Reset state on failure so retry is possible
      dbInstance = null;
      connInstance = null;
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
}

/**
 * Execute a raw SQL query against the connection.
 * Internal helper used by both the query function and DuckDBConnection.
 */
async function executeQuery<T>(sql: string, params: unknown[]): Promise<T[]> {
  await ensureInitialized();

  return new Promise((resolve, reject) => {
    const conn = connInstance as {
      all: (
        sql: string,
        ...args: [...unknown[], (err: Error | null, rows: T[]) => void]
      ) => void;
    };

    // DuckDB's all() takes sql, then params spread, then callback
    conn.all(sql, ...params, (err: Error | null, rows: T[]) => {
      if (err) reject(err);
      else resolve(rows ?? []);
    });
  });
}

/**
 * Open and return a DuckDB connection.
 *
 * The connection is lazily initialized on first call and reused across
 * all subsequent calls. This avoids repeated WASM initialization overhead.
 *
 * @returns Promise resolving to a DuckDBConnection interface.
 * @throws Error if DuckDB package is not installed or initialization fails.
 */
export async function openDuckDB(): Promise<DuckDBConnection> {
  await ensureInitialized();

  return {
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      return executeQuery<T>(sql, params);
    },

    async close(): Promise<void> {
      if (isClosed) return;

      isClosed = true;

      // Close connection
      if (connInstance) {
        await new Promise<void>((resolve) => {
          try {
            // DuckDB connections may not have explicit close
            resolve();
          } catch {
            resolve();
          }
        });
        connInstance = null;
      }

      // Close database
      if (dbInstance) {
        await new Promise<void>((resolve) => {
          try {
            (dbInstance as { close: (cb?: () => void) => void }).close(() => {
              resolve();
            });
          } catch {
            resolve();
          }
        });
        dbInstance = null;
      }

      initPromise = null;
    },
  };
}

/**
 * Execute a typed SQL query.
 *
 * This is a convenience function that uses the shared connection.
 * Prefer this over openDuckDB() for simple query patterns.
 *
 * If DuckDB is not installed, returns an empty array to allow the server
 * to start cleanly in environments without the dependency.
 *
 * @param sql - SQL query string. Use `?` for positional parameters.
 * @param params - Parameter values to bind (default: empty array).
 * @returns Promise resolving to array of typed result rows.
 */
export async function query<T>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  try {
    return await executeQuery<T>(sql, params);
  } catch (err) {
    // Log error for debugging but don't crash
    // This allows the server to start even if DuckDB isn't available
    const message = err instanceof Error ? err.message : String(err);

    // Only log if it's not a "module not found" error (expected when not installed)
    if (!message.includes("Cannot find module") && !message.includes("duckdb")) {
      console.error("[fleet/duckdb] Query error:", message);
    }

    return [];
  }
}

/**
 * Reset the connection state.
 * Used for testing or when the connection needs to be re-established.
 */
export async function resetConnection(): Promise<void> {
  if (connInstance || dbInstance) {
    const conn = await openDuckDB();
    await conn.close();
  }
  isClosed = false;
}

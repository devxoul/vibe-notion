import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export type SqliteRow = Record<string, unknown>

export type SqliteDatabase = {
  all(sql: string, ...params: unknown[]): SqliteRow[]
  close(): void
}

// Open a read-only SQLite database for cookie/credential extraction.
// Runtime selection (in order): bun:sqlite (Bun), node:sqlite (Node 22+),
// better-sqlite3 (optional, fallback for Node < 22). better-sqlite3 cannot run
// under Bun (oven-sh/bun#4290) and requires node-gyp/make to compile, which is
// why it is listed in optionalDependencies — running under Bun or Node 22+ must
// not require it to be installed.
export function openSqlite(path: string): SqliteDatabase {
  if (typeof globalThis.Bun !== 'undefined') {
    const { Database } = require('bun:sqlite') as {
      Database: new (path: string, options?: Record<string, unknown>) => {
        query(sql: string): { all(...params: unknown[]): SqliteRow[] }
        close(): void
      }
    }
    const db = new Database(path, { readonly: true })
    return {
      all: (sql, ...params) => db.query(sql).all(...params),
      close: () => db.close(),
    }
  }

  try {
    const { DatabaseSync } = require('node:sqlite') as {
      DatabaseSync: new (path: string, options?: Record<string, unknown>) => {
        prepare(sql: string): { all(...params: unknown[]): SqliteRow[] }
        close(): void
      }
    }
    const db = new DatabaseSync(path, { readOnly: true })
    return {
      all: (sql, ...params) => db.prepare(sql).all(...params),
      close: () => db.close(),
    }
  } catch {
    // node:sqlite unavailable on this Node version — fall through to better-sqlite3.
  }

  type BetterSqlite3 = new (
    path: string,
    options?: Record<string, unknown>,
  ) => {
    prepare(sql: string): { all(...params: unknown[]): SqliteRow[] }
    close(): void
  }
  let BetterSqlite3: BetterSqlite3
  try {
    BetterSqlite3 = require('better-sqlite3') as BetterSqlite3
  } catch {
    throw new Error(
      'SQLite is required for Node.js. Use Node.js 22+ (which includes node:sqlite), or install better-sqlite3: npm install better-sqlite3',
    )
  }
  const db = new BetterSqlite3(path, { readonly: true })
  return {
    all: (sql, ...params) => db.prepare(sql).all(...params),
    close: () => db.close(),
  }
}

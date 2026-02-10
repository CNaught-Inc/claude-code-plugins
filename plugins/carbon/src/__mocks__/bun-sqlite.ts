/**
 * Test shim: maps bun:sqlite → better-sqlite3 for Jest (which runs under Node.js).
 * Production code uses bun:sqlite via Bun runtime; tests use this compatibility layer.
 *
 * Key difference: bun:sqlite expects named param keys WITH $ prefix (e.g. { $name: 'val' }),
 * but better-sqlite3 expects them WITHOUT the prefix (e.g. { name: 'val' }).
 * This shim strips the $ prefix from param object keys to bridge the gap.
 */
import BetterSqlite3 from 'better-sqlite3';

function stripPrefixes(params: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
        const stripped = key.startsWith('$') ? key.slice(1) : key;
        result[stripped] = value;
    }
    return result;
}

function maybeStrip(args: unknown[]): unknown[] {
    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])) {
        return [stripPrefixes(args[0] as Record<string, unknown>)];
    }
    return args;
}

function wrapStatement(stmt: BetterSqlite3.Statement): BetterSqlite3.Statement {
    const origRun = stmt.run.bind(stmt);
    const origGet = stmt.get.bind(stmt);
    const origAll = stmt.all.bind(stmt);

    stmt.run = ((...args: unknown[]) => origRun(...maybeStrip(args))) as typeof stmt.run;
    stmt.get = ((...args: unknown[]) => origGet(...maybeStrip(args))) as typeof stmt.get;
    stmt.all = ((...args: unknown[]) => origAll(...maybeStrip(args))) as typeof stmt.all;

    return stmt;
}

const _prepare = BetterSqlite3.prototype.prepare;

// Patch prepare on the prototype to wrap all statements
BetterSqlite3.prototype.prepare = function (this: BetterSqlite3.Database, sql: string) {
    return wrapStatement(_prepare.call(this, sql));
} as typeof _prepare;

const Database = BetterSqlite3;
export { Database };

/**
 * Test shim: maps bun:sqlite → better-sqlite3 for Jest (which runs under Node.js).
 * Production code uses bun:sqlite via Bun runtime; tests use this compatibility layer.
 */
import Database from 'better-sqlite3';
export { Database };

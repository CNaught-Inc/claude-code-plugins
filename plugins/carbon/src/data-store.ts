/**
 * Data Store
 *
 * SQLite-based local storage for session carbon data.
 * Database location: ~/.claude/carbon-tracker.db
 */

import { Database } from 'bun:sqlite';
import * as fs from 'fs';
import * as path from 'path';
import { logError } from './utils/stdin.js';

/**
 * Session record in the database
 */
export interface SessionRecord {
    sessionId: string;
    projectPath: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    energyWh: number;
    co2Grams: number;
    primaryModel: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Aggregate statistics
 */
export interface AggregateStats {
    totalSessions: number;
    totalTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheCreationTokens: number;
    totalCacheReadTokens: number;
    totalEnergyWh: number;
    totalCO2Grams: number;
}

/**
 * Daily stats for reporting
 */
export interface DailyStats {
    date: string;
    sessions: number;
    tokens: number;
    energyWh: number;
    co2Grams: number;
}

/**
 * Project stats for reporting
 */
export interface ProjectStats {
    projectPath: string;
    sessions: number;
    tokens: number;
    energyWh: number;
    co2Grams: number;
}

/**
 * Encode a raw project path to the format stored in the database.
 * Claude Code stores transcripts under ~/.claude/projects/<encoded-path>/
 * where slashes are replaced with dashes.
 */
export function encodeProjectPath(rawPath: string): string {
    return rawPath.replace(/\//g, '-');
}

/**
 * Get the user's home directory
 */
export function getHomeDir(): string {
    return process.env.HOME || process.env.USERPROFILE || '';
}

/**
 * Get the Claude config directory (~/.claude)
 */
export function getClaudeDir(): string {
    return path.join(getHomeDir(), '.claude');
}

/**
 * Get the database file path
 */
export function getDatabasePath(): string {
    return path.join(getClaudeDir(), 'carbon-tracker.db');
}

/**
 * Ensure the database directory exists
 */
function ensureDbDirectory(): void {
    const dbPath = getDatabasePath();
    const dbDir = path.dirname(dbPath);

    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
}

/**
 * Open database connection
 */
export function openDatabase(): Database {
    ensureDbDirectory();
    const dbPath = getDatabasePath();
    return new Database(dbPath);
}

/**
 * Open, initialize, run callback, and close the database.
 * Handles the common open → init → use → close pattern.
 */
export function withDatabase<T>(fn: (db: Database) => T): T {
    const db = openDatabase();
    try {
        initializeDatabase(db);
        return fn(db);
    } finally {
        db.close();
    }
}

/**
 * Open the database in readonly mode, run a query, and close.
 * Returns null if the database doesn't exist or the query fails.
 */
export function queryReadonlyDb<T>(fn: (db: Database) => T): T | null {
    const dbPath = getDatabasePath();
    if (!fs.existsSync(dbPath)) {
        return null;
    }
    const db = new Database(dbPath, { readonly: true });
    try {
        return fn(db);
    } catch {
        return null;
    } finally {
        db.close();
    }
}

interface Migration {
    version: number;
    description: string;
    up: (db: Database) => void;
}

export const MIGRATIONS: Migration[] = [
    // Add new migrations here. Each must be idempotent.
    // Example:
    // {
    //     version: 1,
    //     description: 'Add duration_seconds column to sessions',
    //     up: (db) => {
    //         if (!columnExists(db, 'sessions', 'duration_seconds')) {
    //             db.exec('ALTER TABLE sessions ADD COLUMN duration_seconds REAL');
    //         }
    //     },
    // },
];

/**
 * Check if a column exists on a table (useful for idempotent migrations)
 */
export function columnExists(db: Database, table: string, column: string): boolean {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    return cols.some((c) => c.name === column);
}

/**
 * Run pending schema migrations using PRAGMA user_version for tracking
 */
function runMigrations(db: Database): void {
    const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
    const currentVersion = row.user_version;

    if (currentVersion >= MIGRATIONS.length) {
        return;
    }

    for (let i = currentVersion; i < MIGRATIONS.length; i++) {
        const migration = MIGRATIONS[i];
        try {
            migration.up(db);
            db.exec(`PRAGMA user_version = ${migration.version}`);
        } catch (error) {
            logError(`Migration v${migration.version} failed: ${migration.description}`, error);
            return;
        }
    }
}

/**
 * Initialize the database schema
 */
export function initializeDatabase(db: Database): void {
    // Migration: clean up auth_config table and synced_at index from older versions
    db.exec('DROP TABLE IF EXISTS auth_config');
    db.exec('DROP INDEX IF EXISTS idx_sessions_synced_at');

    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            project_path TEXT NOT NULL,
            input_tokens INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
            cache_read_tokens INTEGER NOT NULL DEFAULT 0,
            total_tokens INTEGER NOT NULL DEFAULT 0,
            energy_wh REAL NOT NULL DEFAULT 0,
            co2_grams REAL NOT NULL DEFAULT 0,
            primary_model TEXT NOT NULL DEFAULT 'unknown',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
        CREATE INDEX IF NOT EXISTS idx_sessions_project_path ON sessions(project_path);

        CREATE TABLE IF NOT EXISTS plugin_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);

    runMigrations(db);
}

/**
 * Upsert a session record
 * Preserves created_at on update
 */
export function upsertSession(
    db: Database,
    session: SessionRecord
): void {
    const stmt = db.prepare(`
        INSERT INTO sessions (
            session_id, project_path, input_tokens, output_tokens,
            cache_creation_tokens, cache_read_tokens, total_tokens,
            energy_wh, co2_grams, primary_model, created_at, updated_at
        ) VALUES (
            $sessionId, $projectPath, $inputTokens, $outputTokens,
            $cacheCreationTokens, $cacheReadTokens, $totalTokens,
            $energyWh, $co2Grams, $primaryModel, $createdAt, $updatedAt
        )
        ON CONFLICT(session_id) DO UPDATE SET
            project_path = excluded.project_path,
            input_tokens = excluded.input_tokens,
            output_tokens = excluded.output_tokens,
            cache_creation_tokens = excluded.cache_creation_tokens,
            cache_read_tokens = excluded.cache_read_tokens,
            total_tokens = excluded.total_tokens,
            energy_wh = excluded.energy_wh,
            co2_grams = excluded.co2_grams,
            primary_model = excluded.primary_model,
            updated_at = excluded.updated_at
    `);

    stmt.run({
        $sessionId: session.sessionId,
        $projectPath: session.projectPath,
        $inputTokens: session.inputTokens,
        $outputTokens: session.outputTokens,
        $cacheCreationTokens: session.cacheCreationTokens,
        $cacheReadTokens: session.cacheReadTokens,
        $totalTokens: session.totalTokens,
        $energyWh: session.energyWh,
        $co2Grams: session.co2Grams,
        $primaryModel: session.primaryModel,
        $createdAt: session.createdAt.toISOString(),
        $updatedAt: session.updatedAt.toISOString()
    });
}

/**
 * Get a session by ID
 */
export function getSession(db: Database, sessionId: string): SessionRecord | null {
    const stmt = db.prepare('SELECT * FROM sessions WHERE session_id = ?');
    const row = stmt.get(sessionId) as Record<string, unknown> | undefined;

    if (!row) {
        return null;
    }

    return rowToSession(row);
}

/**
 * Get all session IDs in the database
 */
export function getAllSessionIds(db: Database): string[] {
    const stmt = db.prepare('SELECT session_id FROM sessions');
    const rows = stmt.all() as { session_id: string }[];
    return rows.map((r) => r.session_id);
}

/**
 * Check if a session exists
 */
export function sessionExists(db: Database, sessionId: string): boolean {
    const stmt = db.prepare('SELECT 1 FROM sessions WHERE session_id = ?');
    return stmt.get(sessionId) != null;
}

/**
 * Get aggregate statistics
 */
export function getAggregateStats(db: Database, projectPath?: string): AggregateStats {
    const whereClause = projectPath ? 'WHERE project_path = ?' : '';
    const stmt = db.prepare(`
        SELECT
            COUNT(*) as total_sessions,
            COALESCE(SUM(total_tokens), 0) as total_tokens,
            COALESCE(SUM(input_tokens), 0) as total_input_tokens,
            COALESCE(SUM(output_tokens), 0) as total_output_tokens,
            COALESCE(SUM(cache_creation_tokens), 0) as total_cache_creation_tokens,
            COALESCE(SUM(cache_read_tokens), 0) as total_cache_read_tokens,
            COALESCE(SUM(energy_wh), 0) as total_energy_wh,
            COALESCE(SUM(co2_grams), 0) as total_co2_grams
        FROM sessions
        ${whereClause}
    `);

    const row = (projectPath ? stmt.get(projectPath) : stmt.get()) as Record<string, unknown>;

    return {
        totalSessions: Number(row.total_sessions),
        totalTokens: Number(row.total_tokens),
        totalInputTokens: Number(row.total_input_tokens),
        totalOutputTokens: Number(row.total_output_tokens),
        totalCacheCreationTokens: Number(row.total_cache_creation_tokens),
        totalCacheReadTokens: Number(row.total_cache_read_tokens),
        totalEnergyWh: Number(row.total_energy_wh),
        totalCO2Grams: Number(row.total_co2_grams)
    };
}

/**
 * Get daily statistics for the last N days
 */
export function getDailyStats(db: Database, days: number = 7, projectPath?: string): DailyStats[] {
    const projectFilter = projectPath ? 'AND project_path = ?' : '';
    const stmt = db.prepare(`
        SELECT
            DATE(created_at) as date,
            COUNT(*) as sessions,
            SUM(total_tokens) as tokens,
            SUM(energy_wh) as energy_wh,
            SUM(co2_grams) as co2_grams
        FROM sessions
        WHERE created_at >= DATE('now', '-' || ? || ' days')
        ${projectFilter}
        GROUP BY DATE(created_at)
        ORDER BY date
    `);

    const rows = (projectPath ? stmt.all(days, projectPath) : stmt.all(days)) as Record<string, unknown>[];

    return rows.map((row) => ({
        date: row.date as string,
        sessions: Number(row.sessions),
        tokens: Number(row.tokens),
        energyWh: Number(row.energy_wh),
        co2Grams: Number(row.co2_grams)
    }));
}

/**
 * Get project statistics for the last N days
 */
export function getProjectStats(db: Database, days: number = 7): ProjectStats[] {
    const stmt = db.prepare(`
        SELECT
            project_path,
            COUNT(*) as sessions,
            SUM(total_tokens) as tokens,
            SUM(energy_wh) as energy_wh,
            SUM(co2_grams) as co2_grams
        FROM sessions
        WHERE created_at >= DATE('now', '-' || ? || ' days')
        GROUP BY project_path
        ORDER BY co2_grams DESC
    `);

    const rows = stmt.all(days) as Record<string, unknown>[];

    return rows.map((row) => ({
        projectPath: row.project_path as string,
        sessions: Number(row.sessions),
        tokens: Number(row.tokens),
        energyWh: Number(row.energy_wh),
        co2Grams: Number(row.co2_grams)
    }));
}

/**
 * Get the plugin installed-at timestamp
 */
export function getInstalledAt(db: Database): Date | null {
    const stmt = db.prepare("SELECT value FROM plugin_config WHERE key = 'installed_at'");
    const row = stmt.get() as { value: string } | undefined;
    return row ? new Date(row.value) : null;
}

/**
 * Set the plugin installed-at timestamp (only if not already set)
 */
export function setInstalledAt(db: Database): void {
    const stmt = db.prepare(
        "INSERT OR IGNORE INTO plugin_config (key, value) VALUES ('installed_at', ?)"
    );
    stmt.run(new Date().toISOString());
}

/**
 * Convert a database row to a SessionRecord
 */
function rowToSession(row: Record<string, unknown>): SessionRecord {
    return {
        sessionId: row.session_id as string,
        projectPath: row.project_path as string,
        inputTokens: Number(row.input_tokens),
        outputTokens: Number(row.output_tokens),
        cacheCreationTokens: Number(row.cache_creation_tokens),
        cacheReadTokens: Number(row.cache_read_tokens),
        totalTokens: Number(row.total_tokens),
        energyWh: Number(row.energy_wh),
        co2Grams: Number(row.co2_grams),
        primaryModel: row.primary_model as string,
        createdAt: new Date(row.created_at as string),
        updatedAt: new Date(row.updated_at as string)
    };
}

/**
 * Data Store
 *
 * SQLite-based local storage for session carbon data.
 * Database location: ~/.claude/carbon-tracker.db
 */

import { Database } from 'bun:sqlite';
import * as fs from 'fs';
import * as path from 'path';

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
    syncedAt: Date | null;
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
    unsyncedSessions: number;
    oldestUnsyncedAt: Date | null;
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
 * Auth configuration for direct Auth0 integration
 */
export interface AuthConfig {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: Date;
    refreshTokenExpiresAt: Date;
    organizationId: string | null;
    updatedAt: Date;
}

/**
 * Get the database file path
 */
export function getDatabasePath(): string {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(homeDir, '.claude', 'carbon-tracker.db');
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
 * Initialize the database schema
 */
export function initializeDatabase(db: Database): void {
    // Migrate old auth_config schema if it exists with MCP-specific columns
    try {
        const tableInfo = db.prepare('PRAGMA table_info(auth_config)').all() as { name: string }[];
        if (tableInfo.length > 0) {
            const hasOldColumn = tableInfo.some((col) => col.name === 'mcp_server_url');
            if (hasOldColumn) {
                db.exec('DROP TABLE auth_config');
            }
        }
    } catch {
        // Table doesn't exist yet, nothing to migrate
    }

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
            updated_at TEXT NOT NULL,
            synced_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_synced_at ON sessions(synced_at);
        CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
        CREATE INDEX IF NOT EXISTS idx_sessions_project_path ON sessions(project_path);

        CREATE TABLE IF NOT EXISTS auth_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            access_token TEXT NOT NULL,
            refresh_token TEXT NOT NULL,
            access_token_expires_at TEXT NOT NULL,
            refresh_token_expires_at TEXT NOT NULL,
            organization_id TEXT,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS plugin_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);
}

/**
 * Upsert a session record
 * Preserves created_at on update
 */
export function upsertSession(
    db: Database,
    session: Omit<SessionRecord, 'syncedAt'>
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
 * Get all unsynced sessions, optionally filtered to those created after a given date
 */
export function getUnsyncedSessions(db: Database, after?: Date | null): SessionRecord[] {
    if (after) {
        const stmt = db.prepare(
            'SELECT * FROM sessions WHERE (synced_at IS NULL OR synced_at < updated_at) AND created_at >= ? ORDER BY created_at'
        );
        const rows = stmt.all(after.toISOString()) as Record<string, unknown>[];
        return rows.map(rowToSession);
    }

    const stmt = db.prepare('SELECT * FROM sessions WHERE synced_at IS NULL OR synced_at < updated_at ORDER BY created_at');
    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map(rowToSession);
}

/**
 * Mark a session as synced
 */
export function markSessionSynced(db: Database, sessionId: string): void {
    const stmt = db.prepare('UPDATE sessions SET synced_at = ? WHERE session_id = ?');
    stmt.run(new Date().toISOString(), sessionId);
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
    return stmt.get(sessionId) !== undefined;
}

/**
 * Get aggregate statistics
 */
export function getAggregateStats(db: Database): AggregateStats {
    const stmt = db.prepare(`
        SELECT
            COUNT(*) as total_sessions,
            COALESCE(SUM(total_tokens), 0) as total_tokens,
            COALESCE(SUM(input_tokens), 0) as total_input_tokens,
            COALESCE(SUM(output_tokens), 0) as total_output_tokens,
            COALESCE(SUM(cache_creation_tokens), 0) as total_cache_creation_tokens,
            COALESCE(SUM(cache_read_tokens), 0) as total_cache_read_tokens,
            COALESCE(SUM(energy_wh), 0) as total_energy_wh,
            COALESCE(SUM(co2_grams), 0) as total_co2_grams,
            SUM(CASE WHEN synced_at IS NULL OR synced_at < updated_at THEN 1 ELSE 0 END) as unsynced_sessions,
            MIN(CASE WHEN synced_at IS NULL THEN updated_at WHEN synced_at < updated_at THEN synced_at END) as oldest_unsynced_at
        FROM sessions
    `);

    const row = stmt.get() as Record<string, unknown>;

    return {
        totalSessions: Number(row.total_sessions),
        totalTokens: Number(row.total_tokens),
        totalInputTokens: Number(row.total_input_tokens),
        totalOutputTokens: Number(row.total_output_tokens),
        totalCacheCreationTokens: Number(row.total_cache_creation_tokens),
        totalCacheReadTokens: Number(row.total_cache_read_tokens),
        totalEnergyWh: Number(row.total_energy_wh),
        totalCO2Grams: Number(row.total_co2_grams),
        unsyncedSessions: Number(row.unsynced_sessions),
        oldestUnsyncedAt: row.oldest_unsynced_at
            ? new Date(row.oldest_unsynced_at as string)
            : null
    };
}

/**
 * Get daily statistics for the last N days
 */
export function getDailyStats(db: Database, days: number = 7): DailyStats[] {
    const stmt = db.prepare(`
        SELECT
            DATE(created_at) as date,
            COUNT(*) as sessions,
            SUM(total_tokens) as tokens,
            SUM(energy_wh) as energy_wh,
            SUM(co2_grams) as co2_grams
        FROM sessions
        WHERE created_at >= DATE('now', '-' || ? || ' days')
        GROUP BY DATE(created_at)
        ORDER BY date
    `);

    const rows = stmt.all(days) as Record<string, unknown>[];

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
 * Save or update auth configuration (upsert with id=1)
 */
export function saveAuthConfig(db: Database, config: AuthConfig): void {
    const stmt = db.prepare(`
        INSERT INTO auth_config (
            id, access_token, refresh_token, access_token_expires_at,
            refresh_token_expires_at, organization_id, updated_at
        ) VALUES (
            1, $accessToken, $refreshToken, $accessTokenExpiresAt,
            $refreshTokenExpiresAt, $organizationId, $updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
            access_token = excluded.access_token,
            refresh_token = excluded.refresh_token,
            access_token_expires_at = excluded.access_token_expires_at,
            refresh_token_expires_at = excluded.refresh_token_expires_at,
            organization_id = excluded.organization_id,
            updated_at = excluded.updated_at
    `);

    stmt.run({
        $accessToken: config.accessToken,
        $refreshToken: config.refreshToken,
        $accessTokenExpiresAt: config.accessTokenExpiresAt.toISOString(),
        $refreshTokenExpiresAt: config.refreshTokenExpiresAt.toISOString(),
        $organizationId: config.organizationId,
        $updatedAt: config.updatedAt.toISOString()
    });
}

/**
 * Get the current auth configuration
 */
export function getAuthConfig(db: Database): AuthConfig | null {
    const stmt = db.prepare('SELECT * FROM auth_config WHERE id = 1');
    const row = stmt.get() as Record<string, unknown> | undefined;

    if (!row) {
        return null;
    }

    return {
        accessToken: row.access_token as string,
        refreshToken: row.refresh_token as string,
        accessTokenExpiresAt: new Date(row.access_token_expires_at as string),
        refreshTokenExpiresAt: new Date(row.refresh_token_expires_at as string),
        organizationId: (row.organization_id as string) || null,
        updatedAt: new Date(row.updated_at as string)
    };
}

/**
 * Update the stored organization ID
 */
export function saveOrganizationId(db: Database, organizationId: string): void {
    const stmt = db.prepare('UPDATE auth_config SET organization_id = ?, updated_at = ? WHERE id = 1');
    stmt.run(organizationId, new Date().toISOString());
}

/**
 * Update stored auth tokens (after refresh)
 */
export function updateAuthTokens(
    db: Database,
    accessToken: string,
    refreshToken: string,
    accessTokenExpiresAt: Date,
    refreshTokenExpiresAt: Date
): void {
    const stmt = db.prepare(`
        UPDATE auth_config SET
            access_token = ?,
            refresh_token = ?,
            access_token_expires_at = ?,
            refresh_token_expires_at = ?,
            updated_at = ?
        WHERE id = 1
    `);

    stmt.run(
        accessToken,
        refreshToken,
        accessTokenExpiresAt.toISOString(),
        refreshTokenExpiresAt.toISOString(),
        new Date().toISOString()
    );
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
        updatedAt: new Date(row.updated_at as string),
        syncedAt: row.synced_at ? new Date(row.synced_at as string) : null
    };
}

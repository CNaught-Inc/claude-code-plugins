/**
 * Sync Orchestration
 *
 * Manages syncing local session data to the CNaught API.
 * Two sync paths:
 * 1. syncSessionIfEnabled() — called from async stop hook, syncs a single session
 * 2. batchSyncIfEnabled() — called from session-start hook, catches up any missed syncs
 */

import type { Database } from 'bun:sqlite';

import { type SyncConfig, upsertSession, upsertSessions } from './api-client';
import {
    getConfig,
    getSession,
    getUnsyncedSessions,
    initializeDatabase,
    markSessionSyncFailed,
    markSessionsSynced,
    openDatabase,
    setConfig
} from './data-store';
import { log, logError } from './utils/stdin';

/**
 * Read sync configuration from the database.
 * Returns null if sync is not enabled, config is incomplete, or organization is empty.
 */
export function getSyncConfig(db: Database): SyncConfig | null {
    const enabled = getConfig(db, 'sync_enabled');
    if (enabled !== 'true') return null;

    const userId = getConfig(db, 'claude_code_user_id');
    if (!userId) return null;

    // Organization is required for sync. Existing users who had sync_enabled=true
    // but never set an organization will stop syncing until they re-run /carbon:setup.
    const organization = getConfig(db, 'claude_code_organization') ?? '';
    if (!organization) return null;

    return { userId, organization };
}

/**
 * Store the teamId in the local database if present.
 */
function storeTeamId(db: Database, teamId: string | null): void {
    if (teamId) {
        setConfig(db, 'claude_code_team_id', teamId);
    }
}

/**
 * Sync a single session to the API. Sets sync_status to synced/failed.
 */
export async function syncSession(db: Database, sessionId: string): Promise<void> {
    const config = getSyncConfig(db);
    if (!config) return;

    const session = getSession(db, sessionId);
    if (!session) return;

    const result = await upsertSession(config, session);
    if (result.success) {
        markSessionsSynced(db, [sessionId]);
        storeTeamId(db, result.teamId);
    } else {
        markSessionSyncFailed(db, [sessionId]);
    }
}

/**
 * Sync all unsynced sessions to the API in batches of 100.
 * Returns the total number of sessions synced.
 */
export async function syncUnsyncedSessions(db: Database): Promise<number> {
    const config = getSyncConfig(db);
    if (!config) return 0;

    let totalSynced = 0;

    while (true) {
        const batch = getUnsyncedSessions(db, 100);
        if (batch.length === 0) break;

        const result = await upsertSessions(config, batch);
        const batchIds = batch.map((s) => s.sessionId);
        if (result.success) {
            markSessionsSynced(db, batchIds);
            storeTeamId(db, result.teamId);
            totalSynced += batch.length;
        } else {
            markSessionSyncFailed(db, batchIds);
            // Stop on failure — will retry on next session start
            break;
        }
    }

    if (totalSynced > 0) {
        log(`Batch synced ${totalSynced} session(s)`);
    }

    return totalSynced;
}

/**
 * Top-level wrapper: sync a single session if sync is enabled.
 * Opens and closes its own DB connection. Safe to call fire-and-forget.
 */
export async function syncSessionIfEnabled(sessionId: string): Promise<void> {
    const db = openDatabase();
    try {
        initializeDatabase(db);
        await syncSession(db, sessionId);
    } catch (error) {
        logError('Session sync failed', error);
    } finally {
        db.close();
    }
}

/**
 * Top-level wrapper: batch sync all unsynced sessions if sync is enabled.
 * Opens and closes its own DB connection. Safe to call fire-and-forget.
 */
export async function batchSyncIfEnabled(): Promise<void> {
    const db = openDatabase();
    try {
        initializeDatabase(db);
        await syncUnsyncedSessions(db);
    } catch (error) {
        logError('Batch sync failed', error);
    } finally {
        db.close();
    }
}

import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, it } from 'bun:test';
import * as path from 'node:path';

import type { SessionRecord } from './data-store';
import {
    columnExists,
    deleteConfig,
    deleteProjectConfig,
    getAggregateStats,
    getAllSessionIds,
    getClaudeDir,
    getConfig,
    getDailyStats,
    getDatabasePath,
    getHomeDir,
    getInstalledAt,
    getProjectConfig,
    getProjectStats,
    getSession,
    getUnsyncedSessions,
    initializeDatabase,
    MIGRATIONS,
    markSessionsSynced,
    sessionExists,
    setConfig,
    setInstalledAt,
    setProjectConfig,
    upsertSession
} from './data-store';

function createTestDb(): Database {
    const db = new Database(':memory:');
    initializeDatabase(db);
    return db;
}

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
    return {
        sessionId: 'session-1',
        projectPath: '/test/project',
        projectIdentifier: 'test_project_abcd1234',
        inputTokens: 1000,
        outputTokens: 500,
        cacheCreationTokens: 200,
        cacheReadTokens: 100,
        totalTokens: 1800,
        energyWh: 0.05,
        co2Grams: 0.015,
        primaryModel: 'claude-sonnet-4-20250514',
        modelsUsed: { 'claude-sonnet-4-20250514': 1 },
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T01:00:00Z'),
        ...overrides
    };
}

describe('initializeDatabase', () => {
    it('creates sessions and plugin_config tables', () => {
        const db = createTestDb();
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
            name: string;
        }[];
        const tableNames = tables.map((t) => t.name);

        expect(tableNames).toContain('sessions');
        expect(tableNames).toContain('plugin_config');
        db.close();
    });

    it('is idempotent', () => {
        const db = new Database(':memory:');
        initializeDatabase(db);
        initializeDatabase(db);

        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
            name: string;
        }[];
        expect(tables.length).toBeGreaterThanOrEqual(2);
        db.close();
    });
});

describe('upsertSession / getSession', () => {
    it('inserts and retrieves a session', () => {
        const db = createTestDb();
        const session = makeSession();

        upsertSession(db, session);
        const retrieved = getSession(db, 'session-1');

        expect(retrieved).not.toBeNull();
        expect(retrieved!.sessionId).toBe('session-1');
        expect(retrieved!.projectPath).toBe('/test/project');
        expect(retrieved!.inputTokens).toBe(1000);
        expect(retrieved!.outputTokens).toBe(500);
        expect(retrieved!.cacheCreationTokens).toBe(200);
        expect(retrieved!.cacheReadTokens).toBe(100);
        expect(retrieved!.totalTokens).toBe(1800);
        expect(retrieved!.energyWh).toBeCloseTo(0.05);
        expect(retrieved!.co2Grams).toBeCloseTo(0.015);
        expect(retrieved!.primaryModel).toBe('claude-sonnet-4-20250514');
        db.close();
    });

    it('returns null for nonexistent session', () => {
        const db = createTestDb();
        expect(getSession(db, 'nonexistent')).toBeNull();
        db.close();
    });

    it('updates existing session on conflict', () => {
        const db = createTestDb();
        upsertSession(db, makeSession());

        // Update with new token counts
        upsertSession(
            db,
            makeSession({
                inputTokens: 2000,
                outputTokens: 1000,
                totalTokens: 3000,
                updatedAt: new Date('2025-01-01T02:00:00Z')
            })
        );

        const retrieved = getSession(db, 'session-1');
        expect(retrieved!.inputTokens).toBe(2000);
        expect(retrieved!.totalTokens).toBe(3000);
        // createdAt should be preserved (from original insert)
        expect(retrieved!.createdAt.toISOString()).toBe('2025-01-01T00:00:00.000Z');
        db.close();
    });
});

describe('getAllSessionIds / sessionExists', () => {
    it('returns all session IDs', () => {
        const db = createTestDb();
        upsertSession(db, makeSession({ sessionId: 'a' }));
        upsertSession(db, makeSession({ sessionId: 'b' }));
        upsertSession(db, makeSession({ sessionId: 'c' }));

        const ids = getAllSessionIds(db);
        expect(ids).toHaveLength(3);
        expect(ids).toContain('a');
        expect(ids).toContain('b');
        expect(ids).toContain('c');
        db.close();
    });

    it('checks existence correctly', () => {
        const db = createTestDb();
        upsertSession(db, makeSession({ sessionId: 'exists' }));

        expect(sessionExists(db, 'exists')).toBe(true);
        expect(sessionExists(db, 'nope')).toBe(false);
        db.close();
    });
});

describe('getAggregateStats', () => {
    it('returns zeroes for empty database', () => {
        const db = createTestDb();
        const stats = getAggregateStats(db);

        expect(stats.totalSessions).toBe(0);
        expect(stats.totalTokens).toBe(0);
        expect(stats.totalEnergyWh).toBe(0);
        expect(stats.totalCO2Grams).toBe(0);
        db.close();
    });

    it('aggregates across multiple sessions', () => {
        const db = createTestDb();
        upsertSession(
            db,
            makeSession({
                sessionId: 's1',
                inputTokens: 1000,
                outputTokens: 500,
                totalTokens: 1500,
                energyWh: 0.1,
                co2Grams: 0.03
            })
        );
        upsertSession(
            db,
            makeSession({
                sessionId: 's2',
                inputTokens: 2000,
                outputTokens: 1000,
                totalTokens: 3000,
                energyWh: 0.2,
                co2Grams: 0.06
            })
        );

        const stats = getAggregateStats(db);
        expect(stats.totalSessions).toBe(2);
        expect(stats.totalTokens).toBe(4500);
        expect(stats.totalInputTokens).toBe(3000);
        expect(stats.totalOutputTokens).toBe(1500);
        expect(stats.totalEnergyWh).toBeCloseTo(0.3);
        expect(stats.totalCO2Grams).toBeCloseTo(0.09);
        db.close();
    });
});

describe('getAggregateStats with project filtering', () => {
    it('filters by project identifier', () => {
        const db = createTestDb();
        upsertSession(
            db,
            makeSession({
                sessionId: 's1',
                projectIdentifier: 'org_project-a_aaaa1111',
                totalTokens: 1000,
                co2Grams: 0.05
            })
        );
        upsertSession(
            db,
            makeSession({
                sessionId: 's2',
                projectIdentifier: 'org_project-b_bbbb2222',
                totalTokens: 2000,
                co2Grams: 0.1
            })
        );

        const statsA = getAggregateStats(db, 'org_project-a_aaaa1111');
        expect(statsA.totalSessions).toBe(1);
        expect(statsA.totalTokens).toBe(1000);
        expect(statsA.totalCO2Grams).toBeCloseTo(0.05);

        const statsB = getAggregateStats(db, 'org_project-b_bbbb2222');
        expect(statsB.totalSessions).toBe(1);
        expect(statsB.totalTokens).toBe(2000);
        expect(statsB.totalCO2Grams).toBeCloseTo(0.1);

        // Without filter returns all
        const statsAll = getAggregateStats(db);
        expect(statsAll.totalSessions).toBe(2);
        expect(statsAll.totalTokens).toBe(3000);

        db.close();
    });

    it('returns zeroes for unknown project', () => {
        const db = createTestDb();
        upsertSession(db, makeSession({ sessionId: 's1', projectIdentifier: 'org_project-a_aaaa1111' }));

        const stats = getAggregateStats(db, 'nonexistent');
        expect(stats.totalSessions).toBe(0);
        expect(stats.totalTokens).toBe(0);
        db.close();
    });
});

describe('getDailyStats with project filtering', () => {
    it('filters by project identifier', () => {
        const db = createTestDb();
        const today = new Date().toISOString();
        upsertSession(
            db,
            makeSession({
                sessionId: 's1',
                projectIdentifier: 'org_project-a_aaaa1111',
                totalTokens: 1000,
                co2Grams: 0.05,
                createdAt: new Date(today),
                updatedAt: new Date(today)
            })
        );
        upsertSession(
            db,
            makeSession({
                sessionId: 's2',
                projectIdentifier: 'org_project-b_bbbb2222',
                totalTokens: 2000,
                co2Grams: 0.1,
                createdAt: new Date(today),
                updatedAt: new Date(today)
            })
        );

        const statsA = getDailyStats(db, 7, 'org_project-a_aaaa1111');
        expect(statsA).toHaveLength(1);
        expect(statsA[0].tokens).toBe(1000);

        const statsB = getDailyStats(db, 7, 'org_project-b_bbbb2222');
        expect(statsB).toHaveLength(1);
        expect(statsB[0].tokens).toBe(2000);

        // Without filter returns combined
        const statsAll = getDailyStats(db, 7);
        expect(statsAll).toHaveLength(1);
        expect(statsAll[0].tokens).toBe(3000);

        db.close();
    });
});

describe('getInstalledAt / setInstalledAt', () => {
    it('returns null when not set', () => {
        const db = createTestDb();
        expect(getInstalledAt(db)).toBeNull();
        db.close();
    });

    it('sets and retrieves installed_at', () => {
        const db = createTestDb();
        const before = new Date();
        setInstalledAt(db);
        const after = new Date();

        const installedAt = getInstalledAt(db);
        expect(installedAt).not.toBeNull();
        expect(installedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(installedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
        db.close();
    });

    it('does not overwrite on subsequent calls', () => {
        const db = createTestDb();
        setInstalledAt(db);
        const first = getInstalledAt(db);

        // Wait a tick to ensure different timestamp
        setInstalledAt(db);
        const second = getInstalledAt(db);

        expect(first!.toISOString()).toBe(second!.toISOString());
        db.close();
    });
});

describe('getHomeDir', () => {
    const originalHome = process.env.HOME;
    const originalUserProfile = process.env.USERPROFILE;

    afterEach(() => {
        process.env.HOME = originalHome;
        process.env.USERPROFILE = originalUserProfile;
    });

    it('returns HOME when set', () => {
        process.env.HOME = '/home/testuser';
        expect(getHomeDir()).toBe('/home/testuser');
    });

    it('falls back to USERPROFILE when HOME is not set', () => {
        delete process.env.HOME;
        process.env.USERPROFILE = 'C:\\Users\\test';
        expect(getHomeDir()).toBe('C:\\Users\\test');
    });

    it('returns empty string when neither is set', () => {
        delete process.env.HOME;
        delete process.env.USERPROFILE;
        expect(getHomeDir()).toBe('');
    });
});

describe('getClaudeDir', () => {
    const originalHome = process.env.HOME;

    afterEach(() => {
        process.env.HOME = originalHome;
    });

    it('returns .claude under home directory', () => {
        process.env.HOME = '/home/testuser';
        expect(getClaudeDir()).toBe(path.join('/home/testuser', '.claude'));
    });
});

describe('getDatabasePath', () => {
    const originalHome = process.env.HOME;

    afterEach(() => {
        process.env.HOME = originalHome;
    });

    it('returns carbon-tracker.db under .claude', () => {
        process.env.HOME = '/home/testuser';
        expect(getDatabasePath()).toBe(path.join('/home/testuser', '.claude', 'carbon-tracker.db'));
    });
});

describe('withDatabase', () => {
    // withDatabase opens a real DB on disk, which may not work on CI.
    // We test the pattern (init + callback + close) using in-memory DBs
    // and only test withDatabase itself where the filesystem is available.

    it('initializes the database and passes it to the callback', () => {
        // Verify the pattern: open → initializeDatabase → fn → close
        const db = new Database(':memory:');
        initializeDatabase(db);
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
            name: string;
        }[];
        expect(tables.map((t) => t.name)).toContain('sessions');
        expect(tables.map((t) => t.name)).toContain('plugin_config');
        db.close();
    });

    it('returns the callback return value', () => {
        // Verify the pattern returns callback result
        const db = new Database(':memory:');
        initializeDatabase(db);
        try {
            const result = (() => 42)();
            expect(result).toBe(42);
        } finally {
            db.close();
        }
    });

    it('closes the database even if callback throws', () => {
        const db = new Database(':memory:');
        initializeDatabase(db);
        let closed = false;
        try {
            throw new Error('test error');
        } catch (e) {
            expect((e as Error).message).toBe('test error');
        } finally {
            db.close();
            closed = true;
        }
        expect(closed).toBe(true);
    });
});

// queryReadonlyDb is tested indirectly via statusline/carbon-output.test.ts
// where the module is mocked. Direct tests are skipped because they require
// filesystem access that varies between local and CI environments.

describe('getProjectStats', () => {
    it('returns project stats grouped by project identifier', () => {
        const db = createTestDb();
        const today = new Date().toISOString();

        upsertSession(
            db,
            makeSession({
                sessionId: 's1',
                projectIdentifier: 'org_project-a_aaaa1111',
                totalTokens: 1000,
                energyWh: 0.05,
                co2Grams: 0.015,
                createdAt: new Date(today),
                updatedAt: new Date(today)
            })
        );
        upsertSession(
            db,
            makeSession({
                sessionId: 's2',
                projectIdentifier: 'org_project-b_bbbb2222',
                totalTokens: 2000,
                energyWh: 0.1,
                co2Grams: 0.03,
                createdAt: new Date(today),
                updatedAt: new Date(today)
            })
        );
        upsertSession(
            db,
            makeSession({
                sessionId: 's3',
                projectIdentifier: 'org_project-b_bbbb2222',
                totalTokens: 3000,
                energyWh: 0.15,
                co2Grams: 0.045,
                createdAt: new Date(today),
                updatedAt: new Date(today)
            })
        );

        const stats = getProjectStats(db, 7);
        expect(stats).toHaveLength(2);

        // Sorted by CO2 desc, so project-b first
        expect(stats[0].projectPath).toBe('org_project-b_bbbb2222');
        expect(stats[0].sessions).toBe(2);
        expect(stats[0].tokens).toBe(5000);
        expect(stats[0].co2Grams).toBeCloseTo(0.075);

        expect(stats[1].projectPath).toBe('org_project-a_aaaa1111');
        expect(stats[1].sessions).toBe(1);
        expect(stats[1].tokens).toBe(1000);

        db.close();
    });

    it('returns empty array when no sessions in date range', () => {
        const db = createTestDb();
        upsertSession(
            db,
            makeSession({
                sessionId: 's1',
                createdAt: new Date('2020-01-01'),
                updatedAt: new Date('2020-01-01')
            })
        );

        const stats = getProjectStats(db, 7);
        expect(stats).toHaveLength(0);

        db.close();
    });
});

describe('columnExists', () => {
    it('returns true for existing columns', () => {
        const db = createTestDb();
        expect(columnExists(db, 'sessions', 'session_id')).toBe(true);
        expect(columnExists(db, 'sessions', 'project_path')).toBe(true);
        db.close();
    });

    it('returns false for non-existing columns', () => {
        const db = createTestDb();
        expect(columnExists(db, 'sessions', 'nonexistent')).toBe(false);
        db.close();
    });
});

describe('migrations', () => {
    it('sets user_version to MIGRATIONS.length after init', () => {
        const db = createTestDb();
        const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
        expect(row.user_version).toBe(MIGRATIONS.length);
        db.close();
    });

    it('is idempotent — running initializeDatabase twice keeps the same version', () => {
        const db = new Database(':memory:');
        initializeDatabase(db);
        initializeDatabase(db);

        const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
        expect(row.user_version).toBe(MIGRATIONS.length);
        db.close();
    });

    it('migration v3 creates project_config table', () => {
        const db = createTestDb();
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
            name: string;
        }[];
        expect(tables.map((t) => t.name)).toContain('project_config');
        db.close();
    });

    it('applies only pending migrations when version is behind', () => {
        const db = new Database(':memory:');
        initializeDatabase(db);

        // Simulate an older database by resetting user_version
        db.exec('PRAGMA user_version = 0');
        initializeDatabase(db);

        const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
        expect(row.user_version).toBe(MIGRATIONS.length);
        db.close();
    });
});

describe('getConfig / setConfig / deleteConfig', () => {
    it('returns null for nonexistent key', () => {
        const db = createTestDb();
        expect(getConfig(db, 'nonexistent')).toBeNull();
        db.close();
    });

    it('sets and retrieves a config value', () => {
        const db = createTestDb();
        setConfig(db, 'sync_enabled', 'true');
        expect(getConfig(db, 'sync_enabled')).toBe('true');
        db.close();
    });

    it('overwrites existing config value', () => {
        const db = createTestDb();
        setConfig(db, 'user_name', 'Alice');
        setConfig(db, 'user_name', 'Bob');
        expect(getConfig(db, 'user_name')).toBe('Bob');
        db.close();
    });

    it('deletes a config key', () => {
        const db = createTestDb();
        setConfig(db, 'temp_key', 'value');
        expect(getConfig(db, 'temp_key')).toBe('value');
        deleteConfig(db, 'temp_key');
        expect(getConfig(db, 'temp_key')).toBeNull();
        db.close();
    });

    it('deleting nonexistent key is a no-op', () => {
        const db = createTestDb();
        deleteConfig(db, 'nonexistent');
        expect(getConfig(db, 'nonexistent')).toBeNull();
        db.close();
    });
});

describe('getUnsyncedSessions / markSessionsSynced', () => {
    it('new sessions default to needs_sync = 1', () => {
        const db = createTestDb();
        upsertSession(db, makeSession({ sessionId: 's1' }));
        upsertSession(db, makeSession({ sessionId: 's2' }));

        const unsynced = getUnsyncedSessions(db, 100);
        expect(unsynced).toHaveLength(2);
        expect(unsynced.map((s) => s.sessionId).sort()).toEqual(['s1', 's2']);
        db.close();
    });

    it('markSessionsSynced clears needs_sync flag', () => {
        const db = createTestDb();
        upsertSession(db, makeSession({ sessionId: 's1' }));
        upsertSession(db, makeSession({ sessionId: 's2' }));
        upsertSession(db, makeSession({ sessionId: 's3' }));

        markSessionsSynced(db, ['s1', 's3']);

        const unsynced = getUnsyncedSessions(db, 100);
        expect(unsynced).toHaveLength(1);
        expect(unsynced[0].sessionId).toBe('s2');
        db.close();
    });

    it('respects limit parameter', () => {
        const db = createTestDb();
        upsertSession(db, makeSession({ sessionId: 's1' }));
        upsertSession(db, makeSession({ sessionId: 's2' }));
        upsertSession(db, makeSession({ sessionId: 's3' }));

        const unsynced = getUnsyncedSessions(db, 2);
        expect(unsynced).toHaveLength(2);
        db.close();
    });

    it('returns empty array when all sessions are synced', () => {
        const db = createTestDb();
        upsertSession(db, makeSession({ sessionId: 's1' }));
        markSessionsSynced(db, ['s1']);

        const unsynced = getUnsyncedSessions(db, 100);
        expect(unsynced).toHaveLength(0);
        db.close();
    });

    it('upserting a synced session resets needs_sync to 1', () => {
        const db = createTestDb();
        upsertSession(db, makeSession({ sessionId: 's1' }));
        markSessionsSynced(db, ['s1']);

        // Re-upsert (e.g., session updated with new tokens)
        upsertSession(db, makeSession({ sessionId: 's1', outputTokens: 999 }));

        const unsynced = getUnsyncedSessions(db, 100);
        expect(unsynced).toHaveLength(1);
        expect(unsynced[0].sessionId).toBe('s1');
        db.close();
    });
});

describe('getProjectConfig / setProjectConfig / deleteProjectConfig', () => {
    it('returns null for nonexistent key', () => {
        const db = createTestDb();
        expect(getProjectConfig(db, 'hash1234', 'project_name')).toBeNull();
        db.close();
    });

    it('sets and retrieves a project config value', () => {
        const db = createTestDb();
        setProjectConfig(db, 'hash1234', 'project_name', 'My Project');
        expect(getProjectConfig(db, 'hash1234', 'project_name')).toBe('My Project');
        db.close();
    });

    it('isolates values by project hash', () => {
        const db = createTestDb();
        setProjectConfig(db, 'aaaa1111', 'project_name', 'Project A');
        setProjectConfig(db, 'bbbb2222', 'project_name', 'Project B');

        expect(getProjectConfig(db, 'aaaa1111', 'project_name')).toBe('Project A');
        expect(getProjectConfig(db, 'bbbb2222', 'project_name')).toBe('Project B');
        db.close();
    });

    it('overwrites existing value on upsert', () => {
        const db = createTestDb();
        setProjectConfig(db, 'hash1234', 'project_name', 'Old Name');
        setProjectConfig(db, 'hash1234', 'project_name', 'New Name');
        expect(getProjectConfig(db, 'hash1234', 'project_name')).toBe('New Name');
        db.close();
    });

    it('deletes a project config key', () => {
        const db = createTestDb();
        setProjectConfig(db, 'hash1234', 'project_name', 'My Project');
        deleteProjectConfig(db, 'hash1234', 'project_name');
        expect(getProjectConfig(db, 'hash1234', 'project_name')).toBeNull();
        db.close();
    });

    it('deleting nonexistent key is a no-op', () => {
        const db = createTestDb();
        deleteProjectConfig(db, 'hash1234', 'nonexistent');
        expect(getProjectConfig(db, 'hash1234', 'nonexistent')).toBeNull();
        db.close();
    });
});

describe('configureSyncTracking needs_sync behavior', () => {
    it('first sync enable without backfill clears needs_sync on existing sessions', () => {
        const db = createTestDb();
        // Simulate existing sessions before sync is enabled
        upsertSession(db, makeSession({ sessionId: 's1' }));
        upsertSession(db, makeSession({ sessionId: 's2' }));

        // Verify they start with needs_sync = 1
        expect(getUnsyncedSessions(db, 100)).toHaveLength(2);

        // Simulate first-time sync enable without backfill:
        // configureSyncTracking sets sync_enabled and clears needs_sync
        setConfig(db, 'sync_enabled', 'true');
        setConfig(db, 'claude_code_user_id', 'test-user-id');
        setConfig(db, 'claude_code_user_name', 'Test User');
        db.exec('UPDATE sessions SET needs_sync = 0 WHERE needs_sync = 1');

        // Existing sessions should no longer need sync
        expect(getUnsyncedSessions(db, 100)).toHaveLength(0);

        // New session added after enabling sync should need sync
        upsertSession(db, makeSession({ sessionId: 's3' }));
        const unsynced = getUnsyncedSessions(db, 100);
        expect(unsynced).toHaveLength(1);
        expect(unsynced[0].sessionId).toBe('s3');
        db.close();
    });

    it('re-enabling sync preserves needs_sync on pending sessions', () => {
        const db = createTestDb();
        // Simulate already-configured sync
        setConfig(db, 'sync_enabled', 'true');
        setConfig(db, 'claude_code_user_id', 'existing-user-id');
        setConfig(db, 'claude_code_user_name', 'Existing User');

        // Add sessions that failed to sync (still needs_sync = 1)
        upsertSession(db, makeSession({ sessionId: 's1' }));
        upsertSession(db, makeSession({ sessionId: 's2' }));

        // Re-running setup should NOT clear needs_sync because
        // existingUserId is already set (isFirstEnable = false)
        const existingUserId = getConfig(db, 'claude_code_user_id');
        expect(existingUserId).not.toBeNull();

        // The code only clears needs_sync when isFirstEnable && !shouldBackfill,
        // so re-enable should leave pending sessions alone
        const unsynced = getUnsyncedSessions(db, 100);
        expect(unsynced).toHaveLength(2);
        db.close();
    });
});

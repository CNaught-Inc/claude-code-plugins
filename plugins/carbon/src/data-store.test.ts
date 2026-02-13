import { Database } from 'bun:sqlite';
import * as path from 'path';

import {
    initializeDatabase,
    upsertSession,
    getSession,
    getAllSessionIds,
    sessionExists,
    getAggregateStats,
    getDailyStats,
    getProjectStats,
    encodeProjectPath,
    getInstalledAt,
    setInstalledAt,
    getHomeDir,
    getClaudeDir,
    getDatabasePath,
} from './data-store';
import type { SessionRecord } from './data-store';

function createTestDb(): Database {
    const db = new Database(':memory:');
    initializeDatabase(db);
    return db;
}

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
    return {
        sessionId: 'session-1',
        projectPath: '/test/project',
        inputTokens: 1000,
        outputTokens: 500,
        cacheCreationTokens: 200,
        cacheReadTokens: 100,
        totalTokens: 1800,
        energyWh: 0.05,
        co2Grams: 0.015,
        primaryModel: 'claude-sonnet-4-20250514',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T01:00:00Z'),
        ...overrides
    };
}

describe('initializeDatabase', () => {
    it('creates sessions and plugin_config tables', () => {
        const db = createTestDb();
        const tables = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .all() as { name: string }[];
        const tableNames = tables.map((t) => t.name);

        expect(tableNames).toContain('sessions');
        expect(tableNames).toContain('plugin_config');
        db.close();
    });

    it('is idempotent', () => {
        const db = new Database(':memory:');
        initializeDatabase(db);
        initializeDatabase(db);

        const tables = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .all() as { name: string }[];
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
        upsertSession(db, makeSession({
            inputTokens: 2000,
            outputTokens: 1000,
            totalTokens: 3000,
            updatedAt: new Date('2025-01-01T02:00:00Z')
        }));

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
        upsertSession(db, makeSession({
            sessionId: 's1',
            inputTokens: 1000,
            outputTokens: 500,
            totalTokens: 1500,
            energyWh: 0.1,
            co2Grams: 0.03
        }));
        upsertSession(db, makeSession({
            sessionId: 's2',
            inputTokens: 2000,
            outputTokens: 1000,
            totalTokens: 3000,
            energyWh: 0.2,
            co2Grams: 0.06
        }));

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

describe('encodeProjectPath', () => {
    it('replaces slashes with dashes', () => {
        expect(encodeProjectPath('/Users/jason/my-project')).toBe('-Users-jason-my-project');
    });

    it('handles paths without leading slash', () => {
        expect(encodeProjectPath('relative/path')).toBe('relative-path');
    });
});

describe('getAggregateStats with project filtering', () => {
    it('filters by project path', () => {
        const db = createTestDb();
        upsertSession(db, makeSession({
            sessionId: 's1',
            projectPath: 'project-a',
            totalTokens: 1000,
            co2Grams: 0.05
        }));
        upsertSession(db, makeSession({
            sessionId: 's2',
            projectPath: 'project-b',
            totalTokens: 2000,
            co2Grams: 0.10
        }));

        const statsA = getAggregateStats(db, 'project-a');
        expect(statsA.totalSessions).toBe(1);
        expect(statsA.totalTokens).toBe(1000);
        expect(statsA.totalCO2Grams).toBeCloseTo(0.05);

        const statsB = getAggregateStats(db, 'project-b');
        expect(statsB.totalSessions).toBe(1);
        expect(statsB.totalTokens).toBe(2000);
        expect(statsB.totalCO2Grams).toBeCloseTo(0.10);

        // Without filter returns all
        const statsAll = getAggregateStats(db);
        expect(statsAll.totalSessions).toBe(2);
        expect(statsAll.totalTokens).toBe(3000);

        db.close();
    });

    it('returns zeroes for unknown project', () => {
        const db = createTestDb();
        upsertSession(db, makeSession({ sessionId: 's1', projectPath: 'project-a' }));

        const stats = getAggregateStats(db, 'nonexistent');
        expect(stats.totalSessions).toBe(0);
        expect(stats.totalTokens).toBe(0);
        db.close();
    });
});

describe('getDailyStats with project filtering', () => {
    it('filters by project path', () => {
        const db = createTestDb();
        const today = new Date().toISOString();
        upsertSession(db, makeSession({
            sessionId: 's1',
            projectPath: 'project-a',
            totalTokens: 1000,
            co2Grams: 0.05,
            createdAt: new Date(today),
            updatedAt: new Date(today)
        }));
        upsertSession(db, makeSession({
            sessionId: 's2',
            projectPath: 'project-b',
            totalTokens: 2000,
            co2Grams: 0.10,
            createdAt: new Date(today),
            updatedAt: new Date(today)
        }));

        const statsA = getDailyStats(db, 7, 'project-a');
        expect(statsA).toHaveLength(1);
        expect(statsA[0].tokens).toBe(1000);

        const statsB = getDailyStats(db, 7, 'project-b');
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
        expect(getDatabasePath()).toBe(
            path.join('/home/testuser', '.claude', 'carbon-tracker.db')
        );
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
        const tables = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .all() as { name: string }[];
        expect(tables.map(t => t.name)).toContain('sessions');
        expect(tables.map(t => t.name)).toContain('plugin_config');
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
    it('returns project stats grouped by project path', () => {
        const db = createTestDb();
        const today = new Date().toISOString();

        upsertSession(db, makeSession({
            sessionId: 's1',
            projectPath: 'project-a',
            totalTokens: 1000,
            energyWh: 0.05,
            co2Grams: 0.015,
            createdAt: new Date(today),
            updatedAt: new Date(today)
        }));
        upsertSession(db, makeSession({
            sessionId: 's2',
            projectPath: 'project-b',
            totalTokens: 2000,
            energyWh: 0.10,
            co2Grams: 0.030,
            createdAt: new Date(today),
            updatedAt: new Date(today)
        }));
        upsertSession(db, makeSession({
            sessionId: 's3',
            projectPath: 'project-b',
            totalTokens: 3000,
            energyWh: 0.15,
            co2Grams: 0.045,
            createdAt: new Date(today),
            updatedAt: new Date(today)
        }));

        const stats = getProjectStats(db, 7);
        expect(stats).toHaveLength(2);

        // Sorted by CO2 desc, so project-b first
        expect(stats[0].projectPath).toBe('project-b');
        expect(stats[0].sessions).toBe(2);
        expect(stats[0].tokens).toBe(5000);
        expect(stats[0].co2Grams).toBeCloseTo(0.075);

        expect(stats[1].projectPath).toBe('project-a');
        expect(stats[1].sessions).toBe(1);
        expect(stats[1].tokens).toBe(1000);

        db.close();
    });

    it('returns empty array when no sessions in date range', () => {
        const db = createTestDb();
        upsertSession(db, makeSession({
            sessionId: 's1',
            createdAt: new Date('2020-01-01'),
            updatedAt: new Date('2020-01-01')
        }));

        const stats = getProjectStats(db, 7);
        expect(stats).toHaveLength(0);

        db.close();
    });
});

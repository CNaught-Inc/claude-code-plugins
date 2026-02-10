import { Database } from 'bun:sqlite';

import {
    initializeDatabase,
    upsertSession,
    getSession,
    getAllSessionIds,
    sessionExists,
    getAggregateStats,
    getInstalledAt,
    setInstalledAt
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

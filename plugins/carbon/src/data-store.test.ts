import { Database } from 'bun:sqlite';

import {
    initializeDatabase,
    upsertSession,
    getSession,
    getUnsyncedSessions,
    markSessionSynced,
    getAllSessionIds,
    sessionExists,
    getAggregateStats,
    saveAuthConfig,
    getAuthConfig,
    updateAuthTokens,
    saveOrganizationId,
    getInstalledAt,
    setInstalledAt
} from './data-store';
import type { AuthConfig, SessionRecord } from './data-store';

function createTestDb(): Database {
    const db = new Database(':memory:');
    initializeDatabase(db);
    return db;
}

function makeSession(overrides: Partial<Omit<SessionRecord, 'syncedAt'>> = {}): Omit<SessionRecord, 'syncedAt'> {
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

function makeAuthConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
    return {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
        accessTokenExpiresAt: new Date('2025-12-31T00:00:00Z'),
        refreshTokenExpiresAt: new Date('2026-01-30T00:00:00Z'),
        organizationId: null,
        updatedAt: new Date('2025-01-01T00:00:00Z'),
        ...overrides
    };
}

describe('initializeDatabase', () => {
    it('creates sessions and auth_config tables', () => {
        const db = createTestDb();
        const tables = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .all() as { name: string }[];
        const tableNames = tables.map((t) => t.name);

        expect(tableNames).toContain('sessions');
        expect(tableNames).toContain('auth_config');
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

    it('drops old auth_config table with mcp_server_url column', () => {
        const db = new Database(':memory:');
        // Create old-style table with mcp_server_url
        db.exec(`
            CREATE TABLE auth_config (
                id INTEGER PRIMARY KEY,
                mcp_server_url TEXT,
                access_token TEXT NOT NULL,
                refresh_token TEXT NOT NULL,
                access_token_expires_at TEXT NOT NULL,
                refresh_token_expires_at TEXT NOT NULL,
                organization_id TEXT,
                updated_at TEXT NOT NULL
            )
        `);
        db.prepare(
            "INSERT INTO auth_config (id, mcp_server_url, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at, updated_at) VALUES (1, 'http://old', 'tok', 'ref', '2025-01-01', '2025-02-01', '2025-01-01')"
        ).run();

        // initializeDatabase should drop and recreate without mcp_server_url
        initializeDatabase(db);

        const cols = db.prepare('PRAGMA table_info(auth_config)').all() as { name: string }[];
        const colNames = cols.map((c) => c.name);
        expect(colNames).not.toContain('mcp_server_url');
        expect(colNames).toContain('access_token');
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
        expect(retrieved!.syncedAt).toBeNull();
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

describe('getUnsyncedSessions', () => {
    it('returns sessions with null synced_at', () => {
        const db = createTestDb();
        upsertSession(db, makeSession({ sessionId: 's1' }));
        upsertSession(db, makeSession({ sessionId: 's2' }));

        const unsynced = getUnsyncedSessions(db);
        expect(unsynced).toHaveLength(2);
        db.close();
    });

    it('filters by after date', () => {
        const db = createTestDb();
        upsertSession(db, makeSession({
            sessionId: 'old',
            createdAt: new Date('2024-01-01T00:00:00Z')
        }));
        upsertSession(db, makeSession({
            sessionId: 'new',
            createdAt: new Date('2025-06-01T00:00:00Z')
        }));

        const cutoff = new Date('2025-01-01T00:00:00Z');
        const unsynced = getUnsyncedSessions(db, cutoff);
        expect(unsynced).toHaveLength(1);
        expect(unsynced[0].sessionId).toBe('new');
        db.close();
    });

    it('returns all when after is null', () => {
        const db = createTestDb();
        upsertSession(db, makeSession({
            sessionId: 'old',
            createdAt: new Date('2024-01-01T00:00:00Z')
        }));
        upsertSession(db, makeSession({
            sessionId: 'new',
            createdAt: new Date('2025-06-01T00:00:00Z')
        }));

        const unsynced = getUnsyncedSessions(db, null);
        expect(unsynced).toHaveLength(2);
        db.close();
    });

    it('returns sessions updated after sync', () => {
        const db = createTestDb();
        upsertSession(db, makeSession({ sessionId: 's1' }));
        markSessionSynced(db, 's1');

        // Update the session after syncing
        upsertSession(db, makeSession({
            sessionId: 's1',
            inputTokens: 5000,
            updatedAt: new Date('2099-01-01T00:00:00Z')
        }));

        const unsynced = getUnsyncedSessions(db);
        expect(unsynced).toHaveLength(1);
        expect(unsynced[0].sessionId).toBe('s1');
        db.close();
    });
});

describe('markSessionSynced', () => {
    it('marks a session as synced', () => {
        const db = createTestDb();
        upsertSession(db, makeSession());
        markSessionSynced(db, 'session-1');

        const session = getSession(db, 'session-1');
        expect(session!.syncedAt).not.toBeNull();
        db.close();
    });

    it('excludes synced sessions from unsynced list', () => {
        const db = createTestDb();
        upsertSession(db, makeSession({ sessionId: 's1' }));
        upsertSession(db, makeSession({ sessionId: 's2' }));
        markSessionSynced(db, 's1');

        const unsynced = getUnsyncedSessions(db);
        expect(unsynced).toHaveLength(1);
        expect(unsynced[0].sessionId).toBe('s2');
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
        expect(stats.unsyncedSessions).toBe(0);
        expect(stats.oldestUnsyncedAt).toBeNull();
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
        expect(stats.unsyncedSessions).toBe(2);
        db.close();
    });
});

describe('saveAuthConfig / getAuthConfig', () => {
    it('saves and retrieves auth config', () => {
        const db = createTestDb();
        const config = makeAuthConfig();

        saveAuthConfig(db, config);
        const retrieved = getAuthConfig(db);

        expect(retrieved).not.toBeNull();
        expect(retrieved!.accessToken).toBe('access-token-123');
        expect(retrieved!.refreshToken).toBe('refresh-token-456');
        expect(retrieved!.organizationId).toBeNull();
        db.close();
    });

    it('returns null when no auth config exists', () => {
        const db = createTestDb();
        expect(getAuthConfig(db)).toBeNull();
        db.close();
    });

    it('upserts on save (replaces existing)', () => {
        const db = createTestDb();
        saveAuthConfig(db, makeAuthConfig());
        saveAuthConfig(db, makeAuthConfig({ accessToken: 'new-token' }));

        const retrieved = getAuthConfig(db);
        expect(retrieved!.accessToken).toBe('new-token');
        db.close();
    });
});

describe('updateAuthTokens', () => {
    it('updates access and refresh tokens', () => {
        const db = createTestDb();
        saveAuthConfig(db, makeAuthConfig());

        const newExpiry = new Date('2026-06-01T00:00:00Z');
        const newRefreshExpiry = new Date('2026-07-01T00:00:00Z');
        updateAuthTokens(db, 'new-access', 'new-refresh', newExpiry, newRefreshExpiry);

        const retrieved = getAuthConfig(db);
        expect(retrieved!.accessToken).toBe('new-access');
        expect(retrieved!.refreshToken).toBe('new-refresh');
        expect(retrieved!.accessTokenExpiresAt.toISOString()).toBe(newExpiry.toISOString());
        expect(retrieved!.refreshTokenExpiresAt.toISOString()).toBe(newRefreshExpiry.toISOString());
        db.close();
    });
});

describe('saveOrganizationId', () => {
    it('updates organization ID', () => {
        const db = createTestDb();
        saveAuthConfig(db, makeAuthConfig());

        saveOrganizationId(db, 'org-789');

        const retrieved = getAuthConfig(db);
        expect(retrieved!.organizationId).toBe('org-789');
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

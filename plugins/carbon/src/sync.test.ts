import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, it } from 'bun:test';

import { getConfig, initializeDatabase, setConfig } from './data-store';
import { ensureUserName, getSyncConfig } from './sync';

function createTestDb(): Database {
    const db = new Database(':memory:');
    initializeDatabase(db);
    return db;
}

function setupSyncConfig(
    db: Database,
    overrides: { userId?: string; team?: string; userName?: string } = {}
): void {
    setConfig(db, 'sync_enabled', 'true');
    setConfig(db, 'claude_code_user_id', overrides.userId ?? 'test-user-id');
    setConfig(db, 'claude_code_team', overrides.team ?? 'Test Team');
    if (overrides.userName !== undefined) {
        setConfig(db, 'claude_code_user_name', overrides.userName);
    }
}

describe('getSyncConfig', () => {
    let db: Database;

    afterEach(() => {
        db?.close();
    });

    it('returns null when sync is not enabled', () => {
        db = createTestDb();
        expect(getSyncConfig(db)).toBeNull();
    });

    it('returns null when userId is missing', () => {
        db = createTestDb();
        setConfig(db, 'sync_enabled', 'true');
        expect(getSyncConfig(db)).toBeNull();
    });

    it('returns null when team is missing', () => {
        db = createTestDb();
        setConfig(db, 'sync_enabled', 'true');
        setConfig(db, 'claude_code_user_id', 'test-id');
        expect(getSyncConfig(db)).toBeNull();
    });

    it('returns config with all fields when fully configured', () => {
        db = createTestDb();
        setupSyncConfig(db, { userName: 'bright-falcon' });

        const config = getSyncConfig(db);
        expect(config).toEqual({
            userId: 'test-user-id',
            userName: 'bright-falcon',
            team: 'Test Team'
        });
    });

    it('returns null when userName is missing', () => {
        db = createTestDb();
        setupSyncConfig(db);

        expect(getSyncConfig(db)).toBeNull();

        // Verify no side effect — userName should still be absent in DB
        expect(getConfig(db, 'claude_code_user_name')).toBeNull();
    });
});

describe('ensureUserName', () => {
    let db: Database;

    afterEach(() => {
        db?.close();
    });

    it('generates and persists a userName when missing', () => {
        db = createTestDb();

        expect(getConfig(db, 'claude_code_user_name')).toBeNull();

        ensureUserName(db);

        const userName = getConfig(db, 'claude_code_user_name');
        expect(userName).not.toBeNull();
        expect(userName?.length).toBeGreaterThan(0);
        expect(userName).toContain(' '); // "Adjective Animal" format
    });

    it('does not overwrite an existing userName', () => {
        db = createTestDb();
        setConfig(db, 'claude_code_user_name', 'bright-falcon');

        ensureUserName(db);

        expect(getConfig(db, 'claude_code_user_name')).toBe('bright-falcon');
    });

    it('persists the same name across subsequent calls', () => {
        db = createTestDb();

        ensureUserName(db);
        const first = getConfig(db, 'claude_code_user_name');

        ensureUserName(db);
        const second = getConfig(db, 'claude_code_user_name');

        expect(first).toBe(second);
    });
});

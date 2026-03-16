/**
 * Carbonlog Uninstall Script
 *
 * Removes all carbonlog tracking data and wipes the database.
 * Statusline and settings cleanup is handled by the uninstall command (uninstall.md).
 *
 * Usage:
 *   carbonlog-uninstall.ts
 */

import '../utils/load-env';

import * as fs from 'node:fs';

import { deleteConfig, getDatabasePath, initializeDatabase, openDatabase } from '../data-store';

function deleteAllSessions(): number {
    const dbPath = getDatabasePath();
    if (!fs.existsSync(dbPath)) {
        return 0;
    }

    const db = openDatabase();
    try {
        initializeDatabase(db);
        const countRow = db.prepare('SELECT COUNT(*) as count FROM sessions').get() as {
            count: number;
        };
        const total = countRow.count;
        db.prepare('DELETE FROM sessions').run();
        return total;
    } finally {
        db.close();
    }
}

function deleteDatabase(): void {
    const dbPath = getDatabasePath();

    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        console.log(`  Deleted database: ${dbPath}`);
    } else {
        console.log('  Database not found (already removed)');
    }
    for (const suffix of ['-wal', '-shm']) {
        const walPath = dbPath + suffix;
        if (fs.existsSync(walPath)) {
            fs.unlinkSync(walPath);
        }
    }
}

function main(): void {
    console.log('\n');
    console.log('========================================');
    console.log('  CNaught Carbonlog Uninstall           ');
    console.log('========================================');
    console.log('\n');

    console.log('  Removing all sessions...\n');

    const deleted = deleteAllSessions();
    console.log(`  Deleted ${deleted} session(s)`);

    // Clean up sync config before deleting the database
    try {
        const cleanupDb = openDatabase();
        initializeDatabase(cleanupDb);
        deleteConfig(cleanupDb, 'sync_enabled');
        deleteConfig(cleanupDb, 'claude_code_user_id');
        deleteConfig(cleanupDb, 'claude_code_user_name');
        deleteConfig(cleanupDb, 'claude_code_team');
        cleanupDb.close();
    } catch {
        // Non-critical, database is about to be deleted anyway
    }

    console.log('  Deleting database...\n');
    deleteDatabase();

    console.log('\n');
    console.log('========================================');
    console.log('\n');
}

main();

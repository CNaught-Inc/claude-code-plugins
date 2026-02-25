/**
 * Carbon Uninstall Script
 *
 * Removes carbon tracking data for the current project:
 * 1. Deletes sessions matching the current project path from the database
 * 2. If no sessions remain, deletes the database (~/.claude/carbon-tracker.db)
 *
 * Statusline and settings cleanup is handled by the uninstall command (uninstall.md).
 *
 * Usage:
 *   carbon-uninstall.js --project-path /path/to/project
 */

import '../utils/load-env';

import * as fs from 'fs';

import { deleteConfig, getDatabasePath, initializeDatabase, openDatabase } from '../data-store';
import { resolveProjectIdentifier } from '../project-identifier';

function deleteProjectSessions(projectPath: string): { deleted: number; remaining: number } {
    const dbPath = getDatabasePath();
    if (!fs.existsSync(dbPath)) {
        return { deleted: 0, remaining: 0 };
    }

    const db = openDatabase();
    try {
        initializeDatabase(db);

        const projectIdentifier = resolveProjectIdentifier(projectPath);

        // Delete by project_identifier (new format) or legacy project_path formats
        const encodedPath = projectPath.replace(/\//g, '-');
        const deleteResult = db
            .prepare('DELETE FROM sessions WHERE project_identifier = ? OR project_path = ? OR project_path = ?')
            .run(projectIdentifier, encodedPath, projectPath);
        const deleted = deleteResult.changes;

        const countRow = db.prepare('SELECT COUNT(*) as count FROM sessions').get() as {
            count: number;
        };
        return { deleted, remaining: countRow.count };
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
    const args = process.argv.slice(2);
    const pathIndex = args.indexOf('--project-path');
    const projectPath = pathIndex !== -1 ? args[pathIndex + 1] : null;

    console.log('\n');
    console.log('========================================');
    console.log('  CNaught Carbon Tracker Uninstall      ');
    console.log('========================================');
    console.log('\n');

    if (!projectPath) {
        console.log('  Error: --project-path is required');
        process.exit(1);
    }

    console.log(`  Removing sessions for: ${projectPath}\n`);
    const { deleted, remaining } = deleteProjectSessions(projectPath);
    console.log(`  Deleted ${deleted} session(s) for this project`);

    if (remaining === 0) {
        // Clean up sync config before deleting the database
        try {
            const cleanupDb = openDatabase();
            initializeDatabase(cleanupDb);
            deleteConfig(cleanupDb, 'sync_enabled');
            deleteConfig(cleanupDb, 'claude_code_user_id');
            deleteConfig(cleanupDb, 'claude_code_user_name');
            cleanupDb.close();
        } catch {
            // Non-critical, database is about to be deleted anyway
        }
        console.log('  No sessions remain — deleting database...\n');
        deleteDatabase();
    } else {
        console.log(`  ${remaining} session(s) from other projects remain`);
        console.log('  Database left intact');
    }

    console.log('\n');
    console.log('========================================');
    console.log('\n');
}

main();

/**
 * Carbon Setup Script
 *
 * Sets up the CNaught carbon tracking plugin:
 * 1. Initializes the local SQLite database
 * 2. Configures project-level .claude/settings.local.json to enable the statusline
 * 3. Optionally enables anonymous usage tracking with CNaught API
 */

import '../utils/load-env';

import * as path from 'path';

import { adjectives, animals, uniqueNamesGenerator } from 'unique-names-generator';

import { getDashboardUrl } from '../api-client';
import { calculateSessionCarbon } from '../carbon-calculator';
import {
    getAllSessionIds,
    getClaudeDir,
    getConfig,
    getInstalledAt,
    initializeDatabase,
    openDatabase,
    setConfig,
    setInstalledAt,
    setProjectConfig,
    withDatabase
} from '../data-store';
import { shortHash } from '../project-identifier';
import { resolveProjectIdentifier } from '../project-identifier';
import { saveSessionToDb } from '../session-db';
import { findTranscriptsForProject, getSessionIdFromPath, parseSession } from '../session-parser';
import { syncUnsyncedSessions } from '../sync';
import { generateMachineUserId } from '../utils/machine-id';
import { logError } from '../utils/stdin';
import { configureSettings, convertToUserScope } from './setup-helpers';

/**
 * Get the plugin root directory (two levels up from src/scripts/)
 */
function getPluginRoot(): string {
    // __dirname is src/scripts/, plugin root is two levels up
    return path.resolve(__dirname, '..', '..');
}


/**
 * Backfill historical sessions from transcript files on disk.
 * Only processes sessions for the given project path.
 */
function backfillSessions(db: import('bun:sqlite').Database, projectPath: string): number {
    const existingSessionIds = new Set(getAllSessionIds(db));
    const transcripts = findTranscriptsForProject(projectPath);
    let count = 0;

    for (const transcriptPath of transcripts) {
        const sessionId = getSessionIdFromPath(transcriptPath);

        if (existingSessionIds.has(sessionId)) {
            continue;
        }

        try {
            const sessionUsage = parseSession(transcriptPath);

            if (sessionUsage.totals.totalTokens === 0) {
                continue;
            }

            const carbon = calculateSessionCarbon(sessionUsage);
            saveSessionToDb(db, sessionId, sessionUsage, carbon);
            count++;
        } catch (error) {
            logError(`Failed to backfill session ${sessionId}`, error);
        }
    }

    return count;
}

/**
 * Configure anonymous usage tracking with the CNaught API.
 * Generates a random user ID on first enable.
 * Uses the provided display name, or generates a random one.
 */
async function configureSyncTracking(
    shouldBackfill: boolean,
    customUserName: string | null
): Promise<void> {
    const db = openDatabase();
    try {
        initializeDatabase(db);

        // Check if sync was already configured
        const existingUserId = getConfig(db, 'claude_code_user_id');
        if (existingUserId) {
            const existingName = getConfig(db, 'claude_code_user_name') || 'Unknown';
            // Update name if a new one was provided
            if (customUserName) {
                setConfig(db, 'claude_code_user_name', customUserName);
                console.log(
                    `  Updated name to "${customUserName}" (id: ${existingUserId.slice(0, 8)}...)`
                );
            } else {
                console.log(
                    `  Already configured as "${existingName}" (id: ${existingUserId.slice(0, 8)}...)`
                );
            }
            setConfig(db, 'sync_enabled', 'true');
        } else {
            const userId = generateMachineUserId();
            const userName =
                customUserName ||
                uniqueNamesGenerator({
                    dictionaries: [adjectives, animals],
                    separator: ' ',
                    style: 'capital'
                });

            setConfig(db, 'sync_enabled', 'true');
            setConfig(db, 'claude_code_user_id', userId);
            setConfig(db, 'claude_code_user_name', userName);
            console.log(`  Sync enabled as "${userName}" (id: ${userId.slice(0, 8)}...)`);
        }

        const isFirstEnable = !existingUserId;

        if (shouldBackfill) {
            // Sync all existing sessions to the API
            console.log('  Syncing existing sessions to CNaught API...');
            const synced = await syncUnsyncedSessions(db);
            console.log(`  Synced ${synced} session(s)`);
        } else if (isFirstEnable) {
            // First time enabling sync without backfill: mark existing sessions
            // as already synced so only new sessions going forward get synced.
            db.exec('UPDATE sessions SET needs_sync = 0 WHERE needs_sync = 1');
            console.log('  Existing sessions marked as synced (not backfilling)');
        }
    } finally {
        db.close();
    }
}

/**
 * Main setup flow
 */
async function main(): Promise<void> {
    const shouldBackfill = process.argv.includes('--backfill');
    const shouldEnableSync = !process.argv.includes('--disable-sync');
    const userNameIndex = process.argv.indexOf('--user-name');
    const customUserName = userNameIndex !== -1 ? process.argv[userNameIndex + 1] || null : null;
    const projectNameIndex = process.argv.indexOf('--project-name');
    const customProjectName = projectNameIndex !== -1 ? process.argv[projectNameIndex + 1] || null : null;
    console.log('\n');
    console.log('========================================');
    console.log('  CNaught Carbon Tracker Setup         ');
    console.log('========================================');
    console.log('\n');

    // Step 1: Initialize database
    console.log('Step 1: Initializing database...');
    try {
        withDatabase((db) => {
            const isFirstInstall = getInstalledAt(db) === null;
            setInstalledAt(db);

            // Store project name if provided (scoped to this project's path hash)
            if (customProjectName) {
                const projectHash = shortHash(process.cwd());
                setProjectConfig(db, projectHash, 'project_name', customProjectName);
                console.log(`  Project name set to "${customProjectName}"`);
            }

            console.log('  Database initialized successfully');
            if (isFirstInstall && !shouldBackfill) {
                console.log('  First install detected — only new sessions will be tracked');
            }

            if (shouldBackfill) {
                console.log('  Backfilling historical sessions...');
                const backfilled = backfillSessions(db, process.cwd());
                console.log(`  Backfilled ${backfilled} historical session(s)`);
            }
        });
        console.log('');

        // Step 2: Configure statusline (global scope)
        console.log('Step 2: Configuring statusline...');
        const claudeDir = getClaudeDir();
        convertToUserScope(claudeDir);
        const settingsResult = configureSettings({
            targetSettingsPath: path.join(claudeDir, 'settings.json'),
            pluginRoot: getPluginRoot()
        });
        console.log(`  ${settingsResult.message}\n`);

        // Step 3: Anonymous usage tracking
        if (shouldEnableSync) {
            console.log('Step 3: Anonymous usage tracking...');
            await configureSyncTracking(shouldBackfill, customUserName);
            console.log('');
        }

        // Summary
        console.log('========================================');
        console.log('  Setup Complete!                      ');
        console.log('========================================');
        console.log('\n');
        const projectId = resolveProjectIdentifier(process.cwd());
        console.log(`Project: ${projectId}`);
        console.log('');
        console.log('The carbon tracker is now active.');
        console.log('You will see CO2 emissions in your status bar.');
        if (shouldEnableSync) {
            console.log('Session data will sync to CNaught in the background.');
            const userId = withDatabase((db) => getConfig(db, 'claude_code_user_id'));
            if (userId) {
                console.log(`\n  Dashboard: ${getDashboardUrl(userId)}`);
            }
        }
        console.log('\n');
        console.log('Commands:');
        console.log('  /carbon:report  - View emissions report');
        console.log('\n');
    } catch (error) {
        logError('Failed to initialize database', error);
        console.log('  Warning: Database initialization failed\n');
    }
}

main().catch((error) => {
    logError('Setup failed', error);
    process.exit(1);
});

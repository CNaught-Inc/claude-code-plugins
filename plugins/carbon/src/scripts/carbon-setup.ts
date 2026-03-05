/**
 * Carbon Setup Script
 *
 * Sets up the CNaught carbon tracking plugin:
 * 1. Initializes the local SQLite database
 * 2. Configures project-level .claude/settings.local.json to enable the statusline
 * 3. Optionally enables anonymous usage tracking with CNaught API
 */

import '../utils/load-env';

import * as fs from 'node:fs';
import * as path from 'node:path';

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
import { resolveProjectIdentifier, shortHash } from '../project-identifier';
import { saveSessionToDb } from '../session-db';
import {
    findAllTranscripts,
    getFirstTimestamp,
    getSessionIdFromPath,
    parseSession
} from '../session-parser';
import { syncUnsyncedSessions } from '../sync';
import { getArgValue, hasFlag, validateName } from '../utils/args';
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
 * Backfill historical sessions from transcript files on disk across all projects.
 */
function backfillSessions(db: import('bun:sqlite').Database): number {
    const existingSessionIds = new Set(getAllSessionIds(db));
    const transcripts = findAllTranscripts();
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
            db.run("UPDATE sessions SET sync_status = 'synced' WHERE sync_status != 'synced'");
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
    const shouldBackfill = hasFlag('--backfill');
    const shouldEnableSync = !hasFlag('--disable-sync');
    const customUserName = getArgValue('--user-name');
    const customProjectName = getArgValue('--project-name');

    // Validate names if provided
    for (const [label, name, maxLen] of [
        ['User name', customUserName, 50],
        ['Project name', customProjectName, 100]
    ] as const) {
        if (name !== null) {
            const error = validateName(name, maxLen);
            if (error) {
                console.error(`${label}: ${error}`);
                process.exit(1);
            }
        }
    }
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
                const transcripts = findAllTranscripts();
                if (transcripts.length === 0) {
                    console.log(
                        '  No transcript files found — only future sessions will be tracked'
                    );
                } else {
                    // Find oldest transcript date for reporting
                    let oldestDate: Date | null = null;
                    for (const t of transcripts) {
                        try {
                            const content = fs.readFileSync(t, 'utf-8');
                            const lines = content.split('\n').filter((l) => l.trim());
                            const ts = getFirstTimestamp(lines);
                            if (ts && (!oldestDate || ts < oldestDate)) {
                                oldestDate = ts;
                            }
                        } catch {
                            // Skip unreadable files
                        }
                    }

                    console.log('  Backfilling historical sessions...');
                    const backfilled = backfillSessions(db);

                    if (backfilled > 0 && oldestDate) {
                        const dateStr = oldestDate.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                        });
                        console.log(
                            `  Backfilled ${backfilled} session(s) starting from ${dateStr}`
                        );
                    } else {
                        console.log(`  Backfilled ${backfilled} historical session(s)`);
                    }
                }
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

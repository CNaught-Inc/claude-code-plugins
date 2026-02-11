/**
 * Carbon Setup Script
 *
 * Sets up the CNaught carbon tracking plugin:
 * 1. Initializes the local SQLite database
 * 2. Configures project-level .claude/settings.local.json to enable the statusline
 */

import * as fs from 'fs';
import * as path from 'path';

import { calculateSessionCarbon } from '../carbon-calculator.js';
import {
    getAllSessionIds,
    getInstalledAt,
    initializeDatabase,
    openDatabase,
    setInstalledAt,
    upsertSession
} from '../data-store.js';
import {
    findAllTranscripts,
    getSessionIdFromPath,
    parseSession
} from '../session-parser.js';
import { logError } from '../utils/stdin.js';

/**
 * Get Claude config directory
 */
function getClaudeDir(): string {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(homeDir, '.claude');
}

/**
 * Get the plugin root directory (two levels up from dist/scripts/)
 */
function getPluginRoot(): string {
    // __dirname is dist/scripts/, plugin root is two levels up
    return path.resolve(__dirname, '..', '..');
}

/**
 * Configure project-level .claude/settings.local.json with the statusline command.
 * This ensures the statusline only appears in projects where the plugin is set up.
 */
function configureSettings(): { success: boolean; message: string } {
    const projectDir = process.cwd();
    const claudeProjectDir = path.join(projectDir, '.claude');
    const settingsPath = path.join(claudeProjectDir, 'settings.local.json');
    const pluginRoot = getPluginRoot();
    const bunRunner = path.join(pluginRoot, 'scripts', 'bun-runner.js');
    const statuslineScript = path.join(pluginRoot, 'dist', 'statusline', 'carbon-statusline.js');
    const command = `node ${bunRunner} ${statuslineScript}`;

    try {
        let settings: Record<string, unknown> = {};

        if (fs.existsSync(settingsPath)) {
            const content = fs.readFileSync(settingsPath, 'utf-8');
            settings = JSON.parse(content);
        }

        const existingStatusLine = settings.statusLine as Record<string, unknown> | undefined;
        if (
            existingStatusLine &&
            typeof existingStatusLine === 'object' &&
            typeof existingStatusLine.command === 'string' &&
            !existingStatusLine.command.includes('statusline-carbon') &&
            !existingStatusLine.command.includes('carbon-statusline')
        ) {
            return {
                success: false,
                message: `Existing statusLine found in .claude/settings.local.json. Manually update to use: ${command}`
            };
        }

        settings.statusLine = {
            type: 'command',
            command
        };

        if (!fs.existsSync(claudeProjectDir)) {
            fs.mkdirSync(claudeProjectDir, { recursive: true });
        }
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        return { success: true, message: `Settings configured at ${settingsPath}` };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, message: `Failed to configure settings: ${message}` };
    }
}

/**
 * Migrate from the old global statusline setup:
 * - Remove statusLine from ~/.claude/settings.json if it references carbon
 * - Delete the old wrapper file ~/.claude/statusline-carbon.mjs
 */
function migrateFromGlobalStatusline(): void {
    const claudeDir = getClaudeDir();

    // Remove global statusLine config if it's ours
    const globalSettingsPath = path.join(claudeDir, 'settings.json');
    try {
        if (fs.existsSync(globalSettingsPath)) {
            const content = fs.readFileSync(globalSettingsPath, 'utf-8');
            const settings = JSON.parse(content);
            const statusLine = settings.statusLine as Record<string, unknown> | undefined;
            if (
                statusLine &&
                typeof statusLine === 'object' &&
                typeof statusLine.command === 'string' &&
                (statusLine.command.includes('statusline-carbon') || statusLine.command.includes('carbon-statusline'))
            ) {
                delete settings.statusLine;
                fs.writeFileSync(globalSettingsPath, JSON.stringify(settings, null, 2));
                console.log('  Removed old global statusline config from ~/.claude/settings.json');
            }
        }
    } catch {
        // Non-critical, ignore
    }

    // Delete old wrapper file
    const wrapperPath = path.join(claudeDir, 'statusline-carbon.mjs');
    try {
        if (fs.existsSync(wrapperPath)) {
            fs.unlinkSync(wrapperPath);
            console.log('  Removed old wrapper file ~/.claude/statusline-carbon.mjs');
        }
    } catch {
        // Non-critical, ignore
    }
}

/**
 * Backfill historical sessions from transcript files on disk.
 */
function backfillSessions(db: ReturnType<typeof openDatabase>): number {
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

            upsertSession(db, {
                sessionId,
                projectPath: sessionUsage.projectPath,
                inputTokens: sessionUsage.totals.inputTokens,
                outputTokens: sessionUsage.totals.outputTokens,
                cacheCreationTokens: sessionUsage.totals.cacheCreationTokens,
                cacheReadTokens: sessionUsage.totals.cacheReadTokens,
                totalTokens: sessionUsage.totals.totalTokens,
                energyWh: carbon.energy.energyWh,
                co2Grams: carbon.co2Grams,
                primaryModel: sessionUsage.primaryModel,
                createdAt: sessionUsage.createdAt,
                updatedAt: sessionUsage.updatedAt
            });

            count++;
        } catch (error) {
            logError(`Failed to backfill session ${sessionId}`, error);
        }
    }

    return count;
}

/**
 * Main setup flow
 */
async function main(): Promise<void> {
    const shouldBackfill = process.argv.includes('--backfill');
    console.log('\n');
    console.log('========================================');
    console.log('  CNaught Carbon Tracker Setup         ');
    console.log('========================================');
    console.log('\n');

    // Step 1: Initialize database
    console.log('Step 1: Initializing database...');
    try {
        const db = openDatabase();
        initializeDatabase(db);

        const isFirstInstall = getInstalledAt(db) === null;
        setInstalledAt(db);
        db.close();

        console.log('  Database initialized successfully');
        if (isFirstInstall && !shouldBackfill) {
            console.log('  First install detected — only new sessions will be tracked');
        }

        if (shouldBackfill) {
            console.log('  Backfilling historical sessions...');
            const backfilled = backfillSessions(db);
            console.log(`  Backfilled ${backfilled} historical session(s)`);
        }
        console.log('');

        // Step 2: Configure statusline
        console.log('Step 2: Configuring statusline...');
        migrateFromGlobalStatusline();
        const settingsResult = configureSettings();
        console.log(`  ${settingsResult.message}\n`);

        // Summary
        console.log('========================================');
        console.log('  Setup Complete!                      ');
        console.log('========================================');
        console.log('\n');
        console.log('The carbon tracker is now active.');
        console.log('You will see CO2 emissions in your status bar.');
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

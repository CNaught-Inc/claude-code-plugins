/**
 * Carbon Uninstall Script
 *
 * Removes carbon tracking artifacts:
 * 1. Deletes the local SQLite database (~/.claude/carbon-tracker.db)
 * 2. Removes the statusline wrapper (~/.claude/statusline-carbon.mjs)
 * 3. Removes the statusLine entry from ~/.claude/settings.json
 */

import * as fs from 'fs';
import * as path from 'path';

function getClaudeDir(): string {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(homeDir, '.claude');
}

function main(): void {
    const claudeDir = getClaudeDir();
    const dbPath = path.join(claudeDir, 'carbon-tracker.db');
    const statuslinePath = path.join(claudeDir, 'statusline-carbon.mjs');
    const settingsPath = path.join(claudeDir, 'settings.json');

    console.log('\n');
    console.log('========================================');
    console.log('  CNaught Carbon Tracker Uninstall      ');
    console.log('========================================');
    console.log('\n');

    // 1. Delete database
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        console.log(`  Deleted database: ${dbPath}`);
    } else {
        console.log('  Database not found (already removed)');
    }

    // Also remove WAL/SHM files if they exist
    for (const suffix of ['-wal', '-shm']) {
        const walPath = dbPath + suffix;
        if (fs.existsSync(walPath)) {
            fs.unlinkSync(walPath);
        }
    }

    // 2. Remove statusline wrapper
    if (fs.existsSync(statuslinePath)) {
        fs.unlinkSync(statuslinePath);
        console.log(`  Deleted statusline: ${statuslinePath}`);
    }

    // 3. Remove statusLine from settings.json if it points to our script
    if (fs.existsSync(settingsPath)) {
        try {
            const content = fs.readFileSync(settingsPath, 'utf-8');
            const settings = JSON.parse(content) as Record<string, unknown>;
            const statusLine = settings.statusLine as Record<string, unknown> | undefined;

            if (
                statusLine &&
                typeof statusLine === 'object' &&
                typeof statusLine.command === 'string' &&
                statusLine.command.includes('statusline-carbon')
            ) {
                delete settings.statusLine;
                fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
                console.log('  Removed statusLine from settings.json');
            }
        } catch {
            // Non-fatal
        }
    }

    console.log('\n');
    console.log('========================================');
    console.log('\n');
}

main();

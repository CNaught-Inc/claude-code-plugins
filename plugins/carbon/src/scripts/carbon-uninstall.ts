/**
 * Carbon Uninstall Script
 *
 * Removes all CNaught carbon tracking artifacts:
 * 1. Deletes the local SQLite database (~/.claude/carbon-tracker.db)
 * 2. Removes the statusline script (~/.claude/statusline-carbon.mjs)
 * 3. Removes the statusLine config from ~/.claude/settings.json
 * 4. Removes the plugin from ~/.claude/plugins/installed_plugins.json
 */

import * as fs from 'fs';
import * as path from 'path';

const PLUGIN_ID = 'carbon@cnaught-plugins';

function getClaudeDir(): string {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(homeDir, '.claude');
}

function main(): void {
    const claudeDir = getClaudeDir();
    const dbPath = path.join(claudeDir, 'carbon-tracker.db');
    const statuslinePath = path.join(claudeDir, 'statusline-carbon.mjs');
    const settingsPath = path.join(claudeDir, 'settings.json');
    const installedPluginsPath = path.join(claudeDir, 'plugins', 'installed_plugins.json');

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

    // 2. Remove statusline script
    if (fs.existsSync(statuslinePath)) {
        fs.unlinkSync(statuslinePath);
        console.log(`  Deleted statusline: ${statuslinePath}`);
    } else {
        console.log('  Statusline script not found (already removed)');
    }

    // 3. Remove statusLine from settings.json
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
            } else {
                console.log('  Settings unchanged (statusLine not set by this plugin)');
            }
        } catch {
            console.log('  Warning: Could not update settings.json');
        }
    }

    // 4. Remove plugin from installed_plugins.json
    if (fs.existsSync(installedPluginsPath)) {
        try {
            const content = fs.readFileSync(installedPluginsPath, 'utf-8');
            const registry = JSON.parse(content) as { version: number; plugins: Record<string, unknown> };

            if (registry.plugins && PLUGIN_ID in registry.plugins) {
                delete registry.plugins[PLUGIN_ID];
                fs.writeFileSync(installedPluginsPath, JSON.stringify(registry, null, 2));
                console.log(`  Removed plugin from registry`);
            } else {
                console.log('  Plugin not found in registry (already removed)');
            }
        } catch {
            console.log('  Warning: Could not update installed_plugins.json');
        }
    }

    console.log('\n');
    console.log('========================================');
    console.log('  Uninstall Complete                    ');
    console.log('========================================');
    console.log('\n');
    console.log('All carbon tracking data has been removed.');
    console.log('Restart Claude Code to complete the uninstall.');
    console.log('You can re-install at any time with /carbon:setup');
    console.log('\n');
}

main();

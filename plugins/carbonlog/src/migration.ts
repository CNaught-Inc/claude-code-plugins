/**
 * Migration: carbon → carbonlog
 *
 * Migrates data from the old "carbon" plugin name to "carbonlog".
 * Called from the session-start hook before any DB access.
 *
 * Idempotent — safe to run every session. Non-fatal — errors logged, never thrown.
 * Race-safe — if two sessions race, the loser's rename fails with ENOENT and is caught.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { getDatabasePath, getLegacyDatabasePath } from './data-store';
import { type InstalledPluginEntry, LEGACY_PLUGIN_ID, PLUGIN_ID } from './scripts/setup-helpers';
import { log, logError } from './utils/stdin';

/**
 * Run all migration steps. Call before any DB access in session-start.
 */
export function migrateFromCarbon(claudeDir: string): void {
    try {
        migrateDatabaseFiles();
        migrateInstalledPlugins(claudeDir);
        migrateSettingsFile(path.join(claudeDir, 'settings.json'));
        migrateSettingsFile(path.join(claudeDir, 'settings.local.json'));
        migrateProjectSettings(claudeDir);
    } catch (error) {
        logError('Migration from carbon failed', error);
    }
}

/**
 * Rename database files: carbon-tracker.db → carbonlog.db
 * Also handles -wal and -shm companion files.
 */
function migrateDatabaseFiles(): void {
    const oldPath = getLegacyDatabasePath();
    const newPath = getDatabasePath();

    if (!fs.existsSync(oldPath) || fs.existsSync(newPath)) return;

    try {
        fs.renameSync(oldPath, newPath);
        log('Migrated database file to carbonlog.db');

        // Rename WAL and SHM companion files
        for (const suffix of ['-wal', '-shm']) {
            const oldCompanion = oldPath + suffix;
            const newCompanion = newPath + suffix;
            if (fs.existsSync(oldCompanion) && !fs.existsSync(newCompanion)) {
                try {
                    fs.renameSync(oldCompanion, newCompanion);
                } catch {
                    // Non-critical — SQLite will recreate these
                }
            }
        }
    } catch (error) {
        // Race condition: another session may have already renamed the file
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            logError('Failed to migrate database file', error);
        }
    }
}

/**
 * Migrate installed_plugins.json: move entries from legacy key to new key.
 */
function migrateInstalledPlugins(claudeDir: string): void {
    const filePath = path.join(claudeDir, 'plugins', 'installed_plugins.json');
    try {
        if (!fs.existsSync(filePath)) return;
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content) as {
            plugins: Record<string, InstalledPluginEntry[]>;
        };

        if (!(LEGACY_PLUGIN_ID in data.plugins)) return;
        if (PLUGIN_ID in data.plugins) {
            // New key already exists — just clean up legacy
            delete data.plugins[LEGACY_PLUGIN_ID];
        } else {
            // Move entries from legacy to new key
            data.plugins[PLUGIN_ID] = data.plugins[LEGACY_PLUGIN_ID];
            delete data.plugins[LEGACY_PLUGIN_ID];
        }

        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        log('Migrated installed_plugins.json');
    } catch {
        // Non-critical
    }
}

/**
 * Migrate a settings file: rename legacy keys to current names.
 */
function migrateSettingsFile(settingsPath: string): void {
    try {
        if (!fs.existsSync(settingsPath)) return;
        const content = fs.readFileSync(settingsPath, 'utf-8');
        const settings = JSON.parse(content) as Record<string, unknown>;
        let changed = false;

        // Migrate enabledPlugins key
        const enabledPlugins = settings.enabledPlugins as Record<string, unknown> | undefined;
        if (
            enabledPlugins &&
            LEGACY_PLUGIN_ID in enabledPlugins &&
            !(PLUGIN_ID in enabledPlugins)
        ) {
            enabledPlugins[PLUGIN_ID] = enabledPlugins[LEGACY_PLUGIN_ID];
            delete enabledPlugins[LEGACY_PLUGIN_ID];
            changed = true;
        }

        // Migrate _carbonOriginalStatusLine → _carbonlogOriginalStatusLine
        if (
            '_carbonOriginalStatusLine' in settings &&
            !('_carbonlogOriginalStatusLine' in settings)
        ) {
            settings._carbonlogOriginalStatusLine = settings._carbonOriginalStatusLine;
            delete settings._carbonOriginalStatusLine;
            changed = true;
        }

        // Migrate carbonTracker → carbonlog settings key
        if ('carbonTracker' in settings && !('carbonlog' in settings)) {
            settings.carbonlog = settings.carbonTracker;
            delete settings.carbonTracker;
            changed = true;
        }

        // Update statusline command paths: carbon-statusline → carbonlog-statusline
        const statusLine = settings.statusLine as { command?: string } | undefined;
        if (
            statusLine?.command &&
            statusLine.command.includes('carbon-statusline') &&
            !statusLine.command.includes('carbonlog-statusline')
        ) {
            statusLine.command = statusLine.command.replace(
                'carbon-statusline',
                'carbonlog-statusline'
            );
            changed = true;
        }

        if (changed) {
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        }
    } catch {
        // Non-critical
    }
}

/**
 * Migrate project-level settings files found via installed_plugins.json entries.
 */
function migrateProjectSettings(claudeDir: string): void {
    const filePath = path.join(claudeDir, 'plugins', 'installed_plugins.json');
    try {
        if (!fs.existsSync(filePath)) return;
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content) as {
            plugins?: Record<string, InstalledPluginEntry[]>;
        };

        const entries = data.plugins?.[PLUGIN_ID] ?? data.plugins?.[LEGACY_PLUGIN_ID] ?? [];
        for (const entry of entries) {
            if (entry.projectPath) {
                migrateSettingsFile(path.join(entry.projectPath, '.claude', 'settings.local.json'));
            }
        }
    } catch {
        // Non-critical
    }
}

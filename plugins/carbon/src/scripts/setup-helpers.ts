/**
 * Setup helper functions.
 *
 * Extracted from carbon-setup.ts so they can be unit-tested
 * without triggering the main() side effect.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const PLUGIN_ID = 'carbon@cnaught-plugins';

/**
 * Check if a statusLine command belongs to this plugin.
 */
export function isCarbonStatusLine(command: string): boolean {
    return (
        command.includes('statusline-carbon') ||
        command.includes('carbon-statusline') ||
        command.includes('statusline-wrapper')
    );
}

// -- installed_plugins.json helpers --

export interface InstalledPluginEntry {
    scope: 'user' | 'project' | 'local' | 'managed';
    installPath: string;
    version: string;
    installedAt: string;
    lastUpdated: string;
    projectPath?: string;
    gitCommitSha?: string;
}

/**
 * Read all carbon plugin entries from ~/.claude/plugins/installed_plugins.json.
 */
export function getInstalledPluginEntries(claudeDir: string): InstalledPluginEntry[] {
    const filePath = path.join(claudeDir, 'plugins', 'installed_plugins.json');
    try {
        if (!fs.existsSync(filePath)) return [];
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content) as { plugins?: Record<string, InstalledPluginEntry[]> };
        return data.plugins?.[PLUGIN_ID] ?? [];
    } catch {
        return [];
    }
}

/**
 * Remove the carbon statusline from a settings file.
 * If _carbonOriginalStatusLine is present, restores it as the statusLine.
 * Also removes carbon from enabledPlugins.
 */
function cleanupSettingsFile(settingsPath: string): void {
    try {
        if (!fs.existsSync(settingsPath)) return;
        const content = fs.readFileSync(settingsPath, 'utf-8');
        const settings = JSON.parse(content) as Record<string, unknown>;
        let changed = false;

        // Restore original statusline or remove carbon statusline
        const statusLine = settings.statusLine as Record<string, unknown> | undefined;
        const savedOriginal = settings._carbonOriginalStatusLine as
            | Record<string, unknown>
            | undefined;

        if (savedOriginal && typeof savedOriginal === 'object') {
            settings.statusLine = savedOriginal;
            delete settings._carbonOriginalStatusLine;
            changed = true;
        } else if (
            statusLine &&
            typeof statusLine === 'object' &&
            typeof statusLine.command === 'string' &&
            isCarbonStatusLine(statusLine.command)
        ) {
            delete settings.statusLine;
            delete settings._carbonOriginalStatusLine;
            changed = true;
        }

        // Remove from enabledPlugins
        const enabledPlugins = settings.enabledPlugins as Record<string, unknown> | undefined;
        if (enabledPlugins && PLUGIN_ID in enabledPlugins) {
            delete enabledPlugins[PLUGIN_ID];
            if (Object.keys(enabledPlugins).length === 0) {
                delete settings.enabledPlugins;
            }
            changed = true;
        }

        if (changed) {
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        }
    } catch {
        // Non-critical, ignore
    }
}

/**
 * Convert the plugin installation to user (global) scope.
 *
 * - Cleans up carbon statusline + enabledPlugins from all project/local settings files
 * - Ensures enabledPlugins in ~/.claude/settings.json has the carbon plugin
 * - Updates installed_plugins.json to a single user-scope entry
 */
export function convertToUserScope(claudeDir: string): void {
    const entries = getInstalledPluginEntries(claudeDir);
    if (entries.length === 0) return;

    // Clean up project/local scope settings files
    for (const entry of entries) {
        if ((entry.scope === 'project' || entry.scope === 'local') && entry.projectPath) {
            cleanupSettingsFile(path.join(entry.projectPath, '.claude', 'settings.local.json'));
        }
    }

    // Ensure enabledPlugins in global settings.json
    const globalSettingsPath = path.join(claudeDir, 'settings.json');
    try {
        let settings: Record<string, unknown> = {};
        if (fs.existsSync(globalSettingsPath)) {
            settings = JSON.parse(fs.readFileSync(globalSettingsPath, 'utf-8'));
        }
        const enabledPlugins = (settings.enabledPlugins as Record<string, unknown>) ?? {};
        if (!(PLUGIN_ID in enabledPlugins)) {
            enabledPlugins[PLUGIN_ID] = true;
            settings.enabledPlugins = enabledPlugins;
            fs.writeFileSync(globalSettingsPath, JSON.stringify(settings, null, 2));
        }
    } catch {
        // Non-critical
    }

    // Update installed_plugins.json to a single user-scope entry
    const installedPluginsPath = path.join(claudeDir, 'plugins', 'installed_plugins.json');
    try {
        if (!fs.existsSync(installedPluginsPath)) return;
        const content = fs.readFileSync(installedPluginsPath, 'utf-8');
        const data = JSON.parse(content) as { version?: number; plugins: Record<string, InstalledPluginEntry[]> };

        const existingEntries = data.plugins[PLUGIN_ID] ?? [];
        const userEntry = existingEntries.find((e) => e.scope === 'user');

        if (userEntry) {
            // Already has a user-scope entry — keep only that one
            data.plugins[PLUGIN_ID] = [userEntry];
        } else if (existingEntries.length > 0) {
            // Convert the first entry to user scope
            const base = existingEntries[0];
            data.plugins[PLUGIN_ID] = [
                {
                    scope: 'user',
                    installPath: base.installPath,
                    version: base.version,
                    installedAt: base.installedAt,
                    lastUpdated: new Date().toISOString(),
                    ...(base.gitCommitSha ? { gitCommitSha: base.gitCommitSha } : {})
                }
            ];
        }

        fs.writeFileSync(installedPluginsPath, JSON.stringify(data, null, 2));
    } catch {
        // Non-critical
    }
}

/**
 * Clean up all carbon plugin traces during uninstall.
 *
 * - Removes statusline + enabledPlugins from all known settings files
 * - Removes all entries from installed_plugins.json
 */
export function cleanupAllInstallations(claudeDir: string): void {
    const entries = getInstalledPluginEntries(claudeDir);

    // Clean up project/local scope settings files
    for (const entry of entries) {
        if (entry.projectPath) {
            cleanupSettingsFile(path.join(entry.projectPath, '.claude', 'settings.local.json'));
        }
    }

    // Clean up global settings
    cleanupSettingsFile(path.join(claudeDir, 'settings.json'));
    cleanupSettingsFile(path.join(claudeDir, 'settings.local.json'));

    // Remove from installed_plugins.json
    const installedPluginsPath = path.join(claudeDir, 'plugins', 'installed_plugins.json');
    try {
        if (!fs.existsSync(installedPluginsPath)) return;
        const content = fs.readFileSync(installedPluginsPath, 'utf-8');
        const data = JSON.parse(content) as { plugins: Record<string, unknown> };
        if (PLUGIN_ID in data.plugins) {
            delete data.plugins[PLUGIN_ID];
            fs.writeFileSync(installedPluginsPath, JSON.stringify(data, null, 2));
        }
    } catch {
        // Non-critical
    }
}

// -- configureSettings --

export interface ConfigureSettingsOptions {
    /** The settings file to write the statusline to (e.g., ~/.claude/settings.json) */
    targetSettingsPath: string;
    pluginRoot: string;
}

export interface ConfigureSettingsResult {
    success: boolean;
    message: string;
    settings?: Record<string, unknown>;
}

/**
 * Configure the statusline command in the target settings file.
 *
 * If an existing non-carbon statusline is found, it is preserved and wrapped
 * so both statuslines run together (original output | carbon output).
 */
export function configureSettings(opts: ConfigureSettingsOptions): ConfigureSettingsResult {
    const settingsPath = opts.targetSettingsPath;
    const standaloneScript = path.join(
        opts.pluginRoot,
        'src',
        'statusline',
        'carbon-statusline.ts'
    );
    const wrapperScript = path.join(opts.pluginRoot, 'src', 'statusline', 'statusline-wrapper.ts');

    try {
        let settings: Record<string, unknown> = {};

        if (fs.existsSync(settingsPath)) {
            const content = fs.readFileSync(settingsPath, 'utf-8');
            settings = JSON.parse(content);
        }

        // If we've already wrapped a statusline before, use the saved original
        // to avoid double-wrapping on re-setup
        const savedOriginal = settings._carbonOriginalStatusLine as
            | Record<string, unknown>
            | undefined;
        let existingStatusLine: Record<string, unknown> | undefined;
        if (
            savedOriginal &&
            typeof savedOriginal === 'object' &&
            typeof savedOriginal.command === 'string'
        ) {
            existingStatusLine = savedOriginal;
        } else {
            existingStatusLine = settings.statusLine as Record<string, unknown> | undefined;
        }

        const hasExternalStatusLine =
            existingStatusLine &&
            typeof existingStatusLine === 'object' &&
            typeof existingStatusLine.command === 'string' &&
            !isCarbonStatusLine(existingStatusLine.command);

        if (hasExternalStatusLine) {
            // Wrap the existing statusline: save the original and install the wrapper
            settings._carbonOriginalStatusLine = { ...existingStatusLine };
            const originalCommand = (existingStatusLine as { command: string }).command;
            settings.statusLine = {
                type: 'command',
                command: `npx -y bun ${wrapperScript} --original-command "${originalCommand}"`
            };
        } else {
            // No external statusline (or already ours): install standalone
            settings.statusLine = {
                type: 'command',
                command: `npx -y bun ${standaloneScript}`
            };
        }

        const settingsDir = path.dirname(settingsPath);
        if (!fs.existsSync(settingsDir)) {
            fs.mkdirSync(settingsDir, { recursive: true });
        }
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        return { success: true, message: `Settings configured at ${settingsPath}`, settings };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, message: `Failed to configure settings: ${message}` };
    }
}

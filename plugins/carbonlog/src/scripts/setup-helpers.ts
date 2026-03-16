/**
 * Setup helper functions.
 *
 * Extracted from carbonlog-setup.ts so they can be unit-tested
 * without triggering the main() side effect.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export const PLUGIN_ID = 'carbonlog@cnaught-plugins';
export const LEGACY_PLUGIN_ID = 'carbon@cnaught-plugins';

/**
 * Check if a statusLine command belongs to this plugin.
 * Detects both current (carbonlog-*) and legacy (carbon-*) patterns.
 */
export function isPluginStatusLine(command: string): boolean {
    return (
        command.includes('carbonlog-statusline') ||
        command.includes('statusline-wrapper') ||
        command.includes('carbon-statusline') ||
        command.includes('statusline-carbon')
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
 * Read all plugin entries from ~/.claude/plugins/installed_plugins.json.
 * Checks both current and legacy plugin IDs.
 */
export function getInstalledPluginEntries(claudeDir: string): InstalledPluginEntry[] {
    const filePath = path.join(claudeDir, 'plugins', 'installed_plugins.json');
    try {
        if (!fs.existsSync(filePath)) return [];
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content) as { plugins?: Record<string, InstalledPluginEntry[]> };
        const entries = data.plugins?.[PLUGIN_ID] ?? [];
        if (entries.length > 0) return entries;
        // Fall back to legacy key for pre-migration installs
        return data.plugins?.[LEGACY_PLUGIN_ID] ?? [];
    } catch {
        return [];
    }
}

/**
 * Remove the plugin statusline from a settings file.
 * If a saved original statusline is present, restores it.
 * Also removes the plugin from enabledPlugins.
 * Handles both current and legacy key names.
 */
function cleanupSettingsFile(settingsPath: string): void {
    try {
        if (!fs.existsSync(settingsPath)) return;
        const content = fs.readFileSync(settingsPath, 'utf-8');
        const settings = JSON.parse(content) as Record<string, unknown>;
        let changed = false;

        // Restore original statusline or remove plugin statusline
        // Check both current and legacy key names
        const statusLine = settings.statusLine as Record<string, unknown> | undefined;
        const savedOriginal = (settings._carbonlogOriginalStatusLine ??
            settings._carbonOriginalStatusLine) as Record<string, unknown> | undefined;

        if (savedOriginal && typeof savedOriginal === 'object') {
            settings.statusLine = savedOriginal;
            delete settings._carbonlogOriginalStatusLine;
            delete settings._carbonOriginalStatusLine;
            changed = true;
        } else if (
            statusLine &&
            typeof statusLine === 'object' &&
            typeof statusLine.command === 'string' &&
            isPluginStatusLine(statusLine.command)
        ) {
            delete settings.statusLine;
            delete settings._carbonlogOriginalStatusLine;
            delete settings._carbonOriginalStatusLine;
            changed = true;
        }

        // Remove from enabledPlugins (both current and legacy)
        const enabledPlugins = settings.enabledPlugins as Record<string, unknown> | undefined;
        if (enabledPlugins) {
            if (PLUGIN_ID in enabledPlugins) {
                delete enabledPlugins[PLUGIN_ID];
                changed = true;
            }
            if (LEGACY_PLUGIN_ID in enabledPlugins) {
                delete enabledPlugins[LEGACY_PLUGIN_ID];
                changed = true;
            }
            if (changed && Object.keys(enabledPlugins).length === 0) {
                delete settings.enabledPlugins;
            }
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
 * - Cleans up statusline + enabledPlugins from all project/local settings files
 * - Ensures enabledPlugins in ~/.claude/settings.json has the plugin
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
        const data = JSON.parse(content) as {
            version?: number;
            plugins: Record<string, InstalledPluginEntry[]>;
        };

        const existingEntries = data.plugins[PLUGIN_ID] ?? data.plugins[LEGACY_PLUGIN_ID] ?? [];
        const userEntry = existingEntries.find((e) => e.scope === 'user');

        // Write to new key, clean up legacy key
        if (userEntry) {
            data.plugins[PLUGIN_ID] = [userEntry];
        } else if (existingEntries.length > 0) {
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
        delete data.plugins[LEGACY_PLUGIN_ID];

        fs.writeFileSync(installedPluginsPath, JSON.stringify(data, null, 2));
    } catch {
        // Non-critical
    }
}

/**
 * Clean up all plugin traces during uninstall.
 *
 * - Removes statusline + enabledPlugins from all known settings files
 * - Removes all entries from installed_plugins.json (both current and legacy keys)
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

    // Remove from installed_plugins.json (both current and legacy keys)
    const installedPluginsPath = path.join(claudeDir, 'plugins', 'installed_plugins.json');
    try {
        if (!fs.existsSync(installedPluginsPath)) return;
        const content = fs.readFileSync(installedPluginsPath, 'utf-8');
        const data = JSON.parse(content) as { plugins: Record<string, unknown> };
        let changed = false;
        if (PLUGIN_ID in data.plugins) {
            delete data.plugins[PLUGIN_ID];
            changed = true;
        }
        if (LEGACY_PLUGIN_ID in data.plugins) {
            delete data.plugins[LEGACY_PLUGIN_ID];
            changed = true;
        }
        if (changed) {
            fs.writeFileSync(installedPluginsPath, JSON.stringify(data, null, 2));
        }
    } catch {
        // Non-critical
    }
}

// -- updateStatuslinePath --

/**
 * Update the statusline command in settings.json if the plugin root has changed.
 *
 * The statusline command is stored as an absolute path in settings.json (unlike hooks,
 * which use $CLAUDE_PLUGIN_ROOT). When the plugin updates to a new version, the cached
 * path changes but settings.json still points to the old one. This function detects
 * that mismatch and rewrites the command with the current plugin root.
 *
 * Should be called from the session-start hook, which has access to the current plugin root.
 */
export function updateStatuslinePath(settingsPath: string, pluginRoot: string): boolean {
    try {
        if (!fs.existsSync(settingsPath)) return false;

        const content = fs.readFileSync(settingsPath, 'utf-8');
        const settings = JSON.parse(content) as Record<string, unknown>;

        const statusLine = settings.statusLine as { type?: string; command?: string } | undefined;
        if (!statusLine?.command || !isPluginStatusLine(statusLine.command)) return false;

        const standaloneScript = path.join(
            pluginRoot,
            'src',
            'statusline',
            'carbonlog-statusline.ts'
        );
        const wrapperScript = path.join(pluginRoot, 'src', 'statusline', 'statusline-wrapper.ts');

        // Already up to date?
        if (statusLine.command.includes(pluginRoot)) return false;

        let newCommand: string;
        if (statusLine.command.includes('statusline-wrapper')) {
            // Wrapper mode: preserve --original-command arg
            const match = statusLine.command.match(/--original-command\s+"([^"]+)"/);
            const originalCommand = match?.[1] ?? '';
            newCommand = `npx -y bun ${wrapperScript} --original-command "${originalCommand}"`;
        } else {
            // Standalone mode
            newCommand = `npx -y bun ${standaloneScript}`;
        }

        settings.statusLine = { ...statusLine, command: newCommand };
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        return true;
    } catch {
        return false;
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
 * If an existing non-plugin statusline is found, it is preserved and wrapped
 * so both statuslines run together (original output | carbon output).
 */
export function configureSettings(opts: ConfigureSettingsOptions): ConfigureSettingsResult {
    const settingsPath = opts.targetSettingsPath;
    const standaloneScript = path.join(
        opts.pluginRoot,
        'src',
        'statusline',
        'carbonlog-statusline.ts'
    );
    const wrapperScript = path.join(opts.pluginRoot, 'src', 'statusline', 'statusline-wrapper.ts');

    try {
        let settings: Record<string, unknown> = {};

        if (fs.existsSync(settingsPath)) {
            const content = fs.readFileSync(settingsPath, 'utf-8');
            settings = JSON.parse(content);
        }

        // If we've already wrapped a statusline before, use the saved original
        // to avoid double-wrapping on re-setup. Check both current and legacy keys.
        const savedOriginal = (settings._carbonlogOriginalStatusLine ??
            settings._carbonOriginalStatusLine) as Record<string, unknown> | undefined;
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
            !isPluginStatusLine(existingStatusLine.command);

        if (hasExternalStatusLine) {
            // Wrap the existing statusline: save the original and install the wrapper
            settings._carbonlogOriginalStatusLine = { ...existingStatusLine };
            delete settings._carbonOriginalStatusLine;
            const originalCommand = (existingStatusLine as { command: string }).command;
            settings.statusLine = {
                type: 'command',
                command: `npx -y bun ${wrapperScript} --original-command "${originalCommand}"`
            };
        } else {
            // No external statusline (or already ours): install standalone
            delete settings._carbonOriginalStatusLine;
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

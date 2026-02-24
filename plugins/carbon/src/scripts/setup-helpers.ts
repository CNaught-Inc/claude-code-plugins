/**
 * Setup helper functions.
 *
 * Extracted from carbon-setup.ts so they can be unit-tested
 * without triggering the main() side effect.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

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

export interface ConfigureSettingsOptions {
    projectDir: string;
    pluginRoot: string;
    /** Path to global settings.json. If omitted, global settings are not checked. */
    globalSettingsPath?: string;
}

export interface ConfigureSettingsResult {
    success: boolean;
    message: string;
    settings?: Record<string, unknown>;
}

/**
 * Configure project-level .claude/settings.local.json with the statusline command.
 *
 * If an existing non-carbon statusline is found, it is preserved and wrapped
 * so both statuslines run together (original output | carbon output).
 */
export function configureSettings(opts: ConfigureSettingsOptions): ConfigureSettingsResult {
    const claudeProjectDir = path.join(opts.projectDir, '.claude');
    const settingsPath = path.join(claudeProjectDir, 'settings.local.json');
    const envFile = path.join(opts.pluginRoot, '.env.local');
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
        if (!existingStatusLine || typeof existingStatusLine !== 'object') {
            // Check project-level settings.json (higher priority than global)
            const projectSettingsPath = path.join(claudeProjectDir, 'settings.json');
            try {
                if (fs.existsSync(projectSettingsPath)) {
                    const projectContent = fs.readFileSync(projectSettingsPath, 'utf-8');
                    const projectSettings = JSON.parse(projectContent);
                    if (
                        projectSettings.statusLine &&
                        typeof projectSettings.statusLine === 'object'
                    ) {
                        existingStatusLine = projectSettings.statusLine as Record<string, unknown>;
                    }
                }
            } catch {
                // Non-critical, ignore
            }
        }
        if (!existingStatusLine || typeof existingStatusLine !== 'object') {
            // Check global settings (lowest priority in cascade)
            const globalSettingsPath = opts.globalSettingsPath;
            try {
                if (globalSettingsPath && fs.existsSync(globalSettingsPath)) {
                    const globalContent = fs.readFileSync(globalSettingsPath, 'utf-8');
                    const globalSettings = JSON.parse(globalContent);
                    if (
                        globalSettings.statusLine &&
                        typeof globalSettings.statusLine === 'object'
                    ) {
                        existingStatusLine = globalSettings.statusLine as Record<string, unknown>;
                    }
                }
            } catch {
                // Non-critical, ignore
            }
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
                command: `bun --env-file=${envFile} ${wrapperScript} --original-command "${originalCommand}"`
            };
        } else {
            // No external statusline (or already ours): install standalone
            settings.statusLine = {
                type: 'command',
                command: `bun --env-file=${envFile} ${standaloneScript}`
            };
        }

        if (!fs.existsSync(claudeProjectDir)) {
            fs.mkdirSync(claudeProjectDir, { recursive: true });
        }
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        return { success: true, message: `Settings configured at ${settingsPath}`, settings };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, message: `Failed to configure settings: ${message}` };
    }
}

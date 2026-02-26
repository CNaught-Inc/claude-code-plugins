import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
    cleanupAllInstallations,
    configureSettings,
    convertToUserScope,
    getInstalledPluginEntries,
    isCarbonStatusLine
} from './setup-helpers';

describe('isCarbonStatusLine', () => {
    it('detects statusline-carbon', () => {
        expect(isCarbonStatusLine('node /path/to/statusline-carbon.js')).toBe(true);
    });

    it('detects carbon-statusline', () => {
        expect(isCarbonStatusLine('node /path/to/carbon-statusline.ts')).toBe(true);
    });

    it('detects statusline-wrapper', () => {
        expect(
            isCarbonStatusLine('node /path/to/statusline-wrapper.ts --original-command "bunx foo"')
        ).toBe(true);
    });

    it('returns false for unrelated commands', () => {
        expect(isCarbonStatusLine('bunx ccstatusline@latest')).toBe(false);
    });

    it('returns false for empty string', () => {
        expect(isCarbonStatusLine('')).toBe(false);
    });
});

describe('getInstalledPluginEntries', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carbon-test-'));
        fs.mkdirSync(path.join(tmpDir, 'plugins'), { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns empty array when file does not exist', () => {
        expect(getInstalledPluginEntries(tmpDir)).toEqual([]);
    });

    it('returns empty array when plugin is not in file', () => {
        fs.writeFileSync(
            path.join(tmpDir, 'plugins', 'installed_plugins.json'),
            JSON.stringify({ version: 2, plugins: {} })
        );
        expect(getInstalledPluginEntries(tmpDir)).toEqual([]);
    });

    it('returns entries for the carbon plugin', () => {
        const entries = [
            {
                scope: 'local',
                installPath: '/path/to/cache',
                version: '2.0.0',
                installedAt: '2026-01-01T00:00:00.000Z',
                lastUpdated: '2026-01-01T00:00:00.000Z',
                projectPath: '/project/a'
            }
        ];
        fs.writeFileSync(
            path.join(tmpDir, 'plugins', 'installed_plugins.json'),
            JSON.stringify({ version: 2, plugins: { 'carbon@cnaught-plugins': entries } })
        );
        const result = getInstalledPluginEntries(tmpDir);
        expect(result).toHaveLength(1);
        expect(result[0].scope).toBe('local');
        expect(result[0].projectPath).toBe('/project/a');
    });
});

describe('convertToUserScope', () => {
    let tmpDir: string;
    let projectA: string;
    let projectB: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carbon-test-'));
        fs.mkdirSync(path.join(tmpDir, 'plugins'), { recursive: true });
        projectA = path.join(tmpDir, 'project-a');
        projectB = path.join(tmpDir, 'project-b');
        fs.mkdirSync(path.join(projectA, '.claude'), { recursive: true });
        fs.mkdirSync(path.join(projectB, '.claude'), { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('does nothing when no entries exist', () => {
        fs.writeFileSync(
            path.join(tmpDir, 'plugins', 'installed_plugins.json'),
            JSON.stringify({ version: 2, plugins: {} })
        );
        convertToUserScope(tmpDir);
        // Should not throw
    });

    it('cleans up project settings and converts to user scope', () => {
        // Set up local-scope entries
        fs.writeFileSync(
            path.join(tmpDir, 'plugins', 'installed_plugins.json'),
            JSON.stringify({
                version: 2,
                plugins: {
                    'carbon@cnaught-plugins': [
                        {
                            scope: 'local',
                            installPath: '/cache/carbon/2.0.0',
                            version: '2.0.0',
                            installedAt: '2026-01-01T00:00:00.000Z',
                            lastUpdated: '2026-01-01T00:00:00.000Z',
                            projectPath: projectA
                        },
                        {
                            scope: 'local',
                            installPath: '/cache/carbon/2.0.0',
                            version: '2.0.0',
                            installedAt: '2026-01-02T00:00:00.000Z',
                            lastUpdated: '2026-01-02T00:00:00.000Z',
                            projectPath: projectB
                        }
                    ]
                }
            })
        );

        // Set up project settings with carbon statuslines
        fs.writeFileSync(
            path.join(projectA, '.claude', 'settings.local.json'),
            JSON.stringify({
                statusLine: { type: 'command', command: 'npx -y bun /path/to/carbon-statusline.ts' },
                enabledPlugins: { 'carbon@cnaught-plugins': true }
            })
        );
        fs.writeFileSync(
            path.join(projectB, '.claude', 'settings.local.json'),
            JSON.stringify({
                statusLine: { type: 'command', command: 'npx -y bun /path/to/carbon-statusline.ts' },
                enabledPlugins: { 'carbon@cnaught-plugins': true, 'other-plugin': true }
            })
        );

        convertToUserScope(tmpDir);

        // Project A: statusline and enabledPlugins removed
        const settingsA = JSON.parse(
            fs.readFileSync(path.join(projectA, '.claude', 'settings.local.json'), 'utf-8')
        );
        expect(settingsA.statusLine).toBeUndefined();
        expect(settingsA.enabledPlugins).toBeUndefined();

        // Project B: statusline removed, other plugin preserved
        const settingsB = JSON.parse(
            fs.readFileSync(path.join(projectB, '.claude', 'settings.local.json'), 'utf-8')
        );
        expect(settingsB.statusLine).toBeUndefined();
        expect(settingsB.enabledPlugins).toEqual({ 'other-plugin': true });

        // Global settings.json has enabledPlugins
        const globalSettings = JSON.parse(
            fs.readFileSync(path.join(tmpDir, 'settings.json'), 'utf-8')
        );
        expect(globalSettings.enabledPlugins['carbon@cnaught-plugins']).toBe(true);

        // installed_plugins.json has single user-scope entry
        const installed = JSON.parse(
            fs.readFileSync(path.join(tmpDir, 'plugins', 'installed_plugins.json'), 'utf-8')
        );
        const entries = installed.plugins['carbon@cnaught-plugins'];
        expect(entries).toHaveLength(1);
        expect(entries[0].scope).toBe('user');
        expect(entries[0].projectPath).toBeUndefined();
    });

    it('keeps existing user-scope entry when converting', () => {
        fs.writeFileSync(
            path.join(tmpDir, 'plugins', 'installed_plugins.json'),
            JSON.stringify({
                version: 2,
                plugins: {
                    'carbon@cnaught-plugins': [
                        {
                            scope: 'user',
                            installPath: '/cache/carbon/2.0.0',
                            version: '2.0.0',
                            installedAt: '2026-01-01T00:00:00.000Z',
                            lastUpdated: '2026-01-01T00:00:00.000Z'
                        },
                        {
                            scope: 'local',
                            installPath: '/cache/carbon/2.0.0',
                            version: '2.0.0',
                            installedAt: '2026-01-02T00:00:00.000Z',
                            lastUpdated: '2026-01-02T00:00:00.000Z',
                            projectPath: projectA
                        }
                    ]
                }
            })
        );

        fs.writeFileSync(
            path.join(projectA, '.claude', 'settings.local.json'),
            JSON.stringify({
                statusLine: { type: 'command', command: 'npx -y bun /path/to/carbon-statusline.ts' },
                enabledPlugins: { 'carbon@cnaught-plugins': true }
            })
        );

        convertToUserScope(tmpDir);

        const installed = JSON.parse(
            fs.readFileSync(path.join(tmpDir, 'plugins', 'installed_plugins.json'), 'utf-8')
        );
        const entries = installed.plugins['carbon@cnaught-plugins'];
        expect(entries).toHaveLength(1);
        expect(entries[0].scope).toBe('user');
        expect(entries[0].installedAt).toBe('2026-01-01T00:00:00.000Z'); // kept the user entry
    });

    it('restores _carbonOriginalStatusLine when cleaning up', () => {
        fs.writeFileSync(
            path.join(tmpDir, 'plugins', 'installed_plugins.json'),
            JSON.stringify({
                version: 2,
                plugins: {
                    'carbon@cnaught-plugins': [
                        {
                            scope: 'local',
                            installPath: '/cache/carbon/2.0.0',
                            version: '2.0.0',
                            installedAt: '2026-01-01T00:00:00.000Z',
                            lastUpdated: '2026-01-01T00:00:00.000Z',
                            projectPath: projectA
                        }
                    ]
                }
            })
        );

        fs.writeFileSync(
            path.join(projectA, '.claude', 'settings.local.json'),
            JSON.stringify({
                statusLine: { type: 'command', command: 'npx -y bun /path/to/statusline-wrapper.ts --original-command "bunx ccstatusline@latest"' },
                _carbonOriginalStatusLine: { type: 'command', command: 'bunx ccstatusline@latest' },
                enabledPlugins: { 'carbon@cnaught-plugins': true }
            })
        );

        convertToUserScope(tmpDir);

        const settingsA = JSON.parse(
            fs.readFileSync(path.join(projectA, '.claude', 'settings.local.json'), 'utf-8')
        );
        // Original statusline should be restored
        expect(settingsA.statusLine).toEqual({ type: 'command', command: 'bunx ccstatusline@latest' });
        expect(settingsA._carbonOriginalStatusLine).toBeUndefined();
    });
});

describe('cleanupAllInstallations', () => {
    let tmpDir: string;
    let projectA: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carbon-test-'));
        fs.mkdirSync(path.join(tmpDir, 'plugins'), { recursive: true });
        projectA = path.join(tmpDir, 'project-a');
        fs.mkdirSync(path.join(projectA, '.claude'), { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('cleans up all settings files and installed_plugins.json', () => {
        fs.writeFileSync(
            path.join(tmpDir, 'plugins', 'installed_plugins.json'),
            JSON.stringify({
                version: 2,
                plugins: {
                    'carbon@cnaught-plugins': [
                        {
                            scope: 'local',
                            installPath: '/cache',
                            version: '2.0.0',
                            installedAt: '2026-01-01T00:00:00.000Z',
                            lastUpdated: '2026-01-01T00:00:00.000Z',
                            projectPath: projectA
                        }
                    ],
                    'other-plugin@marketplace': [
                        { scope: 'user', installPath: '/other', version: '1.0.0', installedAt: '2026-01-01T00:00:00.000Z', lastUpdated: '2026-01-01T00:00:00.000Z' }
                    ]
                }
            })
        );

        fs.writeFileSync(
            path.join(projectA, '.claude', 'settings.local.json'),
            JSON.stringify({
                statusLine: { type: 'command', command: 'npx -y bun /path/to/carbon-statusline.ts' },
                enabledPlugins: { 'carbon@cnaught-plugins': true }
            })
        );

        fs.writeFileSync(
            path.join(tmpDir, 'settings.json'),
            JSON.stringify({
                statusLine: { type: 'command', command: 'npx -y bun /path/to/carbon-statusline.ts' },
                enabledPlugins: { 'carbon@cnaught-plugins': true }
            })
        );

        cleanupAllInstallations(tmpDir);

        // Project settings cleaned
        const settingsA = JSON.parse(
            fs.readFileSync(path.join(projectA, '.claude', 'settings.local.json'), 'utf-8')
        );
        expect(settingsA.statusLine).toBeUndefined();
        expect(settingsA.enabledPlugins).toBeUndefined();

        // Global settings cleaned
        const globalSettings = JSON.parse(
            fs.readFileSync(path.join(tmpDir, 'settings.json'), 'utf-8')
        );
        expect(globalSettings.statusLine).toBeUndefined();
        expect(globalSettings.enabledPlugins).toBeUndefined();

        // installed_plugins.json: carbon removed, other plugin preserved
        const installed = JSON.parse(
            fs.readFileSync(path.join(tmpDir, 'plugins', 'installed_plugins.json'), 'utf-8')
        );
        expect(installed.plugins['carbon@cnaught-plugins']).toBeUndefined();
        expect(installed.plugins['other-plugin@marketplace']).toBeDefined();
    });
});

describe('configureSettings', () => {
    let tmpDir: string;
    let targetSettingsPath: string;
    let pluginRoot: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carbon-setup-test-'));
        targetSettingsPath = path.join(tmpDir, 'settings.json');
        pluginRoot = path.join(tmpDir, 'plugin');
        fs.mkdirSync(path.join(pluginRoot, 'src', 'statusline'), { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function readSettings(): Record<string, unknown> {
        const content = fs.readFileSync(targetSettingsPath, 'utf-8');
        return JSON.parse(content);
    }

    it('installs standalone statusline when no existing statusline', () => {
        const result = configureSettings({ targetSettingsPath, pluginRoot });

        expect(result.success).toBe(true);
        const settings = readSettings();
        const statusLine = settings.statusLine as { command: string };
        expect(statusLine.command).toContain('carbon-statusline.ts');
        expect(settings._carbonOriginalStatusLine).toBeUndefined();
    });

    it('wraps existing non-carbon statusline', () => {
        fs.writeFileSync(
            targetSettingsPath,
            JSON.stringify({
                statusLine: { type: 'command', command: 'bunx ccstatusline@latest' }
            })
        );

        const result = configureSettings({ targetSettingsPath, pluginRoot });

        expect(result.success).toBe(true);
        const settings = readSettings();
        const statusLine = settings.statusLine as { command: string };
        expect(statusLine.command).toContain('statusline-wrapper.ts');
        expect(statusLine.command).toContain('bunx ccstatusline@latest');
        const original = settings._carbonOriginalStatusLine as { command: string };
        expect(original.command).toBe('bunx ccstatusline@latest');
    });

    it('does not double-wrap on re-setup', () => {
        fs.writeFileSync(
            targetSettingsPath,
            JSON.stringify({
                statusLine: { type: 'command', command: 'bunx ccstatusline@latest' }
            })
        );
        configureSettings({ targetSettingsPath, pluginRoot });

        // Second setup: should use saved original, not the wrapped command
        const result = configureSettings({ targetSettingsPath, pluginRoot });

        expect(result.success).toBe(true);
        const settings = readSettings();
        const statusLine = settings.statusLine as { command: string };

        // Should contain wrapper only once
        const wrapperCount = (statusLine.command.match(/statusline-wrapper/g) || []).length;
        expect(wrapperCount).toBe(1);

        // Original should still be the true original
        const original = settings._carbonOriginalStatusLine as { command: string };
        expect(original.command).toBe('bunx ccstatusline@latest');
    });

    it('does not double-wrap after three consecutive setups', () => {
        fs.writeFileSync(
            targetSettingsPath,
            JSON.stringify({
                statusLine: { type: 'command', command: 'bunx ccstatusline@latest' }
            })
        );

        configureSettings({ targetSettingsPath, pluginRoot });
        configureSettings({ targetSettingsPath, pluginRoot });
        configureSettings({ targetSettingsPath, pluginRoot });

        const settings = readSettings();
        const statusLine = settings.statusLine as { command: string };
        const wrapperCount = (statusLine.command.match(/statusline-wrapper/g) || []).length;
        expect(wrapperCount).toBe(1);

        const original = settings._carbonOriginalStatusLine as { command: string };
        expect(original.command).toBe('bunx ccstatusline@latest');
    });

    it('installs standalone when existing statusline is carbon', () => {
        fs.writeFileSync(
            targetSettingsPath,
            JSON.stringify({
                statusLine: { type: 'command', command: 'node /old/path/carbon-statusline.ts' }
            })
        );

        const result = configureSettings({ targetSettingsPath, pluginRoot });

        expect(result.success).toBe(true);
        const settings = readSettings();
        const statusLine = settings.statusLine as { command: string };
        // Should install standalone (replace old carbon statusline), not wrap it
        expect(statusLine.command).toContain('carbon-statusline.ts');
        expect(statusLine.command).not.toContain('statusline-wrapper.ts');
    });

    it('creates parent directory if it does not exist', () => {
        const nestedPath = path.join(tmpDir, 'nested', 'dir', 'settings.json');

        const result = configureSettings({
            targetSettingsPath: nestedPath,
            pluginRoot
        });

        expect(result.success).toBe(true);
        expect(fs.existsSync(nestedPath)).toBe(true);
    });

    it('preserves existing settings keys', () => {
        fs.writeFileSync(
            targetSettingsPath,
            JSON.stringify({
                permissions: { allow: ['Bash(git:*)'] },
                enabledPlugins: { 'carbon@cnaught-plugins': true }
            })
        );

        configureSettings({ targetSettingsPath, pluginRoot });

        const settings = readSettings();
        expect(settings.permissions).toEqual({ allow: ['Bash(git:*)'] });
        expect(settings.enabledPlugins).toEqual({ 'carbon@cnaught-plugins': true });
        expect(settings.statusLine).toBeDefined();
    });
});

// Sync behavior tests (configureSyncTracking needs_sync logic) are in data-store.test.ts
// because they import from data-store which conflicts with the mock in carbon-output.test.ts.

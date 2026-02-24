import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { configureSettings, isCarbonStatusLine } from './setup-helpers';

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

describe('configureSettings', () => {
    let tmpDir: string;
    let projectDir: string;
    let pluginRoot: string;
    /** Points to a non-existent file so tests don't pick up the real ~/.claude/settings.json */
    let globalSettingsPath: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carbon-setup-test-'));
        projectDir = path.join(tmpDir, 'project');
        pluginRoot = path.join(tmpDir, 'plugin');
        globalSettingsPath = path.join(tmpDir, 'nonexistent-global-settings.json');
        fs.mkdirSync(path.join(projectDir, '.claude'), { recursive: true });
        fs.mkdirSync(path.join(pluginRoot, 'src', 'statusline'), { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function readSettings(): Record<string, unknown> {
        const content = fs.readFileSync(
            path.join(projectDir, '.claude', 'settings.local.json'),
            'utf-8'
        );
        return JSON.parse(content);
    }

    it('installs standalone statusline when no existing statusline', () => {
        const result = configureSettings({ projectDir, pluginRoot, globalSettingsPath });

        expect(result.success).toBe(true);
        const settings = readSettings();
        const statusLine = settings.statusLine as { command: string };
        expect(statusLine.command).toContain('carbon-statusline.ts');
        expect(settings._carbonOriginalStatusLine).toBeUndefined();
    });

    it('wraps existing non-carbon statusline', () => {
        fs.writeFileSync(
            path.join(projectDir, '.claude', 'settings.local.json'),
            JSON.stringify({
                statusLine: { type: 'command', command: 'bunx ccstatusline@latest' }
            })
        );

        const result = configureSettings({ projectDir, pluginRoot, globalSettingsPath });

        expect(result.success).toBe(true);
        const settings = readSettings();
        const statusLine = settings.statusLine as { command: string };
        expect(statusLine.command).toContain('statusline-wrapper.ts');
        expect(statusLine.command).toContain('bunx ccstatusline@latest');
        const original = settings._carbonOriginalStatusLine as { command: string };
        expect(original.command).toBe('bunx ccstatusline@latest');
    });

    it('does not double-wrap on re-setup', () => {
        // First setup: wrap an existing statusline
        fs.writeFileSync(
            path.join(projectDir, '.claude', 'settings.local.json'),
            JSON.stringify({
                statusLine: { type: 'command', command: 'bunx ccstatusline@latest' }
            })
        );
        configureSettings({ projectDir, pluginRoot, globalSettingsPath });

        // Second setup: should use saved original, not the wrapped command
        const result = configureSettings({ projectDir, pluginRoot, globalSettingsPath });

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
            path.join(projectDir, '.claude', 'settings.local.json'),
            JSON.stringify({
                statusLine: { type: 'command', command: 'bunx ccstatusline@latest' }
            })
        );

        configureSettings({ projectDir, pluginRoot, globalSettingsPath });
        configureSettings({ projectDir, pluginRoot, globalSettingsPath });
        configureSettings({ projectDir, pluginRoot, globalSettingsPath });

        const settings = readSettings();
        const statusLine = settings.statusLine as { command: string };
        const wrapperCount = (statusLine.command.match(/statusline-wrapper/g) || []).length;
        expect(wrapperCount).toBe(1);

        const original = settings._carbonOriginalStatusLine as { command: string };
        expect(original.command).toBe('bunx ccstatusline@latest');
    });

    it('installs standalone when existing statusline is carbon', () => {
        fs.writeFileSync(
            path.join(projectDir, '.claude', 'settings.local.json'),
            JSON.stringify({
                statusLine: { type: 'command', command: 'node /old/path/carbon-statusline.ts' }
            })
        );

        const result = configureSettings({ projectDir, pluginRoot, globalSettingsPath });

        expect(result.success).toBe(true);
        const settings = readSettings();
        const statusLine = settings.statusLine as { command: string };
        // Should install standalone (replace old carbon statusline), not wrap it
        expect(statusLine.command).toContain('carbon-statusline.ts');
        expect(statusLine.command).not.toContain('statusline-wrapper.ts');
    });

    it('uses project settings.json statusline over global settings', () => {
        const globalSettingsPath = path.join(tmpDir, 'global-settings.json');
        fs.writeFileSync(
            globalSettingsPath,
            JSON.stringify({
                statusLine: { type: 'command', command: 'bunx ccstatusline@latest' }
            })
        );

        // Project settings.json disables the statusline with "true" (no-op)
        fs.writeFileSync(
            path.join(projectDir, '.claude', 'settings.json'),
            JSON.stringify({
                statusLine: { type: 'command', command: 'true' }
            })
        );

        // Empty project local settings
        fs.writeFileSync(path.join(projectDir, '.claude', 'settings.local.json'), '{}');

        const result = configureSettings({ projectDir, pluginRoot, globalSettingsPath });

        expect(result.success).toBe(true);
        const settings = readSettings();
        const statusLine = settings.statusLine as { command: string };
        // Should NOT wrap the global ccstatusline — project settings.json overrides it
        // "true" is not a carbon statusline, so it wraps "true" (which is harmless)
        // but crucially it does NOT pick up ccstatusline from global
        expect(statusLine.command).not.toContain('ccstatusline');
    });

    it('picks up statusline from global settings when project has none', () => {
        const globalSettingsPath = path.join(tmpDir, 'global-settings.json');
        fs.writeFileSync(
            globalSettingsPath,
            JSON.stringify({
                statusLine: { type: 'command', command: 'bunx globalstatusline@latest' }
            })
        );

        // Empty project settings
        fs.writeFileSync(path.join(projectDir, '.claude', 'settings.local.json'), '{}');

        const result = configureSettings({ projectDir, pluginRoot, globalSettingsPath });

        expect(result.success).toBe(true);
        const settings = readSettings();
        const statusLine = settings.statusLine as { command: string };
        expect(statusLine.command).toContain('statusline-wrapper.ts');
        expect(statusLine.command).toContain('bunx globalstatusline@latest');
    });

    it('creates .claude directory if it does not exist', () => {
        const freshProjectDir = path.join(tmpDir, 'fresh-project');
        fs.mkdirSync(freshProjectDir, { recursive: true });

        const result = configureSettings({
            projectDir: freshProjectDir,
            pluginRoot,
            globalSettingsPath
        });

        expect(result.success).toBe(true);
        expect(fs.existsSync(path.join(freshProjectDir, '.claude', 'settings.local.json'))).toBe(
            true
        );
    });

    it('preserves existing settings keys', () => {
        fs.writeFileSync(
            path.join(projectDir, '.claude', 'settings.local.json'),
            JSON.stringify({
                permissions: { allow: ['Bash(git:*)'] },
                enabledPlugins: { 'carbon@cnaught-plugins': true }
            })
        );

        configureSettings({ projectDir, pluginRoot, globalSettingsPath });

        const settings = readSettings();
        expect(settings.permissions).toEqual({ allow: ['Bash(git:*)'] });
        expect(settings.enabledPlugins).toEqual({ 'carbon@cnaught-plugins': true });
        expect(settings.statusLine).toBeDefined();
    });
});

// Sync behavior tests (configureSyncTracking needs_sync logic) are in data-store.test.ts
// because they import from data-store which conflicts with the mock in carbon-output.test.ts.

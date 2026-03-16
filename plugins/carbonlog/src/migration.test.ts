import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { migrateFromCarbon } from './migration';
import { LEGACY_PLUGIN_ID, PLUGIN_ID } from './scripts/setup-helpers';

describe('migrateFromCarbon', () => {
    let tmpDir: string;
    let claudeDir: string;
    let originalHome: string | undefined;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carbonlog-migration-test-'));
        claudeDir = path.join(tmpDir, '.claude');
        fs.mkdirSync(path.join(claudeDir, 'plugins'), { recursive: true });
        originalHome = process.env.HOME;
        // Point HOME to tmpDir so getDatabasePath/getLegacyDatabasePath resolve there
        process.env.HOME = tmpDir;
    });

    afterEach(() => {
        process.env.HOME = originalHome;
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    // -- Database file migration --

    describe('database files', () => {
        it('renames carbon-tracker.db to carbonlog.db', () => {
            const oldDb = path.join(claudeDir, 'carbon-tracker.db');
            const newDb = path.join(claudeDir, 'carbonlog.db');
            fs.writeFileSync(oldDb, 'test-data');

            migrateFromCarbon(claudeDir);

            expect(fs.existsSync(newDb)).toBe(true);
            expect(fs.existsSync(oldDb)).toBe(false);
            expect(fs.readFileSync(newDb, 'utf-8')).toBe('test-data');
        });

        it('renames WAL and SHM companion files', () => {
            const oldDb = path.join(claudeDir, 'carbon-tracker.db');
            fs.writeFileSync(oldDb, 'db');
            fs.writeFileSync(oldDb + '-wal', 'wal-data');
            fs.writeFileSync(oldDb + '-shm', 'shm-data');

            migrateFromCarbon(claudeDir);

            const newDb = path.join(claudeDir, 'carbonlog.db');
            expect(fs.existsSync(newDb + '-wal')).toBe(true);
            expect(fs.existsSync(newDb + '-shm')).toBe(true);
            expect(fs.readFileSync(newDb + '-wal', 'utf-8')).toBe('wal-data');
            expect(fs.readFileSync(newDb + '-shm', 'utf-8')).toBe('shm-data');
        });

        it('skips rename if new DB already exists', () => {
            const oldDb = path.join(claudeDir, 'carbon-tracker.db');
            const newDb = path.join(claudeDir, 'carbonlog.db');
            fs.writeFileSync(oldDb, 'old-data');
            fs.writeFileSync(newDb, 'new-data');

            migrateFromCarbon(claudeDir);

            // New DB should be unchanged, old should still exist
            expect(fs.readFileSync(newDb, 'utf-8')).toBe('new-data');
            expect(fs.existsSync(oldDb)).toBe(true);
        });

        it('skips rename if old DB does not exist', () => {
            migrateFromCarbon(claudeDir);

            // Should not create any DB file
            expect(fs.existsSync(path.join(claudeDir, 'carbonlog.db'))).toBe(false);
        });
    });

    // -- installed_plugins.json migration --

    describe('installed_plugins.json', () => {
        function writeInstalledPlugins(plugins: Record<string, unknown>): void {
            fs.writeFileSync(
                path.join(claudeDir, 'plugins', 'installed_plugins.json'),
                JSON.stringify({ version: 2, plugins })
            );
        }

        function readInstalledPlugins(): Record<string, unknown> {
            return JSON.parse(
                fs.readFileSync(path.join(claudeDir, 'plugins', 'installed_plugins.json'), 'utf-8')
            ).plugins;
        }

        it('moves entries from legacy key to new key', () => {
            const entries = [
                {
                    scope: 'user',
                    installPath: '/cache/v1',
                    version: '2.7.0',
                    installedAt: '2026-01-01T00:00:00.000Z',
                    lastUpdated: '2026-01-01T00:00:00.000Z'
                }
            ];
            writeInstalledPlugins({ [LEGACY_PLUGIN_ID]: entries });

            migrateFromCarbon(claudeDir);

            const plugins = readInstalledPlugins();
            expect(plugins[PLUGIN_ID]).toBeDefined();
            expect(plugins[LEGACY_PLUGIN_ID]).toBeUndefined();
            expect((plugins[PLUGIN_ID] as any[])[0].version).toBe('2.7.0');
        });

        it('cleans up legacy key when new key already exists', () => {
            const legacyEntries = [{ scope: 'user', version: '2.0.0' }];
            const newEntries = [{ scope: 'user', version: '3.0.0' }];
            writeInstalledPlugins({
                [LEGACY_PLUGIN_ID]: legacyEntries,
                [PLUGIN_ID]: newEntries
            });

            migrateFromCarbon(claudeDir);

            const plugins = readInstalledPlugins();
            expect(plugins[LEGACY_PLUGIN_ID]).toBeUndefined();
            expect((plugins[PLUGIN_ID] as any[])[0].version).toBe('3.0.0');
        });

        it('does nothing when no legacy key exists', () => {
            const entries = [{ scope: 'user', version: '3.0.0' }];
            writeInstalledPlugins({ [PLUGIN_ID]: entries });

            migrateFromCarbon(claudeDir);

            const plugins = readInstalledPlugins();
            expect((plugins[PLUGIN_ID] as any[])[0].version).toBe('3.0.0');
        });

        it('does nothing when file does not exist', () => {
            try {
                fs.unlinkSync(path.join(claudeDir, 'plugins', 'installed_plugins.json'));
            } catch {
                // May not exist
            }
            // Should not throw
            migrateFromCarbon(claudeDir);
        });
    });

    // -- Settings file migration --

    describe('settings files', () => {
        function writeSettings(filename: string, settings: Record<string, unknown>): void {
            fs.writeFileSync(path.join(claudeDir, filename), JSON.stringify(settings));
        }

        function readSettings(filename: string): Record<string, unknown> {
            return JSON.parse(fs.readFileSync(path.join(claudeDir, filename), 'utf-8'));
        }

        it('migrates enabledPlugins key', () => {
            writeSettings('settings.json', {
                enabledPlugins: { [LEGACY_PLUGIN_ID]: true, 'other-plugin': true }
            });

            migrateFromCarbon(claudeDir);

            const settings = readSettings('settings.json');
            const plugins = settings.enabledPlugins as Record<string, unknown>;
            expect(plugins[PLUGIN_ID]).toBe(true);
            expect(plugins[LEGACY_PLUGIN_ID]).toBeUndefined();
            expect(plugins['other-plugin']).toBe(true);
        });

        it('migrates _carbonOriginalStatusLine to _carbonlogOriginalStatusLine', () => {
            writeSettings('settings.json', {
                _carbonOriginalStatusLine: { type: 'command', command: 'bunx ccstatusline@latest' }
            });

            migrateFromCarbon(claudeDir);

            const settings = readSettings('settings.json');
            expect(settings._carbonlogOriginalStatusLine).toEqual({
                type: 'command',
                command: 'bunx ccstatusline@latest'
            });
            expect(settings._carbonOriginalStatusLine).toBeUndefined();
        });

        it('migrates carbonTracker to carbonlog settings key', () => {
            writeSettings('settings.json', {
                carbonTracker: { apiUrl: 'https://api-stage.cnaught.com' }
            });

            migrateFromCarbon(claudeDir);

            const settings = readSettings('settings.json');
            expect(settings.carbonlog).toEqual({ apiUrl: 'https://api-stage.cnaught.com' });
            expect(settings.carbonTracker).toBeUndefined();
        });

        it('updates statusline command path from carbon-statusline to carbonlog-statusline', () => {
            writeSettings('settings.json', {
                statusLine: {
                    type: 'command',
                    command:
                        'npx -y bun /path/to/cache/carbon/2.7.0/src/statusline/carbon-statusline.ts'
                }
            });

            migrateFromCarbon(claudeDir);

            const settings = readSettings('settings.json');
            const statusLine = settings.statusLine as { command: string };
            expect(statusLine.command).toContain('carbonlog-statusline.ts');
            expect(statusLine.command).not.toContain('/carbon-statusline.ts');
        });

        it('does not update statusline if already carbonlog-statusline', () => {
            const command =
                'npx -y bun /path/to/cache/carbonlog/3.0.0/src/statusline/carbonlog-statusline.ts';
            writeSettings('settings.json', {
                statusLine: { type: 'command', command }
            });

            migrateFromCarbon(claudeDir);

            const settings = readSettings('settings.json');
            expect((settings.statusLine as { command: string }).command).toBe(command);
        });

        it('migrates all keys in a single pass', () => {
            writeSettings('settings.json', {
                enabledPlugins: { [LEGACY_PLUGIN_ID]: true },
                _carbonOriginalStatusLine: { type: 'command', command: 'bunx foo' },
                carbonTracker: { apiUrl: 'https://staging.example.com' },
                statusLine: {
                    type: 'command',
                    command: 'npx -y bun /old/path/carbon-statusline.ts'
                },
                otherSetting: 'preserved'
            });

            migrateFromCarbon(claudeDir);

            const settings = readSettings('settings.json');
            expect((settings.enabledPlugins as any)[PLUGIN_ID]).toBe(true);
            expect((settings.enabledPlugins as any)[LEGACY_PLUGIN_ID]).toBeUndefined();
            expect(settings._carbonlogOriginalStatusLine).toEqual({
                type: 'command',
                command: 'bunx foo'
            });
            expect(settings._carbonOriginalStatusLine).toBeUndefined();
            expect(settings.carbonlog).toEqual({ apiUrl: 'https://staging.example.com' });
            expect(settings.carbonTracker).toBeUndefined();
            expect((settings.statusLine as any).command).toContain('carbonlog-statusline.ts');
            expect(settings.otherSetting).toBe('preserved');
        });

        it('does not write file if nothing to migrate', () => {
            writeSettings('settings.json', {
                enabledPlugins: { [PLUGIN_ID]: true },
                otherSetting: 'value'
            });
            const mtimeBefore = fs.statSync(path.join(claudeDir, 'settings.json')).mtimeMs;

            // Small delay to ensure mtime would differ if written
            const start = Date.now();
            while (Date.now() - start < 10) {
                /* spin */
            }

            migrateFromCarbon(claudeDir);

            const mtimeAfter = fs.statSync(path.join(claudeDir, 'settings.json')).mtimeMs;
            expect(mtimeAfter).toBe(mtimeBefore);
        });

        it('migrates settings.local.json too', () => {
            writeSettings('settings.local.json', {
                enabledPlugins: { [LEGACY_PLUGIN_ID]: true }
            });

            migrateFromCarbon(claudeDir);

            const settings = readSettings('settings.local.json');
            expect((settings.enabledPlugins as any)[PLUGIN_ID]).toBe(true);
            expect((settings.enabledPlugins as any)[LEGACY_PLUGIN_ID]).toBeUndefined();
        });

        it('skips enabledPlugins migration if new key already exists', () => {
            writeSettings('settings.json', {
                enabledPlugins: { [LEGACY_PLUGIN_ID]: true, [PLUGIN_ID]: true }
            });

            migrateFromCarbon(claudeDir);

            const settings = readSettings('settings.json');
            const plugins = settings.enabledPlugins as Record<string, unknown>;
            // Legacy key should still be there since we skip when new key exists
            expect(plugins[PLUGIN_ID]).toBe(true);
        });

        it('skips _carbonlogOriginalStatusLine migration if new key already exists', () => {
            writeSettings('settings.json', {
                _carbonOriginalStatusLine: { command: 'old' },
                _carbonlogOriginalStatusLine: { command: 'new' }
            });

            migrateFromCarbon(claudeDir);

            const settings = readSettings('settings.json');
            expect((settings._carbonlogOriginalStatusLine as any).command).toBe('new');
        });
    });

    // -- Project settings migration --

    describe('project settings', () => {
        it('migrates project-level settings.local.json files', () => {
            const projectDir = path.join(tmpDir, 'my-project');
            fs.mkdirSync(path.join(projectDir, '.claude'), { recursive: true });

            // Set up installed_plugins.json with a project entry
            fs.writeFileSync(
                path.join(claudeDir, 'plugins', 'installed_plugins.json'),
                JSON.stringify({
                    version: 2,
                    plugins: {
                        [LEGACY_PLUGIN_ID]: [
                            {
                                scope: 'local',
                                installPath: '/cache',
                                version: '2.7.0',
                                installedAt: '2026-01-01T00:00:00.000Z',
                                lastUpdated: '2026-01-01T00:00:00.000Z',
                                projectPath: projectDir
                            }
                        ]
                    }
                })
            );

            // Set up project settings with legacy keys
            fs.writeFileSync(
                path.join(projectDir, '.claude', 'settings.local.json'),
                JSON.stringify({
                    enabledPlugins: { [LEGACY_PLUGIN_ID]: true },
                    statusLine: {
                        type: 'command',
                        command: 'npx -y bun /old/path/carbon-statusline.ts'
                    }
                })
            );

            migrateFromCarbon(claudeDir);

            const projectSettings = JSON.parse(
                fs.readFileSync(path.join(projectDir, '.claude', 'settings.local.json'), 'utf-8')
            );
            expect(projectSettings.enabledPlugins[PLUGIN_ID]).toBe(true);
            expect(projectSettings.enabledPlugins[LEGACY_PLUGIN_ID]).toBeUndefined();
            expect(projectSettings.statusLine.command).toContain('carbonlog-statusline.ts');
        });

        it('handles missing project settings file gracefully', () => {
            const projectDir = path.join(tmpDir, 'no-settings-project');
            // Don't create the .claude directory

            fs.writeFileSync(
                path.join(claudeDir, 'plugins', 'installed_plugins.json'),
                JSON.stringify({
                    version: 2,
                    plugins: {
                        [LEGACY_PLUGIN_ID]: [
                            {
                                scope: 'local',
                                installPath: '/cache',
                                version: '2.7.0',
                                installedAt: '2026-01-01T00:00:00.000Z',
                                lastUpdated: '2026-01-01T00:00:00.000Z',
                                projectPath: projectDir
                            }
                        ]
                    }
                })
            );

            // Should not throw
            migrateFromCarbon(claudeDir);
        });
    });

    // -- Idempotency --

    describe('idempotency', () => {
        it('running migration twice produces the same result', () => {
            // Set up full legacy state
            fs.writeFileSync(path.join(claudeDir, 'carbon-tracker.db'), 'db-content');
            fs.writeFileSync(
                path.join(claudeDir, 'plugins', 'installed_plugins.json'),
                JSON.stringify({
                    version: 2,
                    plugins: {
                        [LEGACY_PLUGIN_ID]: [
                            {
                                scope: 'user',
                                installPath: '/cache',
                                version: '2.7.0',
                                installedAt: '2026-01-01T00:00:00.000Z',
                                lastUpdated: '2026-01-01T00:00:00.000Z'
                            }
                        ]
                    }
                })
            );
            fs.writeFileSync(
                path.join(claudeDir, 'settings.json'),
                JSON.stringify({
                    enabledPlugins: { [LEGACY_PLUGIN_ID]: true },
                    _carbonOriginalStatusLine: { command: 'bunx foo' },
                    statusLine: { type: 'command', command: 'npx -y bun /old/carbon-statusline.ts' }
                })
            );

            migrateFromCarbon(claudeDir);
            const settingsAfterFirst = fs.readFileSync(
                path.join(claudeDir, 'settings.json'),
                'utf-8'
            );
            const pluginsAfterFirst = fs.readFileSync(
                path.join(claudeDir, 'plugins', 'installed_plugins.json'),
                'utf-8'
            );

            migrateFromCarbon(claudeDir);
            const settingsAfterSecond = fs.readFileSync(
                path.join(claudeDir, 'settings.json'),
                'utf-8'
            );
            const pluginsAfterSecond = fs.readFileSync(
                path.join(claudeDir, 'plugins', 'installed_plugins.json'),
                'utf-8'
            );

            expect(settingsAfterSecond).toBe(settingsAfterFirst);
            expect(pluginsAfterSecond).toBe(pluginsAfterFirst);
            expect(fs.existsSync(path.join(claudeDir, 'carbonlog.db'))).toBe(true);
            expect(fs.existsSync(path.join(claudeDir, 'carbon-tracker.db'))).toBe(false);
        });
    });

    // -- Graceful failure --

    describe('graceful failure', () => {
        it('does not throw when claudeDir does not exist', () => {
            const bogusDir = path.join(tmpDir, 'nonexistent', '.claude');
            expect(() => migrateFromCarbon(bogusDir)).not.toThrow();
        });

        it('does not throw when settings.json is malformed', () => {
            fs.writeFileSync(path.join(claudeDir, 'settings.json'), 'not json{{{');
            expect(() => migrateFromCarbon(claudeDir)).not.toThrow();
        });

        it('does not throw when installed_plugins.json is malformed', () => {
            fs.writeFileSync(path.join(claudeDir, 'plugins', 'installed_plugins.json'), 'broken');
            expect(() => migrateFromCarbon(claudeDir)).not.toThrow();
        });
    });
});

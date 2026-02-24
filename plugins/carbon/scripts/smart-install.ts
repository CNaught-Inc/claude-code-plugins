/**
 * Smart install script for the carbon plugin.
 *
 * Ensures npm dependencies (e.g. zod) are installed in the plugin directory.
 * Runs as the first SessionStart hook so that subsequent hooks can import
 * third-party packages. Uses a version cache to skip redundant installs.
 *
 * IMPORTANT: This script must NOT import any npm packages — only node: and Bun built-ins.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const pluginRoot = process.argv[2];
if (!pluginRoot) {
    console.error('[carbon-tracker] smart-install: missing plugin root argument');
    process.exit(0);
}

const nodeModulesMarker = join(pluginRoot, 'node_modules', 'zod');
const versionCacheFile = join(pluginRoot, '.install-version');
const pluginJsonFile = join(pluginRoot, '.claude-plugin', 'plugin.json');

// Read the current plugin version
let currentVersion = 'unknown';
try {
    const pluginJson = JSON.parse(readFileSync(pluginJsonFile, 'utf-8'));
    currentVersion = pluginJson.version ?? 'unknown';
} catch {
    // plugin.json missing or unreadable — proceed with install
}

// Check if we can skip installation
if (existsSync(nodeModulesMarker)) {
    try {
        const cachedVersion = readFileSync(versionCacheFile, 'utf-8').trim();
        if (cachedVersion === currentVersion) {
            // Dependencies installed and version matches — nothing to do
            process.exit(0);
        }
    } catch {
        // Cache file missing or unreadable — proceed with install
    }
}

// Install dependencies
console.error('[carbon-tracker] Installing dependencies...');
try {
    execSync(`${process.execPath} install --production --frozen-lockfile`, {
        cwd: pluginRoot,
        stdio: 'inherit',
        timeout: 30_000
    });
} catch {
    // Retry without --frozen-lockfile in case lockfile is missing or stale
    try {
        execSync(`${process.execPath} install --production`, {
            cwd: pluginRoot,
            stdio: 'inherit',
            timeout: 30_000
        });
    } catch (error) {
        console.error('[carbon-tracker] smart-install: bun install failed', error);
        process.exit(0); // Don't crash Claude Code
    }
}

// Write version cache
try {
    writeFileSync(versionCacheFile, currentVersion, 'utf-8');
} catch {
    // Non-fatal — next session will just re-install
}

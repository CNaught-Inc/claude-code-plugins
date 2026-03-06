/**
 * Carbon Cache Cleanup Script
 *
 * Removes old cached plugin versions from ~/.claude/plugins/cache/,
 * keeping the current version and the most recent prior version.
 *
 * Claude Code does not automatically clean up old plugin versions:
 * https://github.com/anthropics/claude-code/issues/14980
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

function main(): void {
    const pluginRoot = process.argv[2];
    if (!pluginRoot) {
        console.log(JSON.stringify({ error: 'Plugin root argument required' }));
        process.exit(1);
    }

    const versionDir = path.dirname(pluginRoot);
    if (!fs.existsSync(versionDir)) {
        console.log(JSON.stringify({ removed: 0, kept: [], message: 'Cache directory not found' }));
        return;
    }

    const currentVersion = path.basename(pluginRoot);
    const entries = fs.readdirSync(versionDir, { withFileTypes: true });

    // Collect other version directories with their modification times
    const others: { name: string; mtimeMs: number }[] = [];
    for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === currentVersion) continue;
        try {
            const stat = fs.statSync(path.join(versionDir, entry.name));
            others.push({ name: entry.name, mtimeMs: stat.mtimeMs });
        } catch {
            // Can't stat — skip
        }
    }

    if (others.length <= 1) {
        const kept = [currentVersion, ...others.map((o) => o.name)];
        console.log(JSON.stringify({ removed: 0, kept, message: 'Nothing to clean up' }));
        return;
    }

    // Sort by modification time descending — keep the most recent one
    others.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const toKeep = others[0];
    const toDelete = others.slice(1);

    let removed = 0;
    const errors: string[] = [];
    for (const entry of toDelete) {
        try {
            fs.rmSync(path.join(versionDir, entry.name), { recursive: true, force: true });
            removed++;
        } catch (err) {
            errors.push(`${entry.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    const kept = [currentVersion, toKeep.name];
    const result: Record<string, unknown> = {
        removed,
        kept,
        deleted: toDelete.map((e) => e.name)
    };
    if (errors.length > 0) {
        result.errors = errors;
    }

    console.log(JSON.stringify(result));
}

main();

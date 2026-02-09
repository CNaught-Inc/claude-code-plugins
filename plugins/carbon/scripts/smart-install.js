#!/usr/bin/env node
// Smart Install — ensures Bun is available before hooks run.
// Runs as a plain Node.js script (no Bun dependency).
// Called as the first SessionStart hook, before any bun-runner hooks.
const { spawnSync, execSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');

function findBun() {
    const pathCheck = spawnSync('which', ['bun'], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
    });
    if (pathCheck.status === 0 && pathCheck.stdout.trim()) {
        return pathCheck.stdout.trim();
    }

    const home = process.env.HOME || process.env.USERPROFILE;
    const candidates = [
        join(home, '.bun', 'bin', 'bun'),
        '/usr/local/bin/bun',
        '/opt/homebrew/bin/bun',
    ];
    for (const p of candidates) {
        if (existsSync(p)) return p;
    }
    return null;
}

let bun = findBun();
if (bun) {
    process.exit(0); // Already installed
}

console.error('[carbon] Bun not found — installing...');
try {
    execSync('curl -fsSL https://bun.sh/install | bash', {
        stdio: 'inherit',
        timeout: 120_000
    });
    bun = findBun();
} catch {
    // Installation failed — fall through
}

if (bun) {
    console.error('[carbon] Bun installed successfully.');
} else {
    console.error('[carbon] Could not install Bun automatically.');
    console.error('[carbon] Please install manually: https://bun.sh');
}

// Always exit 0 — never break Claude Code
process.exit(0);

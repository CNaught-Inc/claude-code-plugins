#!/usr/bin/env node
// Finds Bun and runs the target script with it.
// Does NOT install Bun — see smart-install.js for that.
// Usage: node bun-runner.js <script.js> [args...]
const { spawnSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');

function findBun() {
    // Check PATH first
    const pathCheck = spawnSync('which', ['bun'], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
    });
    if (pathCheck.status === 0 && pathCheck.stdout.trim()) {
        return 'bun';
    }

    // Check common installation paths (handles fresh installs before PATH reload)
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

const bun = findBun();
if (!bun) {
    console.error('[carbon] Bun not found. Please install Bun: https://bun.sh');
    console.error('[carbon] After installation, restart your terminal.');
    process.exit(0); // Exit gracefully — never break Claude Code
}

const args = process.argv.slice(2);
const result = spawnSync(bun, args, {
    stdio: ['pipe', 'inherit', 'inherit'],
    input: process.stdin.isTTY ? undefined : require('fs').readFileSync('/dev/stdin'),
});
process.exit(result.status ?? 0);

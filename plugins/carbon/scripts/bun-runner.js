#!/usr/bin/env node
// Finds or installs Bun, then runs the target script with it.
// Usage: node bun-runner.js <script.js> [args...]
const { spawnSync, execSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');

function findBun() {
    try {
        return execSync('which bun', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    } catch {
        const home = process.env.HOME || process.env.USERPROFILE;
        const candidates = [
            join(home, '.bun', 'bin', 'bun'),
            '/usr/local/bin/bun',
        ];
        for (const p of candidates) {
            if (existsSync(p)) return p;
        }
        return null;
    }
}

let bun = findBun();
if (!bun) {
    try {
        console.error('[carbon] Installing Bun...');
        execSync('curl -fsSL https://bun.sh/install | bash', { stdio: 'inherit' });
        bun = findBun();
    } catch {
        // Installation failed — fall through to graceful exit
    }
}

if (!bun) {
    console.error('[carbon] Bun not found. Run /carbon:setup for help.');
    process.exit(0); // Exit gracefully — never break Claude Code
}

const args = process.argv.slice(2);
const result = spawnSync(bun, args, {
    stdio: ['pipe', 'pipe', 'inherit'],
    input: process.stdin.isTTY ? undefined : require('fs').readFileSync('/dev/stdin'),
});
if (result.stdout) process.stdout.write(result.stdout);
process.exit(result.status ?? 0);

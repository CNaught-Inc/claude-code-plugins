import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env files (same as build.mjs)
function loadEnvFile(filePath) {
    if (!existsSync(filePath)) return;
    const content = readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        if ((value.startsWith("'") && value.endsWith("'")) ||
            (value.startsWith('"') && value.endsWith('"'))) {
            value = value.slice(1, -1);
        }
        if (!process.env[key]) {
            process.env[key] = value;
        }
    }
}

loadEnvFile(resolve(__dirname, '.env.local'));
loadEnvFile(resolve(__dirname, '.env'));

const define = {};
for (const key of [
    'CNAUGHT_AUTH0_DOMAIN',
    'CNAUGHT_AUTH0_CLIENT_ID',
    'CNAUGHT_AUTH0_AUDIENCE',
    'CNAUGHT_API_URL',
    'CNAUGHT_SKIP_TLS_VERIFY',
]) {
    if (process.env[key]) {
        define[`process.env.${key}`] = JSON.stringify(process.env[key]);
    }
}

const outfile = resolve(__dirname, 'dist', 'scripts', 'test-oauth.js');
mkdirSync(dirname(outfile), { recursive: true });

console.log('Building test-oauth...');
await esbuild.build({
    entryPoints: [resolve(__dirname, 'src/scripts/test-oauth.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    external: ['bun:sqlite'],
    banner: { js: '#!/usr/bin/env node' },
    sourcemap: true,
    define,
});

console.log('Running test-oauth...\n');
execSync(`node ${outfile}`, { stdio: 'inherit' });

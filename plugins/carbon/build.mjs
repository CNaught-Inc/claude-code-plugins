import { execSync } from 'node:child_process';
import { chmodSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, 'dist');

// Load env files: .env.local overrides .env (like Next.js)
// Priority: shell env > .env.local > .env
function loadEnvFile(filePath) {
    if (!existsSync(filePath)) return;
    console.log(`Loading ${filePath}...`);
    const content = readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        // Strip surrounding quotes
        if ((value.startsWith("'") && value.endsWith("'")) ||
            (value.startsWith('"') && value.endsWith('"'))) {
            value = value.slice(1, -1);
        }
        if (!process.env[key]) {
            process.env[key] = value;
        }
    }
}

// .env.local takes priority over .env (loaded first so it's not overridden)
loadEnvFile(resolve(__dirname, '.env.local'));
loadEnvFile(resolve(__dirname, '.env'));

// Clean dist
if (existsSync(distDir)) {
    rmSync(distDir, { recursive: true });
}

// Type check
console.log('Type checking...');
try {
    execSync('npx tsc --noEmit', { cwd: __dirname, stdio: 'inherit' });
} catch {
    process.exit(1);
}

// Entry points
const entryPoints = [
    { in: 'src/hooks/session-start.ts', out: 'hooks/session-start' },
    { in: 'src/hooks/stop.ts', out: 'hooks/stop' },
    { in: 'src/hooks/session-end.ts', out: 'hooks/session-end' },
    { in: 'src/scripts/carbon-setup.ts', out: 'scripts/carbon-setup' },
    { in: 'src/scripts/carbon-status.ts', out: 'scripts/carbon-status' },
    { in: 'src/scripts/carbon-sync.ts', out: 'scripts/carbon-sync' },
    { in: 'src/scripts/carbon-report.ts', out: 'scripts/carbon-report' },
    { in: 'src/scripts/browser-oauth.ts', out: 'scripts/browser-oauth' },
    { in: 'src/scripts/carbon-create-org.ts', out: 'scripts/carbon-create-org' },
    { in: 'src/scripts/carbon-uninstall.ts', out: 'scripts/carbon-uninstall' },
    { in: 'src/statusline/carbon-statusline.ts', out: 'statusline/carbon-statusline' },
];

// Bake environment variables into the bundle at build time.
// Values from the build environment become hardcoded defaults in the output.
const define = {};
for (const key of [
    'CNAUGHT_AUTH0_DOMAIN',
    'CNAUGHT_AUTH0_CLIENT_ID',
    'CNAUGHT_AUTH0_AUDIENCE',
    'CNAUGHT_API_URL',
    'CNAUGHT_SKIP_TLS_VERIFY',
    'CNAUGHT_APP_URL',
]) {
    if (process.env[key]) {
        define[`process.env.${key}`] = JSON.stringify(process.env[key]);
    }
}

// Bundle with esbuild
console.log('Bundling...');
await esbuild.build({
    entryPoints: entryPoints.map((ep) => ({
        in: resolve(__dirname, ep.in),
        out: ep.out,
    })),
    outdir: distDir,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    external: ['bun:sqlite'],
    banner: { js: '#!/usr/bin/env node' },
    sourcemap: true,
    define,
});

// Set execute permissions on all output JS files
for (const ep of entryPoints) {
    const outFile = resolve(distDir, ep.out + '.js');
    chmodSync(outFile, 0o755);
}

console.log('Build complete.');

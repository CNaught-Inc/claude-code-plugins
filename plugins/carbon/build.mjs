import { execSync } from 'node:child_process';
import { chmodSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, 'dist');

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
    { in: 'src/scripts/carbon-setup.ts', out: 'scripts/carbon-setup' },
    { in: 'src/scripts/carbon-status.ts', out: 'scripts/carbon-status' },
    { in: 'src/scripts/carbon-report.ts', out: 'scripts/carbon-report' },
    { in: 'src/scripts/carbon-uninstall.ts', out: 'scripts/carbon-uninstall' },
    { in: 'src/statusline/carbon-statusline.ts', out: 'statusline/carbon-statusline' },
];

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
});

// Set execute permissions on all output JS files
for (const ep of entryPoints) {
    const outFile = resolve(distDir, ep.out + '.js');
    chmodSync(outFile, 0o755);
}

console.log('Build complete.');

/**
 * Loads .env.local from the plugin root if it exists.
 *
 * Replaces bun's --env-file flag so we can invoke scripts via
 * `npx -y bun` without npx intercepting the flag.
 *
 * IMPORTANT: This must be imported before any code that reads process.env.
 * It only uses node: built-ins (no npm dependencies).
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const envPath = resolve(pluginRoot, '.env.local');

try {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed.slice(eqIndex + 1).trim();
        // Bun exposes NODE_TLS_REJECT_UNAUTHORIZED as a key with value undefined,
        // so check the value too, not just key presence
        if (!process.env[key]) {
            process.env[key] = value;
        }
    }
} catch {
    // .env.local is optional — production doesn't need it
}

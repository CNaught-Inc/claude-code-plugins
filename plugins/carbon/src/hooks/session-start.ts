/**
 * Session Start Hook
 *
 * Initializes the carbon tracker when a Claude Code session starts.
 * - Ensures database exists and schema is up to date
 * - Non-blocking (errors logged but don't fail the hook)
 */

import '../utils/load-env';

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { z } from 'zod';

import { getClaudeDir, withDatabase } from '../data-store';
import { updateStatuslinePath } from '../scripts/setup-helpers';
import { batchSyncIfEnabled } from '../sync';
import { log, logError, readStdinJson, runHook, SessionStartInputSchema } from '../utils/stdin';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

async function main(): Promise<void> {
    try {
        // Read input from stdin
        let input: z.infer<typeof SessionStartInputSchema>;
        try {
            input = await readStdinJson(SessionStartInputSchema);
            log(`Session started: ${input.session_id}`);
        } catch {
            // Input might not be provided, that's ok
            log('Session started (no input provided)');
        }

        // Initialize database
        withDatabase(() => {
            log('Database initialized');
        });

        // Update statusline path if plugin root has changed (e.g., after version update)
        try {
            const settingsPath = path.join(getClaudeDir(), 'settings.json');
            if (updateStatuslinePath(settingsPath, pluginRoot)) {
                log('Updated statusline path to current plugin version');
            }
        } catch {
            // Non-critical
        }

        // Batch sync any sessions that failed to sync previously
        await batchSyncIfEnabled();
    } catch (error) {
        // Log error but don't fail the hook
        logError('Failed to initialize', error);
    }
}

runHook(main);

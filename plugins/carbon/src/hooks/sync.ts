/**
 * Sync Hook (Async)
 *
 * Syncs the current session to the CNaught API after each Claude response.
 * Runs as an async hook — Claude Code continues immediately without waiting.
 *
 * This is separate from stop.ts (local DB save) so the two operations
 * are independent: local save is synchronous, API sync is background.
 */

import { syncSessionIfEnabled } from '../sync';
import { log, readStdinJson, runHook, StopInputSchema } from '../utils/stdin';

async function main(): Promise<void> {
    let input;
    try {
        input = await readStdinJson(StopInputSchema);
    } catch {
        log('No input received, skipping sync');
        return;
    }

    await syncSessionIfEnabled(input.session_id);
}

runHook(main);

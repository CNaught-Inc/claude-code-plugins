/**
 * Session Start Hook
 *
 * Initializes the carbon tracker when a Claude Code session starts.
 * - Ensures database exists and schema is up to date
 * - Non-blocking (errors logged but don't fail the hook)
 */

import { initializeDatabase, openDatabase } from '../data-store.js';
import { log, logError, readStdinJson, SessionStartInputSchema } from '../utils/stdin.js';

async function main(): Promise<void> {
    try {
        // Read input from stdin
        let input;
        try {
            input = await readStdinJson(SessionStartInputSchema);
            log(`Session started: ${input.session_id}`);
        } catch {
            // Input might not be provided, that's ok
            log('Session started (no input provided)');
        }

        // Initialize database
        const db = openDatabase();
        try {
            initializeDatabase(db);
            log('Database initialized');
        } finally {
            db.close();
        }
    } catch (error) {
        // Log error but don't fail the hook
        logError('Failed to initialize', error);
    }
}

main().catch((error) => {
    logError('Unexpected error', error);
    // Exit cleanly even on error
    process.exit(0);
});

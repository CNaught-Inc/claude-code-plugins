/**
 * Stop Hook
 *
 * Saves session data to local SQLite database after each Claude response.
 * - Parses transcript log for token usage (including subagents)
 * - Calculates CO2 emissions
 * - Upserts session record in local database
 *
 * Runs after every Claude response, providing incremental saves.
 * If session crashes or user force-quits, data up to last response is preserved.
 */

import { calculateSessionCarbon } from '../carbon-calculator.js';
import { initializeDatabase, openDatabase, upsertSession } from '../data-store.js';
import { findTranscriptPath, parseSession } from '../session-parser.js';
import { log, logError, readStdinJson, StopInputSchema } from '../utils/stdin.js';

async function main(): Promise<void> {
    try {
        // Read input from stdin
        let input;
        try {
            input = await readStdinJson(StopInputSchema);
        } catch {
            // If no input, we can't do anything
            log('No input received, skipping');
            return;
        }

        const { session_id, project_path, transcript_path } = input;

        // Find the transcript file
        const actualTranscriptPath =
            transcript_path || findTranscriptPath(session_id, project_path);

        if (!actualTranscriptPath) {
            log(`No transcript found for session ${session_id}`);
            return;
        }

        // Parse the session
        const sessionUsage = parseSession(actualTranscriptPath);

        if (sessionUsage.totals.totalTokens === 0) {
            log(`No token usage found for session ${session_id}`);
            return;
        }

        // Calculate carbon emissions
        const carbon = calculateSessionCarbon(sessionUsage);

        // Open database and save
        const db = openDatabase();
        try {
            initializeDatabase(db);

            upsertSession(db, {
                sessionId: session_id,
                projectPath: sessionUsage.projectPath,
                inputTokens: sessionUsage.totals.inputTokens,
                outputTokens: sessionUsage.totals.outputTokens,
                cacheCreationTokens: sessionUsage.totals.cacheCreationTokens,
                cacheReadTokens: sessionUsage.totals.cacheReadTokens,
                totalTokens: sessionUsage.totals.totalTokens,
                energyWh: carbon.energy.energyWh,
                co2Grams: carbon.co2Grams,
                primaryModel: sessionUsage.primaryModel,
                createdAt: sessionUsage.createdAt,
                updatedAt: sessionUsage.updatedAt
            });

            log(
                `Saved session ${session_id}: ${sessionUsage.totals.totalTokens} tokens, ${carbon.co2Grams.toFixed(3)}g CO2`
            );
        } finally {
            db.close();
        }
    } catch (error) {
        // Log error but don't fail the hook
        logError('Failed to save session', error);
    }
}

main().catch((error) => {
    logError('Unexpected error', error);
    // Exit cleanly even on error
    process.exit(0);
});

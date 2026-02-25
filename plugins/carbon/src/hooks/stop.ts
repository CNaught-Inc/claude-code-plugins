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

import '../utils/load-env';

import { calculateSessionCarbon } from '../carbon-calculator';
import { withDatabase } from '../data-store';
import { saveSessionToDb } from '../session-db';
import { findTranscriptPath, parseSession } from '../session-parser';
import { log, logError, readStdinJson, runHook, StopInputSchema } from '../utils/stdin';

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
        const sessionUsage = parseSession(actualTranscriptPath, project_path);

        if (sessionUsage.totals.totalTokens === 0) {
            log(`No token usage found for session ${session_id}`);
            return;
        }

        // Calculate carbon emissions
        const carbon = calculateSessionCarbon(sessionUsage);

        // Save to database
        withDatabase((db) => {
            saveSessionToDb(db, session_id, sessionUsage, carbon);

            log(
                `Saved session ${session_id}: ${sessionUsage.totals.totalTokens} tokens, ${carbon.co2Grams.toFixed(3)}g CO2`
            );
        });
    } catch (error) {
        // Log error but don't fail the hook
        logError('Failed to save session', error);
    }
}

runHook(main);

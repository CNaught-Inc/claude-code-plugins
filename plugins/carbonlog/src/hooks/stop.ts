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

import type { z } from 'zod';

import { calculateSessionCarbon } from '../carbonlog-calculator';
import { withDatabase } from '../data-store';
import { saveSessionToDb } from '../session-db';
import {
    findTranscriptPath,
    isAgentSessionId,
    parseSession,
    resolveSessionId
} from '../session-parser';
import { log, logError, readStdinJson, runHook, StopInputSchema } from '../utils/stdin';

async function main(): Promise<void> {
    try {
        // Read input from stdin
        let input: Awaited<z.infer<typeof StopInputSchema>>;
        try {
            input = await readStdinJson(StopInputSchema);
        } catch {
            // If no input, we can't do anything
            log('No input received, skipping');
            return;
        }

        const { session_id, project_path, transcript_path } = input;

        // Resolve agent session IDs to their parent session UUID.
        // Agent transcripts are merged into the parent session by parseSession(),
        // so we want to save under the parent's UUID.
        let effectiveSessionId = session_id;
        let actualTranscriptPath = transcript_path ?? null;

        if (isAgentSessionId(session_id)) {
            const resolved = resolveSessionId(session_id, project_path);
            if (!resolved) {
                log(`Skipping agent session ${session_id} — could not resolve parent`);
                return;
            }
            effectiveSessionId = resolved.sessionId;
            actualTranscriptPath = resolved.transcriptPath;
            log(`Resolved agent ${session_id} → parent ${effectiveSessionId}`);
        } else {
            actualTranscriptPath =
                actualTranscriptPath ?? findTranscriptPath(session_id, project_path);
        }

        if (!actualTranscriptPath) {
            log(`No transcript found for session ${session_id}`);
            return;
        }

        // Parse the session
        const sessionUsage = parseSession(actualTranscriptPath, project_path);

        if (sessionUsage.totals.totalTokens === 0) {
            log(`No token usage found for session ${effectiveSessionId}`);
            return;
        }

        // Calculate carbon emissions
        const carbon = calculateSessionCarbon(sessionUsage);

        // Save to database under the parent session UUID
        withDatabase((db) => {
            saveSessionToDb(db, effectiveSessionId, sessionUsage, carbon);

            log(
                `Saved session ${effectiveSessionId}: ${sessionUsage.totals.totalTokens} tokens, ${carbon.co2Grams.toFixed(3)}g CO2`
            );
        });
    } catch (error) {
        // Log error but don't fail the hook
        logError('Failed to save session', error);
    }
}

runHook(main);

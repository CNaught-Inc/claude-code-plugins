/**
 * Session Database Helpers
 *
 * Shared logic for saving parsed session data to the database.
 * Separated from data-store.ts to avoid circular imports
 * (session-parser → data-store, but this file → both).
 */

import type { Database } from 'bun:sqlite';

import type { CarbonResult } from './carbon-calculator';
import { upsertSession } from './data-store';
import type { SessionUsage } from './session-parser';

/**
 * Save a parsed session and its carbon result to the database.
 * Shared between the stop hook (incremental saves) and backfill (setup).
 */
export function saveSessionToDb(
    db: Database,
    sessionId: string,
    sessionUsage: SessionUsage,
    carbon: CarbonResult
): void {
    upsertSession(db, {
        sessionId,
        projectPath: sessionUsage.projectPath,
        projectIdentifier: sessionUsage.projectIdentifier,
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
}

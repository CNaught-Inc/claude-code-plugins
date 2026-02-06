/**
 * Session End Hook
 *
 * Recovers orphaned sessions and syncs to CNaught backend when session terminates.
 *
 * Flow:
 * 1. Scan for orphaned transcripts (files without matching DB records)
 * 2. Parse and save orphaned sessions to local DB (recovers crashed sessions)
 * 3. If authenticated with MCP server: sync all unsynced sessions
 * 4. Display session summary showing emissions and sync status
 */

import { calculateSessionCarbon, formatCO2 } from '../carbon-calculator.js';
import {
    getAggregateStats,
    getAllSessionIds,
    getAuthConfig,
    getInstalledAt,
    getSession,
    getUnsyncedSessions,
    initializeDatabase,
    markSessionSynced,
    openDatabase,
    upsertSession
} from '../data-store.js';
import {
    findAllTranscripts,
    getSessionIdFromPath,
    parseSession
} from '../session-parser.js';
import {
    formatRelativeTime,
    isIntegrationConfigured,
    refreshTokenIfNeeded,
    resolveOrganizationId,
    syncSessions
} from '../sync-service.js';
import { log, logError, readStdinJson, SessionEndInputSchema } from '../utils/stdin.js';

/**
 * Recover orphaned sessions created after the plugin was installed.
 * Sessions created before `installedAt` are skipped unless a historical
 * sync was explicitly requested during setup.
 */
function recoverOrphanedSessions(db: ReturnType<typeof openDatabase>): number {
    const installedAt = getInstalledAt(db);
    const existingSessionIds = new Set(getAllSessionIds(db));
    const transcripts = findAllTranscripts();
    let recoveredCount = 0;

    for (const transcriptPath of transcripts) {
        const sessionId = getSessionIdFromPath(transcriptPath);

        // Skip if already in database
        if (existingSessionIds.has(sessionId)) {
            continue;
        }

        try {
            // Parse and save the orphaned session
            const sessionUsage = parseSession(transcriptPath);

            if (sessionUsage.totals.totalTokens === 0) {
                continue;
            }

            // Skip sessions created before the plugin was installed
            if (installedAt && sessionUsage.createdAt < installedAt) {
                continue;
            }

            const carbon = calculateSessionCarbon(sessionUsage);

            upsertSession(db, {
                sessionId,
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

            recoveredCount++;
            log(`Recovered orphaned session: ${sessionId}`);
        } catch (error) {
            logError(`Failed to recover session ${sessionId}`, error);
        }
    }

    return recoveredCount;
}

/**
 * Display session summary
 */
function displaySummary(
    db: ReturnType<typeof openDatabase>,
    sessionId: string,
    syncResults: { synced: number; failed: number }
): void {
    const session = getSession(db, sessionId);
    const stats = getAggregateStats(db);

    console.log('\n');
    console.log('========================================');
    console.log('  CNaught Carbon Tracker - Session End  ');
    console.log('========================================');

    if (session) {
        console.log('\nThis Session:');
        console.log(`  Tokens: ${session.totalTokens.toLocaleString()}`);
        console.log(`  Energy: ${session.energyWh.toFixed(3)} Wh`);
        console.log(`  CO2: ${formatCO2(session.co2Grams)}`);
        console.log(`  Model: ${session.primaryModel}`);
    }

    console.log('\nAll-Time Statistics:');
    console.log(`  Sessions: ${stats.totalSessions.toLocaleString()}`);
    console.log(`  Total CO2: ${formatCO2(stats.totalCO2Grams)}`);

    if (isIntegrationConfigured(db)) {
        console.log('\nBackend Sync:');
        if (syncResults.synced > 0) {
            console.log(`  Synced: ${syncResults.synced} session(s)`);
        }
        if (syncResults.failed > 0) {
            console.log(`  Failed: ${syncResults.failed} session(s) (will retry next session)`);
        }
        if (stats.unsyncedSessions > 0) {
            console.log(`  Pending: ${stats.unsyncedSessions} session(s) to sync`);
        } else {
            console.log('  All sessions synced!');
        }
    } else {
        console.log('\nBackend: Not configured');
        console.log('  Run /carbon:setup to enable auto-offset');
    }

    console.log('========================================\n');
}

async function main(): Promise<void> {
    let sessionId = 'unknown';

    try {
        // Read input from stdin
        let input;
        try {
            input = await readStdinJson(SessionEndInputSchema);
            sessionId = input.session_id;
        } catch {
            log('No input received');
        }

        log(`Session ending: ${sessionId}`);

        // Open database
        const db = openDatabase();
        try {
            initializeDatabase(db);

            // 1. Recover orphaned sessions
            const recovered = recoverOrphanedSessions(db);
            if (recovered > 0) {
                log(`Recovered ${recovered} orphaned session(s)`);
            }

            // 2. Sync to backend if configured
            let syncResults = { synced: 0, failed: 0 };

            const authConfig = getAuthConfig(db);
            if (authConfig) {
                try {
                    // Refresh token if needed
                    const validConfig = await refreshTokenIfNeeded(db, authConfig);
                    const organizationId = await resolveOrganizationId(db, validConfig);
                    const installedAt = getInstalledAt(db);
                    const unsyncedSessions = getUnsyncedSessions(db, installedAt);

                    if (unsyncedSessions.length > 0) {
                        log(`Syncing ${unsyncedSessions.length} session(s) to backend...`);

                        const results = await syncSessions(unsyncedSessions, validConfig, organizationId);

                        for (const result of results) {
                            if (result.success) {
                                markSessionSynced(db, result.sessionId);
                                syncResults.synced++;
                            } else {
                                logError(
                                    `Failed to sync session ${result.sessionId}`,
                                    new Error(result.error)
                                );
                                syncResults.failed++;
                            }
                        }
                    }
                } catch (error) {
                    logError('Sync failed', error);
                }
            }

            // 3. Display summary
            displaySummary(db, sessionId, syncResults);
        } finally {
            db.close();
        }
    } catch (error) {
        logError('Failed to complete session end', error);
    }
}

main().catch((error) => {
    logError('Unexpected error', error);
    process.exit(0);
});

/**
 * Carbon Sync Script
 *
 * Utility for syncing sessions to the backend and managing sync state.
 *
 * Usage:
 *   node carbon-sync.js              - Sync all unsynced sessions to backend (default)
 *   node carbon-sync.js sync         - Same as above
 *   node carbon-sync.js sync-all     - Recover ALL historical sessions and sync them
 *   node carbon-sync.js export       - Output unsynced sessions as JSON
 *   node carbon-sync.js mark-synced ID  - Mark a session as synced
 *   node carbon-sync.js status       - Show sync status summary
 */

import { calculateSessionCarbon, formatCO2 } from '../carbon-calculator.js';
import {
    getAggregateStats,
    getAllSessionIds,
    getAuthConfig,
    getInstalledAt,
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
    refreshTokenIfNeeded,
    resolveOrganizationId,
    syncSessions
} from '../sync-service.js';
import { log, logError } from '../utils/stdin.js';

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const mode = args[0] || 'sync';

    try {
        const db = openDatabase();
        initializeDatabase(db);

        try {
            if (mode === 'sync') {
                // Sync unsynced sessions (created after install) to the backend
                const authConfig = getAuthConfig(db);
                if (!authConfig) {
                    console.error('Not authenticated. Run /carbon:setup first.');
                    process.exit(1);
                }

                const installedAt = getInstalledAt(db);
                const sessions = getUnsyncedSessions(db, installedAt);
                if (sessions.length === 0) {
                    console.log('All sessions are already synced.');
                    return;
                }

                console.log(`Syncing ${sessions.length} session(s) to backend...`);

                // Refresh token if needed
                const freshAuth = await refreshTokenIfNeeded(db, authConfig);

                // Resolve organization ID
                const organizationId = await resolveOrganizationId(db, freshAuth);

                // Sync sessions
                const results = await syncSessions(sessions, freshAuth, organizationId);

                // Mark successful syncs
                let successCount = 0;
                let failCount = 0;
                for (const result of results) {
                    if (result.success) {
                        markSessionSynced(db, result.sessionId);
                        successCount++;
                    } else {
                        console.error(`Failed to sync ${result.sessionId}: ${result.error}`);
                        failCount++;
                    }
                }

                console.log(`Synced ${successCount} session(s) successfully.`);
                if (failCount > 0) {
                    console.error(`Failed to sync ${failCount} session(s).`);
                    process.exit(1);
                }
            } else if (mode === 'sync-all') {
                // Recover all historical sessions, then sync to backend
                console.log('Recovering all historical sessions...');
                const existingIds = new Set(getAllSessionIds(db));
                const transcripts = findAllTranscripts();
                let recoveredCount = 0;

                for (const transcriptPath of transcripts) {
                    const sessionId = getSessionIdFromPath(transcriptPath);
                    if (existingIds.has(sessionId)) continue;

                    try {
                        const sessionUsage = parseSession(transcriptPath);
                        if (sessionUsage.totals.totalTokens === 0) continue;

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
                    } catch (error) {
                        logError(`Failed to recover session ${sessionId}`, error);
                    }
                }

                console.log(`Recovered ${recoveredCount} historical session(s).`);

                // Now sync all unsynced to backend
                const authConfig = getAuthConfig(db);
                if (!authConfig) {
                    console.log('Not authenticated — sessions saved locally but not synced to backend.');
                    return;
                }

                const sessions = getUnsyncedSessions(db);
                if (sessions.length === 0) {
                    console.log('All sessions are already synced.');
                    return;
                }

                console.log(`Syncing ${sessions.length} session(s) to backend (this may take a moment)...`);
                const freshAuth = await refreshTokenIfNeeded(db, authConfig);
                const organizationId = await resolveOrganizationId(db, freshAuth);
                const results = await syncSessions(sessions, freshAuth, organizationId);

                let successCount = 0;
                let failCount = 0;
                for (const result of results) {
                    if (result.success) {
                        markSessionSynced(db, result.sessionId);
                        successCount++;
                    } else {
                        console.error(`Failed to sync ${result.sessionId}: ${result.error}`);
                        failCount++;
                    }
                }

                console.log(`Synced ${successCount} session(s) successfully.`);
                if (failCount > 0) {
                    console.error(`Failed to sync ${failCount} session(s).`);
                    process.exit(1);
                }
            } else if (mode === 'export') {
                const sessions = getUnsyncedSessions(db);

                // Output JSON with field names matching the sync_claude_code_session MCP tool
                const output = sessions.map((s) => ({
                    sessionId: s.sessionId,
                    projectPath: s.projectPath || undefined,
                    co2Grams: s.co2Grams,
                    totalInputTokens: s.inputTokens,
                    totalOutputTokens: s.outputTokens,
                    totalCacheCreationTokens: s.cacheCreationTokens,
                    totalCacheReadTokens: s.cacheReadTokens,
                    energyWh: s.energyWh
                }));

                console.log(JSON.stringify(output, null, 2));
            } else if (mode === 'mark-synced') {
                const sessionId = args[1];
                if (!sessionId) {
                    console.error('Usage: carbon-sync.js mark-synced <sessionId>');
                    process.exit(1);
                }

                markSessionSynced(db, sessionId);
                console.log(JSON.stringify({ success: true, sessionId }));
            } else if (mode === 'status') {
                const stats = getAggregateStats(db);
                const authConfig = getAuthConfig(db);

                console.log(
                    JSON.stringify({
                        unsyncedSessions: stats.unsyncedSessions,
                        totalSessions: stats.totalSessions,
                        totalCO2Grams: stats.totalCO2Grams,
                        totalCO2Formatted: formatCO2(stats.totalCO2Grams),
                        authConfigured: authConfig !== null,
                        organizationId: authConfig?.organizationId ?? null
                    })
                );
            } else {
                console.error(`Unknown mode: ${mode}`);
                console.error('Usage: carbon-sync.js [sync|export|mark-synced|status]');
                process.exit(1);
            }
        } finally {
            db.close();
        }
    } catch (error) {
        logError('Sync script failed', error);
        process.exit(1);
    }
}

main().catch((error) => {
    logError('Sync script failed', error);
    process.exit(1);
});

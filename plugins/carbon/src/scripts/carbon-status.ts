/**
 * Carbon Status Script
 *
 * Displays current carbon tracking status including:
 * - Local statistics (sessions, tokens, CO2)
 * - MCP integration status
 */

import { formatCO2, formatEnergy } from '../carbon-calculator.js';
import { getAggregateStats, getAuthConfig, initializeDatabase, openDatabase } from '../data-store.js';
import { formatRelativeTime, isIntegrationConfigured } from '../sync-service.js';
import { logError } from '../utils/stdin.js';

/**
 * Format large numbers with commas
 */
function formatNumber(num: number): string {
    return num.toLocaleString();
}

async function main(): Promise<void> {
    console.log('\n');
    console.log('========================================');
    console.log('  CNaught Carbon Tracker Status        ');
    console.log('========================================');
    console.log('\n');

    // Get local statistics
    try {
        const db = openDatabase();
        initializeDatabase(db);
        const stats = getAggregateStats(db);
        const authConfig = getAuthConfig(db);
        db.close();

        console.log('Local Statistics:');
        console.log('----------------------------------------');
        console.log(`  Sessions tracked:    ${formatNumber(stats.totalSessions)}`);
        console.log(`  Total tokens:        ${formatNumber(stats.totalTokens)}`);
        console.log(`    Input:             ${formatNumber(stats.totalInputTokens)}`);
        console.log(`    Output:            ${formatNumber(stats.totalOutputTokens)}`);
        console.log(`    Cache creation:    ${formatNumber(stats.totalCacheCreationTokens)}`);
        console.log(`    Cache read:        ${formatNumber(stats.totalCacheReadTokens)}`);
        console.log(`  Energy consumed:     ${formatEnergy(stats.totalEnergyWh)}`);
        console.log(`  CO2 emitted:         ${formatCO2(stats.totalCO2Grams)}`);
        console.log('');

        // Backend integration status
        console.log('Backend Integration:');
        console.log('----------------------------------------');
        if (authConfig) {
            const now = new Date();
            const accessExpired = authConfig.accessTokenExpiresAt < now;
            const refreshExpired = authConfig.refreshTokenExpiresAt < now;

            if (authConfig.organizationId) {
                console.log(`  Organization:        ${authConfig.organizationId}`);
            }
            if (refreshExpired) {
                console.log('  Status:              Token expired');
                console.log('  Run /carbon:setup to re-authenticate');
            } else if (accessExpired) {
                console.log('  Status:              Connected (will auto-refresh)');
            } else {
                console.log('  Status:              Connected');
            }
            console.log(`  Last updated:        ${formatRelativeTime(authConfig.updatedAt)}`);
            console.log('');

            console.log('Sync Status:');
            console.log('----------------------------------------');
            console.log(`  Unsynced sessions:   ${formatNumber(stats.unsyncedSessions)}`);
            if (stats.oldestUnsyncedAt) {
                console.log(
                    `  Oldest unsynced:     ${formatRelativeTime(stats.oldestUnsyncedAt)}`
                );
            }
        } else {
            console.log('  Status:              Not configured');
            console.log('');
            console.log('  To enable backend integration:');
            console.log('    Run /carbon:setup to authenticate with CNaught');
        }

        console.log('');
        console.log('========================================');
        console.log('\n');
    } catch (error) {
        logError('Failed to get status', error);
        console.log('  Error: Failed to retrieve status');
        console.log('  Run /carbon:setup to initialize the tracker');
        console.log('\n');
    }
}

main().catch((error) => {
    logError('Status command failed', error);
    process.exit(1);
});

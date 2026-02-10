/**
 * Carbon Status Script
 *
 * Displays current carbon tracking status including:
 * - Local statistics (sessions, tokens, CO2)
 */

import { formatCO2, formatEnergy } from '../carbon-calculator.js';
import { getAggregateStats, initializeDatabase, openDatabase } from '../data-store.js';
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

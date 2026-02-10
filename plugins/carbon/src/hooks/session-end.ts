/**
 * Session End Hook
 *
 * Displays session summary when session terminates.
 */

import { formatCO2 } from '../carbon-calculator.js';
import {
    getAggregateStats,
    getSession,
    initializeDatabase,
    openDatabase
} from '../data-store.js';
import { log, logError, readStdinJson, SessionEndInputSchema } from '../utils/stdin.js';

/**
 * Display session summary
 */
function displaySummary(
    db: ReturnType<typeof openDatabase>,
    sessionId: string
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

            // Display summary
            displaySummary(db, sessionId);
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

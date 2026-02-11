/**
 * Session End Hook
 *
 * Displays session summary when session terminates.
 */

import { formatCO2 } from '../carbon-calculator.js';
import {
    encodeProjectPath,
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
    sessionId: string,
    projectPath?: string
): void {
    const session = getSession(db, sessionId);
    const stats = getAggregateStats(db, projectPath);

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

    console.log('\nProject Statistics:');
    console.log(`  Sessions: ${stats.totalSessions.toLocaleString()}`);
    console.log(`  Total CO2: ${formatCO2(stats.totalCO2Grams)}`);

    console.log('========================================\n');
}

async function main(): Promise<void> {
    let sessionId = 'unknown';
    let projectPath: string | undefined;

    try {
        // Read input from stdin
        let input;
        try {
            input = await readStdinJson(SessionEndInputSchema);
            sessionId = input.session_id;
            const rawPath = input.project_path || input.cwd;
            projectPath = rawPath ? encodeProjectPath(rawPath) : undefined;
        } catch {
            log('No input received');
        }

        log(`Session ending: ${sessionId}`);

        // Open database
        const db = openDatabase();
        try {
            initializeDatabase(db);

            // Display summary
            displaySummary(db, sessionId, projectPath);
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

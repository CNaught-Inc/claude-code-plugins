/**
 * Carbon Report Script
 *
 * Generates a carbon emissions report for recent usage:
 * - 7-day summary
 * - Daily breakdown with chart
 * - Relatable equivalents
 * - Project breakdown
 */

import {
    calculateEquivalents,
    formatCO2,
    formatEnergy
} from '../carbon-calculator.js';
import {
    getDailyStats,
    getProjectStats,
    initializeDatabase,
    openDatabase
} from '../data-store.js';
import { logError } from '../utils/stdin.js';

/**
 * Format large numbers with commas
 */
function formatNumber(num: number): string {
    return num.toLocaleString();
}

/**
 * Generate a simple ASCII bar chart
 */
function generateBar(value: number, maxValue: number, maxWidth: number = 20): string {
    if (maxValue === 0) return '';
    const width = Math.round((value / maxValue) * maxWidth);
    return '#'.repeat(Math.max(1, width));
}

/**
 * Format a day name from date string
 */
function formatDayName(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short' });
}

/**
 * Get a clean project name from path
 */
function getProjectName(projectPath: string): string {
    // Remove common prefixes and extract last meaningful part
    const parts = projectPath.split(/[-/]/);
    // Try to find a meaningful name
    for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i];
        if (part && part.length > 1 && !part.includes('Users') && !part.includes('home')) {
            return part;
        }
    }
    return projectPath.slice(0, 30);
}

async function main(): Promise<void> {
    console.log('\n');
    console.log('========================================');
    console.log('  CNaught Carbon Emissions Report      ');
    console.log('  Last 7 Days                          ');
    console.log('========================================');
    console.log('\n');

    try {
        const db = openDatabase();
        initializeDatabase(db);

        // Get daily stats
        const dailyStats = getDailyStats(db, 7);

        // Get project stats
        const projectStats = getProjectStats(db, 7);

        db.close();

        // Calculate totals
        const totals = dailyStats.reduce(
            (acc, day) => ({
                sessions: acc.sessions + day.sessions,
                tokens: acc.tokens + day.tokens,
                energyWh: acc.energyWh + day.energyWh,
                co2Grams: acc.co2Grams + day.co2Grams
            }),
            { sessions: 0, tokens: 0, energyWh: 0, co2Grams: 0 }
        );

        // Summary section
        console.log('Summary:');
        console.log('----------------------------------------');
        console.log(`  Sessions:      ${formatNumber(totals.sessions)}`);
        console.log(`  Tokens:        ${formatNumber(totals.tokens)}`);
        console.log(`  Energy:        ${formatEnergy(totals.energyWh)}`);
        console.log(`  CO2:           ${formatCO2(totals.co2Grams)}`);
        console.log('');

        // Equivalents section
        if (totals.co2Grams > 0) {
            const equivalents = calculateEquivalents(totals.co2Grams);

            console.log('Equivalents:');
            console.log('----------------------------------------');
            console.log('  This is roughly equivalent to:');

            if (equivalents.kmDriven >= 0.01) {
                console.log(`    - Driving ${equivalents.kmDriven.toFixed(2)} km in a car`);
            }
            if (equivalents.phoneCharges >= 0.1) {
                console.log(
                    `    - Charging your phone ${equivalents.phoneCharges.toFixed(1)} times`
                );
            }
            if (equivalents.ledLightHours >= 1) {
                console.log(
                    `    - Running an LED bulb for ${Math.round(equivalents.ledLightHours)} minutes`
                );
            }
            if (equivalents.googleSearches >= 1) {
                console.log(
                    `    - ${Math.round(equivalents.googleSearches)} Google searches`
                );
            }

            console.log('');
        }

        // Daily breakdown
        if (dailyStats.length > 0) {
            const maxCO2 = Math.max(...dailyStats.map((d) => d.co2Grams));

            console.log('Daily Breakdown:');
            console.log('----------------------------------------');

            for (const day of dailyStats) {
                const dayName = formatDayName(day.date).padEnd(4);
                const co2Str = formatCO2(day.co2Grams).padStart(8);
                const bar = generateBar(day.co2Grams, maxCO2);
                console.log(`  ${dayName} ${co2Str}  ${bar}`);
            }

            console.log('');
        } else {
            console.log('Daily Breakdown:');
            console.log('----------------------------------------');
            console.log('  No data for the last 7 days');
            console.log('');
        }

        // Project breakdown
        if (projectStats.length > 0) {
            const totalProjectCO2 = projectStats.reduce((sum, p) => sum + p.co2Grams, 0);

            console.log('Projects:');
            console.log('----------------------------------------');

            // Show top 5 projects
            const topProjects = projectStats.slice(0, 5);

            for (const project of topProjects) {
                const name = getProjectName(project.projectPath).padEnd(25);
                const co2Str = formatCO2(project.co2Grams).padStart(8);
                const percent =
                    totalProjectCO2 > 0
                        ? `(${Math.round((project.co2Grams / totalProjectCO2) * 100)}%)`
                        : '';
                console.log(`  ${name} ${co2Str} ${percent}`);
            }

            if (projectStats.length > 5) {
                const otherCO2 = projectStats.slice(5).reduce((sum, p) => sum + p.co2Grams, 0);
                const otherPercent =
                    totalProjectCO2 > 0
                        ? `(${Math.round((otherCO2 / totalProjectCO2) * 100)}%)`
                        : '';
                console.log(
                    `  ${'other'.padEnd(25)} ${formatCO2(otherCO2).padStart(8)} ${otherPercent}`
                );
            }

            console.log('');
        }

        console.log('========================================');
        console.log('\n');
        console.log('Tip: Run /carbon:setup to enable automatic');
        console.log('     carbon offset purchases via CNaught.');
        console.log('\n');
    } catch (error) {
        logError('Failed to generate report', error);
        console.log('  Error: Failed to generate report');
        console.log('  Run /carbon:setup to initialize the tracker');
        console.log('\n');
    }
}

main().catch((error) => {
    logError('Report command failed', error);
    process.exit(1);
});

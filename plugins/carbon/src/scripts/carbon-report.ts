/**
 * Carbon Report Script
 *
 * Generates a visual climate impact report with terminal graphs.
 */

import '../utils/load-env';

import { formatCO2, formatEnergy } from '../carbon-calculator';
import {
    getAggregateStats,
    getConfig,
    getDailyStats,
    getDatabasePath,
    getProjectStats,
    getUnsyncedSessions,
    withDatabase
} from '../data-store';
import { resolveProjectIdentifier } from '../project-identifier';
import { logError } from '../utils/stdin';

// ── ANSI helpers ──────────────────────────────────────────────

const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
    gray: '\x1b[38;5;242m',
};

// ── Formatting helpers ────────────────────────────────────────

function fmt(num: number): string {
    return num.toLocaleString();
}

function kg(grams: number): string {
    return (grams / 1000).toFixed(2);
}

function kwh(wh: number): string {
    return (wh / 1000).toFixed(2);
}

function pct(value: number, total: number): string {
    if (total === 0) return '0%';
    return `${Math.round((value / total) * 100)}%`;
}

function formatDayName(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short' });
}

// ── Graph builders ────────────────────────────────────────────

function progressBar(value: number, maxValue: number, width: number = 20, color: string = c.green): string {
    if (maxValue === 0) return `${c.gray}[${'·'.repeat(width)}]${c.reset}`;
    const filled = Math.round((value / maxValue) * width);
    const empty = width - filled;
    return `${c.gray}[${c.reset}${color}${'■'.repeat(filled)}${c.gray}${'·'.repeat(empty)}]${c.reset}`;
}

// ── Model stats query ─────────────────────────────────────────

interface ModelStats {
    model: string;
    sessions: number;
    co2Grams: number;
    energyWh: number;
    tokens: number;
}

function getModelStats(projectIdentifier?: string): ModelStats[] {
    return withDatabase((db) => {
        const projectFilter = projectIdentifier ? 'WHERE project_identifier = ?' : '';
        const stmt = db.prepare(`
            SELECT
                primary_model as model,
                COUNT(*) as sessions,
                COALESCE(SUM(co2_grams), 0) as co2_grams,
                COALESCE(SUM(energy_wh), 0) as energy_wh,
                COALESCE(SUM(total_tokens), 0) as tokens
            FROM sessions
            ${projectFilter}
            GROUP BY primary_model
            ORDER BY co2_grams DESC
        `);

        const rows = (projectIdentifier ? stmt.all(projectIdentifier) : stmt.all()) as Record<string, unknown>[];
        return rows.map((row) => ({
            model: row.model as string,
            sessions: Number(row.sessions),
            co2Grams: Number(row.co2_grams),
            energyWh: Number(row.energy_wh),
            tokens: Number(row.tokens),
        }));
    });
}

// ── Friendly model name ───────────────────────────────────────

function friendlyModelName(modelId: string): string {
    const map: Record<string, string> = {
        'claude-3-haiku-20240307': 'Claude 3 Haiku',
        'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku',
        'claude-haiku-4-5-20251001': 'Claude 4.5 Haiku',
        'claude-sonnet-4-20250514': 'Claude Sonnet 4',
        'claude-sonnet-4-5-20250929': 'Claude 4.5 Sonnet',
        'claude-opus-4-20250514': 'Claude Opus 4',
        'claude-opus-4-1-20250805': 'Claude Opus 4.1',
        'claude-opus-4-6': 'Claude Opus 4.6',
        'claude-sonnet-4-6': 'Claude Sonnet 4.6',
    };
    if (map[modelId]) return map[modelId];
    // Try to extract a readable name from the model ID
    const lower = modelId.toLowerCase();
    if (lower.includes('opus')) return 'Claude Opus';
    if (lower.includes('sonnet')) return 'Claude Sonnet';
    if (lower.includes('haiku')) return 'Claude Haiku';
    return modelId;
}

// ── Main report ───────────────────────────────────────────────

async function main(): Promise<void> {
    try {
        const projectId = resolveProjectIdentifier(process.cwd());

        const { allTimeStats, dailyStats, projectStats, modelStats, syncInfo } = withDatabase((db) => {
            const syncEnabled = getConfig(db, 'sync_enabled') === 'true';
            return {
                allTimeStats: getAggregateStats(db, projectId),
                dailyStats: getDailyStats(db, 7, projectId),
                projectStats: getProjectStats(db, 30),
                modelStats: getModelStats(projectId),
                syncInfo: {
                    enabled: syncEnabled,
                    userName: syncEnabled ? getConfig(db, 'claude_code_user_name') : null,
                    userId: syncEnabled ? getConfig(db, 'claude_code_user_id') : null,
                    pendingCount: syncEnabled ? getUnsyncedSessions(db, 1000).length : 0
                }
            };
        });

        const totalCO2 = allTimeStats.totalCO2Grams;
        const totalEnergy = allTimeStats.totalEnergyWh;

        // ── Header ────────────────────────────────────────────
        console.log('');
        console.log(`${c.bold}  ╔══════════════════════════════════════════════════╗${c.reset}`);
        console.log(`${c.bold}  ║           Climate Impact Report                 ║${c.reset}`);
        console.log(`${c.bold}  ╚══════════════════════════════════════════════════╝${c.reset}`);
        console.log(`${c.dim}  Project: ${projectId}${c.reset}`);
        console.log('');

        // ── Big numbers ───────────────────────────────────────
        console.log(`${c.bold}  All-Time Totals${c.reset}`);
        console.log(`${c.gray}  ──────────────────────────────────────────────────${c.reset}`);
        console.log('');
        console.log(`    ${c.bold}${c.yellow}CO₂${c.reset}    ${c.bold}${kg(totalCO2)}${c.reset} kg    ${c.dim}(${formatCO2(totalCO2)})${c.reset}`);
        console.log(`    ${c.bold}${c.cyan}Energy${c.reset} ${c.bold}${kwh(totalEnergy)}${c.reset} kWh   ${c.dim}(${formatEnergy(totalEnergy)})${c.reset}`);
        console.log(`    ${c.dim}Sessions: ${fmt(allTimeStats.totalSessions)} · Tokens: ${fmt(allTimeStats.totalTokens)}${c.reset}`);
        console.log('');

        // ── Real-world equivalents ────────────────────────────
        if (totalCO2 > 0) {
            console.log(`${c.bold}  What Does This Mean?${c.reset}`);
            console.log(`${c.gray}  ──────────────────────────────────────────────────${c.reset}`);
            console.log('');

            // Constants from CNaught API EquivalentsCalculator
            const KG_PER_CAR_YEAR = 4490;
            const KG_PER_ANNUAL_HOME_ENERGY = 7930;

            const totalKg = totalCO2 / 1000;
            const carsOffRoad = totalKg / KG_PER_CAR_YEAR;
            const homesEnergy = totalKg / KG_PER_ANNUAL_HOME_ENERGY;

            console.log(`    🚗  Cars off road      ${c.bold}${carsOffRoad.toFixed(4)} car-years${c.reset}`);
            console.log(`    🏠  Home energy         ${c.bold}${homesEnergy.toFixed(4)} home-years${c.reset}`);
            console.log('');
        }

        // ── Usage by model ────────────────────────────────────
        if (modelStats.length > 0) {
            const totalModelCO2 = modelStats.reduce((sum, m) => sum + m.co2Grams, 0);

            console.log(`${c.bold}  Usage by Model${c.reset}`);
            console.log(`${c.gray}  ──────────────────────────────────────────────────${c.reset}`);
            console.log('');

            const modelColors = [c.yellow, c.cyan, c.green, c.magenta, c.blue];
            for (let i = 0; i < modelStats.length; i++) {
                const m = modelStats[i];
                const color = modelColors[i % modelColors.length];
                const name = friendlyModelName(m.model).padEnd(22);
                const bar = progressBar(m.co2Grams, totalModelCO2, 15, color);
                const co2 = `${kg(m.co2Grams)}kg`.padStart(8);
                console.log(`    ${bar} ${color}${name}${c.reset} ${c.bold}${co2}${c.reset}  ${c.dim}${m.sessions} sessions · ${pct(m.co2Grams, totalModelCO2)}${c.reset}`);
            }
            console.log('');
        }

        // ── Daily breakdown ───────────────────────────────────
        if (dailyStats.length > 0) {
            const maxCO2 = Math.max(...dailyStats.map((d) => d.co2Grams));

            console.log(`${c.bold}  Daily Breakdown (7 Days)${c.reset}`);
            console.log(`${c.gray}  ──────────────────────────────────────────────────${c.reset}`);
            console.log('');

            for (const day of dailyStats) {
                const dayName = formatDayName(day.date).padEnd(4);
                const co2Str = formatCO2(day.co2Grams).padStart(8);
                const bar = progressBar(day.co2Grams, maxCO2, 15, c.green);
                console.log(`    ${bar} ${c.dim}${dayName}${c.reset} ${c.bold}${co2Str}${c.reset}`);
            }
            console.log('');
        }

        // ── Project breakdown ─────────────────────────────────
        if (projectStats.length > 1) {
            const totalProjectCO2 = projectStats.reduce((sum, p) => sum + p.co2Grams, 0);

            console.log(`${c.bold}  Projects (Last 30 Days)${c.reset}`);
            console.log(`${c.gray}  ──────────────────────────────────────────────────${c.reset}`);
            console.log('');

            const projectColors = [c.green, c.cyan, c.yellow, c.magenta, c.blue];
            for (let i = 0; i < Math.min(projectStats.length, 5); i++) {
                const p = projectStats[i];
                const color = projectColors[i % projectColors.length];
                const name = p.projectPath.padEnd(22);
                const bar = progressBar(p.co2Grams, totalProjectCO2, 15, color);
                console.log(`    ${bar} ${color}${name}${c.reset} ${c.bold}${kg(p.co2Grams).padStart(6)}kg${c.reset}  ${c.dim}${pct(p.co2Grams, totalProjectCO2)}${c.reset}`);
            }

            if (projectStats.length > 5) {
                const otherCO2 = projectStats.slice(5).reduce((sum, p) => sum + p.co2Grams, 0);
                const bar = progressBar(otherCO2, totalProjectCO2, 15, c.dim);
                console.log(`    ${bar} ${c.dim}${'other'.padEnd(22)}${c.reset} ${c.bold}${kg(otherCO2).padStart(6)}kg${c.reset}  ${c.dim}${pct(otherCO2, totalProjectCO2)}${c.reset}`);
            }
            console.log('');
        }

        // ── Sync info ─────────────────────────────────────────
        if (syncInfo.enabled) {
            console.log(`${c.bold}  Anonymous Sync${c.reset}`);
            console.log(`${c.gray}  ──────────────────────────────────────────────────${c.reset}`);
            console.log('');
            console.log(`    ${c.dim}Name:${c.reset}          ${syncInfo.userName || 'Unknown'}`);
            if (syncInfo.pendingCount > 0) {
                console.log(`    ${c.dim}Pending sync:${c.reset}  ${syncInfo.pendingCount} session(s)`);
            }
            console.log('');
        }

        // ── Footer ────────────────────────────────────────────
        const now = new Date();
        const timestamp = now.toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: 'numeric', minute: '2-digit', hour12: true
        });
        console.log(`${c.gray}  Last updated: ${timestamp}${c.reset}`);
        console.log(`${c.gray}  DB: ${getDatabasePath()}${c.reset}`);
        console.log(`${c.bold}  ╔══════════════════════════════════════════════════╗${c.reset}`);
        console.log(`${c.bold}  ║  ${c.dim}Powered by CNaught · Track your AI footprint${c.reset}${c.bold}   ║${c.reset}`);
        console.log(`${c.bold}  ╚══════════════════════════════════════════════════╝${c.reset}`);
        console.log('');
    } catch (error) {
        logError('Failed to generate report', error);
        console.log(`  ${c.red}Error: Failed to generate report${c.reset}`);
        console.log(`  Run /carbon:setup to initialize the tracker`);
        console.log('');
    }
}

main().catch((error) => {
    logError('Report command failed', error);
    process.exit(1);
});

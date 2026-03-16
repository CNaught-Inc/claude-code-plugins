/**
 * Carbonlog Report Script
 *
 * Generates a visual climate impact report with terminal graphs.
 */

import '../utils/load-env';

import type { Database } from 'bun:sqlite';
import * as path from 'node:path';

import { getDashboardUrl } from '../api-client';
import { getModelConfig, MILES_PER_KG_CO2 } from '../carbon-calculator';
import {
    getAggregateStats,
    getConfig,
    getDatabasePath,
    getOldestSessionDate,
    getProjectStats,
    getUnsyncedSessions,
    withDatabase
} from '../data-store';
import { logError } from '../utils/stdin';

// ── ANSI helpers ──────────────────────────────────────────────

const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[38;2;193;215;199m', // Brand green #C1D7C7
    yellow: '\x1b[38;2;243;214;95m', // Brand yellow #F3D65F
    blue: '\x1b[38;2;141;176;195m', // Brand blue #8DB0C3
    pink: '\x1b[38;2;245;192;238m', // Brand pink #F5C0EE
    teal: '\x1b[38;2;52;191;194m', // Brand teal #34bfc2
    peach: '\x1b[38;2;253;168;128m', // Brand peach #FDA880
    orange: '\x1b[38;2;208;83;63m', // Brand orange #D0533F
    gray: '\x1b[38;5;242m'
};

// ── Formatting helpers ────────────────────────────────────────

function fmt(num: number): string {
    return num.toLocaleString();
}

function kg(grams: number): string {
    const val = grams / 1000;
    return val > 0 && val < 0.01 ? '<0.01' : val.toFixed(2);
}

function kwh(wh: number): string {
    const val = wh / 1000;
    return val > 0 && val < 0.01 ? '<0.01' : val.toFixed(2);
}

/**
 * Largest remainder method: round values so they sum to exactly the rounded
 * total. Prevents rounding from inflating displayed sums/percentages.
 */
function distributeRounded(values: number[], decimals: number): number[] {
    if (values.length === 0) return [];
    const factor = 10 ** decimals;
    const total = values.reduce((a, b) => a + b, 0);
    const target = Math.round(total * factor);
    const scaled = values.map((v) => v * factor);
    const floored = scaled.map((v) => Math.floor(v));
    let remainder = target - floored.reduce((a, b) => a + b, 0);

    const indexed = scaled
        .map((v, i) => ({ i, frac: v - Math.floor(v) }))
        .sort((a, b) => b.frac - a.frac);

    for (const { i } of indexed) {
        if (remainder <= 0) break;
        floored[i]++;
        remainder--;
    }

    return floored.map((v) => v / factor);
}

// ── Graph builders ────────────────────────────────────────────

function progressBar(
    value: number,
    maxValue: number,
    width: number = 20,
    color: string = c.green
): string {
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

function getModelStats(db: Database): ModelStats[] {
    const rows = db
        .prepare(
            `SELECT primary_model, models_used, co2_grams, energy_wh, total_tokens FROM sessions`
        )
        .all() as Record<string, unknown>[];

    const modelMap: Record<string, ModelStats> = {};

    for (const row of rows) {
        const sessionCO2 = Number(row.co2_grams);
        const sessionEnergy = Number(row.energy_wh);
        const sessionTokens = Number(row.total_tokens);

        // Parse models_used JSON (migration v4+)
        let modelsUsed: Record<string, number> = {};
        try {
            if (typeof row.models_used === 'string' && row.models_used) {
                modelsUsed = JSON.parse(row.models_used as string);
            }
        } catch {
            // Fall back to empty for malformed JSON
        }

        const totalModelTokens = Object.values(modelsUsed).reduce((sum, t) => sum + t, 0);

        if (totalModelTokens === 0) {
            // Pre-migration or empty: attribute everything to primary_model
            const model = row.primary_model as string;
            if (!modelMap[model]) {
                modelMap[model] = { model, sessions: 0, co2Grams: 0, energyWh: 0, tokens: 0 };
            }
            modelMap[model].co2Grams += sessionCO2;
            modelMap[model].energyWh += sessionEnergy;
            modelMap[model].tokens += sessionTokens;
            modelMap[model].sessions += 1;
            continue;
        }

        // Distribute CO2/energy proportionally across models by token share
        for (const [model, tokens] of Object.entries(modelsUsed)) {
            if (tokens === 0) continue;
            const share = tokens / totalModelTokens;
            if (!modelMap[model]) {
                modelMap[model] = { model, sessions: 0, co2Grams: 0, energyWh: 0, tokens: 0 };
            }
            modelMap[model].co2Grams += sessionCO2 * share;
            modelMap[model].energyWh += sessionEnergy * share;
            modelMap[model].tokens += tokens;
            modelMap[model].sessions += 1;
        }
    }

    return Object.values(modelMap).sort((a, b) => b.co2Grams - a.co2Grams);
}

// ── Friendly model name ───────────────────────────────────────

function friendlyModelName(modelId: string): string {
    return getModelConfig(modelId).displayName;
}

// ── Main report ───────────────────────────────────────────────

async function main(): Promise<void> {
    try {
        const { allTimeStats, projectStats, modelStats, syncInfo, oldestSessionDate } =
            withDatabase((db) => {
                const syncEnabled = getConfig(db, 'sync_enabled') === 'true';
                return {
                    allTimeStats: getAggregateStats(db),
                    projectStats: getProjectStats(db),
                    modelStats: getModelStats(db),
                    oldestSessionDate: getOldestSessionDate(db),
                    syncInfo: {
                        enabled: syncEnabled,
                        team: syncEnabled ? getConfig(db, 'claude_code_team') : null,
                        userId: syncEnabled ? getConfig(db, 'claude_code_user_id') : null,
                        teamId: syncEnabled ? getConfig(db, 'claude_code_team_id') : null,
                        pendingCount: syncEnabled ? getUnsyncedSessions(db, 1000).length : 0
                    }
                };
            });

        const totalCO2 = allTimeStats.totalCO2Grams;
        const totalEnergy = allTimeStats.totalEnergyWh;

        // ── Header ────────────────────────────────────────────
        console.log('');
        console.log(`${c.bold}  ╔══════════════════════════════════════════════════╗${c.reset}`);
        console.log(`${c.bold}  ║       [Cø] CNaught Climate Impact Report         ║${c.reset}`);
        console.log(`${c.bold}  ╚══════════════════════════════════════════════════╝${c.reset}`);
        console.log('');

        // ── Big numbers ───────────────────────────────────────
        const trackingSince = oldestSessionDate
            ? new Date(oldestSessionDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
              })
            : null;
        console.log(
            `${c.bold}  Summary${c.reset}${trackingSince ? `  ${c.dim}(since ${trackingSince})${c.reset}` : ''}`
        );
        console.log(`${c.gray}  ──────────────────────────────────────────────────${c.reset}`);
        console.log('');
        console.log(
            `    ${c.bold}${c.yellow}CO₂${c.reset}    ${c.bold}${kg(totalCO2)}${c.reset} kg`
        );
        console.log(
            `    ${c.bold}${c.teal}Energy${c.reset} ${c.bold}${kwh(totalEnergy)}${c.reset} kWh`
        );
        const totalTokens = allTimeStats.totalInputTokens + allTimeStats.totalOutputTokens;
        console.log(
            `    ${c.dim}Sessions: ${fmt(allTimeStats.totalSessions)} · Tokens: ${fmt(totalTokens)} (${fmt(allTimeStats.totalOutputTokens)} output)${c.reset}`
        );
        console.log(`    ${c.dim}Emissions estimated from output tokens${c.reset}`);
        console.log('');

        // ── Real-world equivalents ────────────────────────────
        if (totalCO2 > 0) {
            console.log(`${c.bold}  Equivalents${c.reset}`);
            console.log(`${c.gray}  ──────────────────────────────────────────────────${c.reset}`);
            console.log('');

            const KG_PER_DAILY_HOME_ENERGY = 7930 / 365;

            const totalKg = totalCO2 / 1000;
            const milesDriven = totalKg * MILES_PER_KG_CO2;
            const homeDays = totalKg / KG_PER_DAILY_HOME_ENERGY;

            console.log(
                `    🚗  Miles driven       ${c.bold}${milesDriven > 0 && milesDriven < 0.01 ? '<0.01' : milesDriven.toFixed(2)} miles${c.reset}`
            );
            console.log(
                `    🏠  Home energy         ${c.bold}${homeDays > 0 && homeDays < 0.01 ? '<0.01' : homeDays.toFixed(2)} days${c.reset}`
            );
            console.log('');
        }

        // ── Usage by model ────────────────────────────────────
        if (modelStats.length > 0) {
            const totalModelCO2 = modelStats.reduce((sum, m) => sum + m.co2Grams, 0);
            const modelCO2Values = modelStats.map((m) => m.co2Grams);
            const modelPcts = distributeRounded(
                modelCO2Values.map((v) => (totalModelCO2 > 0 ? (v / totalModelCO2) * 100 : 0)),
                0
            );
            const modelKgs = distributeRounded(
                modelCO2Values.map((v) => v / 1000),
                2
            );

            console.log(`${c.bold}  By Model${c.reset}`);
            console.log(`${c.gray}  ──────────────────────────────────────────────────${c.reset}`);
            console.log('');

            const modelColors = [c.yellow, c.teal, c.green, c.pink, c.blue, c.peach];
            for (let i = 0; i < modelStats.length; i++) {
                const m = modelStats[i];
                const color = modelColors[i % modelColors.length];
                const name = friendlyModelName(m.model).padEnd(22);
                const bar = progressBar(m.co2Grams, totalModelCO2, 15, color);
                const co2 = `${modelKgs[i].toFixed(2)}kg`.padStart(8);
                console.log(
                    `    ${bar} ${color}${name}${c.reset} ${c.bold}${co2}${c.reset}  ${c.dim}${m.sessions} sessions · ${modelPcts[i]}%${c.reset}`
                );
            }
            console.log('');
        }

        // ── Project breakdown ─────────────────────────────────
        if (projectStats.length > 1) {
            const totalProjectCO2 = projectStats.reduce((sum, p) => sum + p.co2Grams, 0);
            const displayedProjects = projectStats.slice(0, 5);
            const otherCO2 =
                projectStats.length > 5
                    ? projectStats.slice(5).reduce((sum, p) => sum + p.co2Grams, 0)
                    : 0;

            // Include "other" in distribution so all rows sum correctly
            const allCO2Values = [
                ...displayedProjects.map((p) => p.co2Grams),
                ...(otherCO2 > 0 ? [otherCO2] : [])
            ];
            const projectPcts = distributeRounded(
                allCO2Values.map((v) => (totalProjectCO2 > 0 ? (v / totalProjectCO2) * 100 : 0)),
                0
            );
            const projectKgs = distributeRounded(
                allCO2Values.map((v) => v / 1000),
                2
            );

            console.log(`${c.bold}  By Project${c.reset}`);
            console.log(`${c.gray}  ──────────────────────────────────────────────────${c.reset}`);
            console.log('');

            const projectColors = [c.green, c.teal, c.yellow, c.pink, c.blue, c.peach];
            const otherCount = projectStats.length > 5 ? projectStats.length - 5 : 0;
            const otherLabel =
                otherCount > 0 ? `+ ${otherCount} other${otherCount === 1 ? '' : 's'}` : '';
            const maxNameLen = Math.max(
                ...displayedProjects.map((p) => path.basename(p.projectPath).length),
                otherLabel.length
            );
            for (let i = 0; i < displayedProjects.length; i++) {
                const p = displayedProjects[i];
                const color = projectColors[i % projectColors.length];
                const name = path.basename(p.projectPath).padEnd(maxNameLen);
                const bar = progressBar(p.co2Grams, totalProjectCO2, 15, color);
                const co2 = `${projectKgs[i].toFixed(2)}kg`.padStart(8);
                console.log(
                    `    ${bar} ${color}${name}${c.reset} ${c.bold}${co2}${c.reset}  ${c.dim}${projectPcts[i]}%${c.reset}`
                );
            }

            if (otherCO2 > 0) {
                const otherIdx = displayedProjects.length;
                const bar = progressBar(otherCO2, totalProjectCO2, 15, c.dim);
                const co2 = `${projectKgs[otherIdx].toFixed(2)}kg`.padStart(8);
                console.log(
                    `    ${bar} ${c.dim}${otherLabel.padEnd(maxNameLen)}${c.reset} ${c.bold}${co2}${c.reset}  ${c.dim}${projectPcts[otherIdx]}%${c.reset}`
                );
            }
            console.log('');
        }

        // ── Sync info ─────────────────────────────────────────
        if (syncInfo.enabled) {
            console.log(`${c.bold}  Sync${c.reset}`);
            console.log(`${c.gray}  ──────────────────────────────────────────────────${c.reset}`);
            console.log('');
            if (syncInfo.teamId) {
                console.log(
                    `    ${c.dim}Dashboard:${c.reset}     ${getDashboardUrl(syncInfo.teamId)}`
                );
            }
            console.log('');
            if (syncInfo.team) {
                console.log(`    ${c.dim}Team:          ${syncInfo.team}${c.reset}`);
            }
            console.log(`    ${c.dim}Database:      ${getDatabasePath()}${c.reset}`);
            if (syncInfo.pendingCount > 0) {
                console.log(
                    `    ${c.dim}Pending sync:${c.reset}  ${syncInfo.pendingCount} session(s)`
                );
            }
            console.log('');
        }

        // ── Footer ────────────────────────────────────────────
        console.log(
            `${c.dim}  Methodology: https://github.com/CNaught-Inc/claude-code-plugins/blob/main/plugins/carbon/methodology.md${c.reset}`
        );
        console.log(`  Questions or feedback? Email feedback@cnaught.com`);
        console.log('');
    } catch (error) {
        logError('Failed to generate report', error);
        console.log(`  ${c.orange}Error: Failed to generate report${c.reset}`);
        console.log(`  Run /carbonlog:setup to initialize the tracker`);
        console.log('');
    }
}

main().catch((error) => {
    logError('Report command failed', error);
    process.exit(1);
});

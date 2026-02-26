/**
 * Carbon statusline output logic.
 *
 * Shared between the standalone carbon-statusline entry point
 * and the statusline-wrapper entry point.
 */

import { calculateCarbonFromTokens } from '../carbon-calculator';
import { queryReadonlyDb } from '../data-store';
import { resolveProjectIdentifier } from '../project-identifier';
import type { StatuslineInput } from '../utils/stdin';

function getSessionStatsFromDb(sessionId: string): { co2Grams: number; energyWh: number } | null {
    return queryReadonlyDb((db) => {
        const row = db
            .prepare('SELECT COALESCE(co2_grams, 0) as co2, COALESCE(energy_wh, 0) as energy FROM sessions WHERE session_id = ?')
            .get(sessionId) as { co2: number; energy: number } | undefined;
        if (!row) return null;
        return { co2Grams: row.co2, energyWh: row.energy };
    });
}

function getSyncInfo(): { enabled: boolean; userName: string | null; userId: string | null } {
    return (
        queryReadonlyDb((db) => {
            const get = (key: string) => {
                const row = db.prepare('SELECT value FROM plugin_config WHERE key = ?').get(key) as
                    | { value: string }
                    | undefined;
                return row?.value ?? null;
            };
            const enabled = get('sync_enabled') === 'true';
            return {
                enabled,
                userName: enabled ? get('claude_code_user_name') : null,
                userId: enabled ? get('claude_code_user_id') : null
            };
        }) ?? { enabled: false, userName: null, userId: null }
    );
}

function getSessionSynced(sessionId: string): boolean | null {
    return queryReadonlyDb((db) => {
        const row = db
            .prepare('SELECT needs_sync FROM sessions WHERE session_id = ?')
            .get(sessionId) as { needs_sync: number } | undefined;
        if (row === undefined) return null;
        return row.needs_sync === 0;
    });
}

function getTotalCO2FromDb(projectIdentifier?: string): number | null {
    return queryReadonlyDb((db) => {
        let row: { total: number };
        if (projectIdentifier) {
            row = db
                .prepare(
                    'SELECT COALESCE(SUM(co2_grams), 0) as total FROM sessions WHERE project_identifier = ?'
                )
                .get(projectIdentifier) as { total: number };
        } else {
            row = db.prepare('SELECT COALESCE(SUM(co2_grams), 0) as total FROM sessions').get() as {
                total: number;
            };
        }
        return row.total;
    });
}

function getTotalEnergyFromDb(projectIdentifier?: string): number | null {
    return queryReadonlyDb((db) => {
        let row: { total: number };
        if (projectIdentifier) {
            row = db
                .prepare(
                    'SELECT COALESCE(SUM(energy_wh), 0) as total FROM sessions WHERE project_identifier = ?'
                )
                .get(projectIdentifier) as { total: number };
        } else {
            row = db.prepare('SELECT COALESCE(SUM(energy_wh), 0) as total FROM sessions').get() as {
                total: number;
            };
        }
        return row.total;
    });
}

/**
 * Get the carbon statusline output string from parsed input.
 * Returns the formatted string, or empty string if nothing to display.
 */
export function getCarbonOutput(input: StatuslineInput): string {
    const usage = input.context_window?.current_usage || {};

    const rawProjectPath = input.project_path || input.cwd;
    const projectIdentifier = rawProjectPath ? resolveProjectIdentifier(rawProjectPath) : undefined;

    // Session CO2: prefer the authoritative DB value (cumulative, per-request TTFT).
    // Fall back to a live estimate from context window tokens before the first stop hook.
    const dbSessionStats = input.session_id ? getSessionStatsFromDb(input.session_id) : null;
    let sessionCO2: number;
    let sessionEnergyWh: number;

    if (dbSessionStats !== null && dbSessionStats.co2Grams > 0) {
        sessionCO2 = dbSessionStats.co2Grams;
        sessionEnergyWh = dbSessionStats.energyWh;
    } else {
        // No DB record yet — estimate from current context window tokens
        const outputTokens = usage.output_tokens || 0;
        if (outputTokens > 0) {
            const result = calculateCarbonFromTokens(
                usage.input_tokens || 0,
                outputTokens,
                usage.cache_creation_input_tokens || 0,
                usage.cache_read_input_tokens || 0,
                input.model?.id || 'unknown'
            );
            sessionCO2 = result.co2Grams;
            sessionEnergyWh = result.energy.energyWh;
        } else {
            sessionCO2 = 0;
            sessionEnergyWh = 0;
        }
    }

    const totalCO2 = getTotalCO2FromDb();
    const totalEnergyWh = getTotalEnergyFromDb();

    if (sessionCO2 === 0 && (totalCO2 === null || totalCO2 === 0)) {
        return '';
    }

    const reset = '\x1b[0m';

    // Build metrics — project totals only
    const totalKg = totalCO2 !== null && totalCO2 > 0 ? (totalCO2 / 1000).toFixed(2) : (sessionCO2 / 1000).toFixed(2);
    const co2Str = `CO\u2082 ${totalKg}kg`;

    const effectiveEnergyWh = totalEnergyWh !== null && totalEnergyWh > 0 ? totalEnergyWh : sessionEnergyWh;
    const totalKwh = (effectiveEnergyWh / 1000).toFixed(2);
    const energyStr = `Energy ${totalKwh}kWh`;

    let syncSuffix = '';
    const syncInfo = getSyncInfo();
    if (syncInfo.enabled && syncInfo.userName && syncInfo.userId) {
        const synced = input.session_id ? getSessionSynced(input.session_id) : null;
        const green = '\x1b[32m';
        const red = '\x1b[31m';
        // ⇄ text-based sync arrows respond to ANSI coloring
        if (synced === true) {
            syncSuffix = ` ${green}\u21C4${reset}`;
        } else if (synced === false) {
            syncSuffix = ` ${red}\u21C4${reset}`;
        }
    }

    return `Climate Impact: ${co2Str} \u00b7 ${energyStr}${syncSuffix}`;
}

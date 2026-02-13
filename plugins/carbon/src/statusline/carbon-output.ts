/**
 * Carbon statusline output logic.
 *
 * Shared between the standalone carbon-statusline entry point
 * and the statusline-wrapper entry point.
 */

import { calculateCarbonFromTokens, formatCO2 } from '../carbon-calculator.js';
import { encodeProjectPath, queryReadonlyDb } from '../data-store.js';
import type { StatuslineInput } from '../utils/stdin.js';

function getSessionCO2FromDb(sessionId: string): number | null {
    return queryReadonlyDb((db) => {
        const row = db.prepare('SELECT COALESCE(co2_grams, 0) as total FROM sessions WHERE session_id = ?').get(sessionId) as { total: number } | undefined;
        return row?.total ?? null;
    });
}

function getTotalCO2FromDb(projectPath?: string): number | null {
    return queryReadonlyDb((db) => {
        let row: { total: number };
        if (projectPath) {
            row = db.prepare('SELECT COALESCE(SUM(co2_grams), 0) as total FROM sessions WHERE project_path = ?').get(projectPath) as { total: number };
        } else {
            row = db.prepare('SELECT COALESCE(SUM(co2_grams), 0) as total FROM sessions').get() as { total: number };
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
    const encodedPath = rawProjectPath ? encodeProjectPath(rawProjectPath) : undefined;

    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
    const cacheReadTokens = usage.cache_read_input_tokens || 0;

    const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;

    // Calculate live CO2 from current context window
    const liveCO2 = totalTokens > 0
        ? calculateCarbonFromTokens(
            inputTokens,
            outputTokens,
            cacheCreationTokens,
            cacheReadTokens,
            input.model?.id || 'unknown'
        ).co2Grams
        : 0;

    // Session CO2: use DB value (cumulative) + live context estimate
    const dbSessionCO2 = input.session_id ? getSessionCO2FromDb(input.session_id) : null;
    const sessionCO2 = (dbSessionCO2 ?? 0) + liveCO2;

    const totalCO2 = getTotalCO2FromDb(encodedPath);

    if (sessionCO2 === 0 && (totalCO2 === null || totalCO2 === 0)) {
        return '';
    }

    const allSuffix = totalCO2 !== null && totalCO2 > 0
        ? ` \u00b7 total: ${formatCO2(totalCO2 + liveCO2)}`
        : '';

    return `\u{1F331} session: ${formatCO2(sessionCO2)}${allSuffix} CO\u2082`;
}

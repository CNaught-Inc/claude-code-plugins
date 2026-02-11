/**
 * Carbon statusline output logic.
 *
 * Shared between the standalone carbon-statusline entry point
 * and the statusline-wrapper entry point.
 */

import { calculateCarbonFromTokens, formatCO2 } from '../carbon-calculator.js';
import { encodeProjectPath, getDatabasePath } from '../data-store.js';
import type { StatuslineInput } from '../utils/stdin.js';
import * as fs from 'fs';

function getTotalCO2FromDb(projectPath?: string): number | null {
    try {
        const dbPath = getDatabasePath();
        if (!fs.existsSync(dbPath)) {
            return null;
        }
        const { Database } = require('bun:sqlite');
        const db = new Database(dbPath, { readonly: true });
        let row: { total: number };
        if (projectPath) {
            row = db.prepare('SELECT COALESCE(SUM(co2_grams), 0) as total FROM sessions WHERE project_path = ?').get(projectPath) as { total: number };
        } else {
            row = db.prepare('SELECT COALESCE(SUM(co2_grams), 0) as total FROM sessions').get() as { total: number };
        }
        db.close();
        return row.total;
    } catch {
        return null;
    }
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

    if (totalTokens === 0) {
        const totalCO2 = getTotalCO2FromDb(encodedPath);
        if (totalCO2 !== null && totalCO2 > 0) {
            return `\u{1F331} session: 0g \u00b7 total: ${formatCO2(totalCO2)} CO\u2082`;
        }
        return '';
    }

    const carbon = calculateCarbonFromTokens(
        inputTokens,
        outputTokens,
        cacheCreationTokens,
        cacheReadTokens,
        input.model?.id || 'unknown'
    );

    const totalCO2 = getTotalCO2FromDb(encodedPath);
    const allSuffix = totalCO2 !== null && totalCO2 > 0
        ? ` \u00b7 total: ${formatCO2(totalCO2)}`
        : '';

    return `\u{1F331} session: ${formatCO2(carbon.co2Grams)}${allSuffix} CO\u2082`;
}

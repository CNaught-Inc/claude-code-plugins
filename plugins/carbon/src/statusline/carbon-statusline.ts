/**
 * Carbon Statusline Script
 *
 * Displays real-time CO2 emissions in Claude Code's status bar.
 * Shows current session emissions and total emissions from all tracked sessions.
 *
 * Input format (JSON via stdin from Claude Code):
 * {
 *   "session_id": "uuid",
 *   "model": { "id": "claude-opus-4-6", "display_name": "Opus" },
 *   "context_window": {
 *     "current_usage": {
 *       "input_tokens": 1234,
 *       "output_tokens": 567,
 *       "cache_creation_input_tokens": 890,
 *       "cache_read_input_tokens": 123
 *     }
 *   }
 * }
 *
 * Output format:
 * 🌱 session: 2.45g · total: 123.45g CO₂
 */

import { calculateCarbonFromTokens, formatCO2 } from '../carbon-calculator.js';
import { getDatabasePath } from '../data-store.js';
import { readStdinJson, StatuslineInputSchema } from '../utils/stdin.js';
import * as fs from 'fs';

function getTotalCO2FromDb(): number | null {
    try {
        const dbPath = getDatabasePath();
        if (!fs.existsSync(dbPath)) {
            return null;
        }
        const { Database } = require('bun:sqlite');
        const db = new Database(dbPath, { readonly: true });
        const row = db.prepare('SELECT COALESCE(SUM(co2_grams), 0) as total FROM sessions').get() as { total: number };
        db.close();
        return row.total;
    } catch {
        return null;
    }
}

async function main(): Promise<void> {
    try {
        const input = await readStdinJson(StatuslineInputSchema);
        const usage = input.context_window?.current_usage || {};

        const inputTokens = usage.input_tokens || 0;
        const outputTokens = usage.output_tokens || 0;
        const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
        const cacheReadTokens = usage.cache_read_input_tokens || 0;

        const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;

        if (totalTokens === 0) {
            // No tokens yet, but still show total if available
            const totalCO2 = getTotalCO2FromDb();
            if (totalCO2 !== null && totalCO2 > 0) {
                console.log(`\u{1F331} session: 0g \u00b7 total: ${formatCO2(totalCO2)} CO\u2082`);
            } else {
                console.log('');
            }
            return;
        }

        const carbon = calculateCarbonFromTokens(
            inputTokens,
            outputTokens,
            cacheCreationTokens,
            cacheReadTokens,
            input.model?.id || 'unknown'
        );

        // Get total from all tracked sessions
        const totalCO2 = getTotalCO2FromDb();
        const allSuffix = totalCO2 !== null && totalCO2 > 0
            ? ` \u00b7 total: ${formatCO2(totalCO2)}`
            : '';

        // Format: 🌱 session: 2.45g · total: 123.45g CO₂
        const output = `\u{1F331} session: ${formatCO2(carbon.co2Grams)}${allSuffix} CO\u2082`;
        console.log(output);
    } catch {
        // On any error, output empty string to avoid breaking the status bar
        console.log('');
    }
}

main();

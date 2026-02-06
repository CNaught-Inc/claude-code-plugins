/**
 * Carbon Statusline Script
 *
 * Displays real-time CO2 emissions in Claude Code's status bar.
 * This script reads token usage from stdin and outputs a formatted CO2 string.
 *
 * Input format (JSON via stdin):
 * {
 *   "session_id": "uuid",
 *   "usage": {
 *     "input_tokens": 1234,
 *     "output_tokens": 567,
 *     "cache_creation_input_tokens": 890,
 *     "cache_read_input_tokens": 123
 *   },
 *   "model": "claude-opus-4-5-20251101"
 * }
 *
 * Output format:
 * 🌱 2.45g CO₂
 */

import { calculateCarbonFromTokens, formatCO2 } from '../carbon-calculator.js';
import { readStdinJson, StatuslineInputSchema } from '../utils/stdin.js';

async function main(): Promise<void> {
    try {
        const input = await readStdinJson(StatuslineInputSchema);
        const usage = input.usage || {};

        const inputTokens = usage.input_tokens || 0;
        const outputTokens = usage.output_tokens || 0;
        const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
        const cacheReadTokens = usage.cache_read_input_tokens || 0;

        const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;

        if (totalTokens === 0) {
            // No tokens yet, output empty string
            console.log('');
            return;
        }

        const carbon = calculateCarbonFromTokens(
            inputTokens,
            outputTokens,
            cacheCreationTokens,
            cacheReadTokens,
            input.model || 'unknown'
        );

        // Format output with leaf emoji and CO₂ subscript
        const output = `\u{1F331} ${formatCO2(carbon.co2Grams)} CO\u2082`;
        console.log(output);
    } catch {
        // On any error, output empty string to avoid breaking the status bar
        console.log('');
    }
}

main();

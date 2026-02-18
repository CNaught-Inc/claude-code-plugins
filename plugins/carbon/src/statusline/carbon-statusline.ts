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

import { readStdinJson, StatuslineInputSchema } from '../utils/stdin';
import { getCarbonOutput } from './carbon-output';

async function main(): Promise<void> {
    try {
        const input = await readStdinJson(StatuslineInputSchema);
        console.log(getCarbonOutput(input));
    } catch {
        console.log('');
    }
}

main();

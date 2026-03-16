/**
 * Statusline Wrapper
 *
 * Runs an existing statusline command alongside the carbonlog statusline,
 * combining their outputs with ' | '.
 *
 * Usage:
 *   statusline-wrapper.js --original-command "npx ccstatusline@latest"
 *
 * Input: JSON via stdin (from Claude Code, same as carbonlog-statusline)
 * Output: "<original output> | <carbonlog output>", joined with ' | '
 */

import '../utils/load-env';

import { spawnSync } from 'node:child_process';

import { readStdin, StatuslineInputSchema } from '../utils/stdin';
import { getCarbonlogOutput } from './carbonlog-output';

function getOriginalCommand(): string | undefined {
    const args = process.argv.slice(2);
    const idx = args.indexOf('--original-command');
    return idx !== -1 ? args[idx + 1] : undefined;
}

function runOriginalCommand(command: string, stdinData: string): string {
    try {
        const result = spawnSync('sh', ['-c', command], {
            input: stdinData,
            encoding: 'utf-8',
            timeout: 5000,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        return (result.stdout || '').trim();
    } catch {
        return '';
    }
}

async function main(): Promise<void> {
    try {
        const stdinData = await readStdin();
        const originalCommand = getOriginalCommand();

        // Run original command and compute carbon output in parallel
        let originalOutput = '';
        if (originalCommand) {
            originalOutput = runOriginalCommand(originalCommand, stdinData);
        }

        let carbonlogOutput = '';
        try {
            const input = StatuslineInputSchema.parse(JSON.parse(stdinData));
            carbonlogOutput = getCarbonlogOutput(input);
        } catch {
            // Carbonlog calculation failed, still show original
        }

        const parts = [originalOutput, carbonlogOutput].filter(Boolean);
        console.log(parts.join(' | '));
    } catch {
        console.log('');
    }
}

main();

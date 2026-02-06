/**
 * Utilities for reading hook input from stdin
 * Claude Code hooks receive JSON data via stdin
 */

import { z } from 'zod';

/**
 * Read all data from stdin
 */
export async function readStdin(): Promise<string> {
    return new Promise((resolve, reject) => {
        let data = '';

        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => {
            data += chunk;
        });
        process.stdin.on('end', () => {
            resolve(data);
        });
        process.stdin.on('error', reject);

        // Handle case where stdin is empty or not piped
        if (process.stdin.isTTY) {
            resolve('');
        }
    });
}

/**
 * Parse JSON from stdin with Zod validation
 */
export async function readStdinJson<T>(schema: z.ZodSchema<T>): Promise<T> {
    const data = await readStdin();

    if (!data.trim()) {
        throw new Error('No input received from stdin');
    }

    const json = JSON.parse(data);
    return schema.parse(json);
}

/**
 * Schema for session start hook input
 */
export const SessionStartInputSchema = z.object({
    session_id: z.string(),
    project_path: z.string().optional(),
    cwd: z.string().optional()
});

export type SessionStartInput = z.infer<typeof SessionStartInputSchema>;

/**
 * Schema for stop hook input (after each response)
 */
export const StopInputSchema = z.object({
    session_id: z.string(),
    project_path: z.string().optional(),
    cwd: z.string().optional(),
    transcript_path: z.string().optional()
});

export type StopInput = z.infer<typeof StopInputSchema>;

/**
 * Schema for session end hook input
 */
export const SessionEndInputSchema = z.object({
    session_id: z.string(),
    project_path: z.string().optional(),
    cwd: z.string().optional(),
    transcript_path: z.string().optional()
});

export type SessionEndInput = z.infer<typeof SessionEndInputSchema>;

/**
 * Schema for statusline input
 */
export const StatuslineInputSchema = z.object({
    session_id: z.string().optional(),
    usage: z
        .object({
            input_tokens: z.number().optional(),
            output_tokens: z.number().optional(),
            cache_creation_input_tokens: z.number().optional(),
            cache_read_input_tokens: z.number().optional()
        })
        .optional(),
    model: z.string().optional()
});

export type StatuslineInput = z.infer<typeof StatuslineInputSchema>;

/**
 * Output JSON to stdout for Claude Code to consume
 */
export function writeStdout(data: object): void {
    console.log(JSON.stringify(data));
}

/**
 * Output plain text to stderr for logging (doesn't interfere with stdout JSON)
 */
export function log(message: string): void {
    console.error(`[carbon-tracker] ${message}`);
}

/**
 * Output error to stderr
 */
export function logError(message: string, error?: unknown): void {
    const errorDetails = error instanceof Error ? error.message : String(error);
    console.error(`[carbon-tracker] ERROR: ${message}${error ? ` - ${errorDetails}` : ''}`);
}

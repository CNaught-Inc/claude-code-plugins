/**
 * Session Parser
 *
 * Parses Claude Code transcript logs to extract token usage.
 * Transcripts are JSONL files stored at:
 * - Main: ~/.claude/projects/<project-path>/<session-id>.jsonl
 * - Subagents: <session-id>/subagents/agent-*.jsonl
 */

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

/**
 * Schema for a single transcript entry
 */
const TranscriptEntrySchema = z.object({
    type: z.string(),
    sessionId: z.string().optional(),
    parentMessageId: z.string().optional(),
    message: z
        .object({
            model: z.string().optional(),
            usage: z
                .object({
                    input_tokens: z.number().optional(),
                    output_tokens: z.number().optional(),
                    cache_creation_input_tokens: z.number().optional(),
                    cache_read_input_tokens: z.number().optional()
                })
                .optional()
        })
        .optional(),
    uuid: z.string().optional()
});

export type TranscriptEntry = z.infer<typeof TranscriptEntrySchema>;

/**
 * Token usage record for a single request
 */
export interface TokenUsageRecord {
    requestId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    timestamp: Date;
}

/**
 * Aggregated session usage
 */
export interface SessionUsage {
    sessionId: string;
    projectPath: string;
    records: TokenUsageRecord[];
    totals: {
        inputTokens: number;
        outputTokens: number;
        cacheCreationTokens: number;
        cacheReadTokens: number;
        totalTokens: number;
    };
    modelBreakdown: Record<string, number>;
    primaryModel: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Parse a single JSONL file and extract token usage records
 */
function parseJsonlFile(filePath: string): TokenUsageRecord[] {
    if (!fs.existsSync(filePath)) {
        return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());
    const records: TokenUsageRecord[] = [];
    const seenRequestIds = new Set<string>();

    for (const line of lines) {
        try {
            const entry = JSON.parse(line);
            const parsed = TranscriptEntrySchema.safeParse(entry);

            if (!parsed.success) {
                continue;
            }

            const data = parsed.data;

            // Only process assistant messages with usage data
            if (data.type !== 'assistant' || !data.message?.usage) {
                continue;
            }

            // Deduplicate by UUID (streaming can produce multiple entries)
            const requestId = data.uuid || data.parentMessageId || `${Date.now()}-${Math.random()}`;
            if (seenRequestIds.has(requestId)) {
                continue;
            }
            seenRequestIds.add(requestId);

            const usage = data.message.usage;
            records.push({
                requestId,
                model: data.message.model || 'unknown',
                inputTokens: usage.input_tokens || 0,
                outputTokens: usage.output_tokens || 0,
                cacheCreationTokens: usage.cache_creation_input_tokens || 0,
                cacheReadTokens: usage.cache_read_input_tokens || 0,
                timestamp: new Date()
            });
        } catch {
            // Skip malformed lines
            continue;
        }
    }

    return records;
}

/**
 * Find all subagent transcript files for a session
 */
function findSubagentFiles(sessionDir: string): string[] {
    const subagentsDir = path.join(sessionDir, 'subagents');

    if (!fs.existsSync(subagentsDir)) {
        return [];
    }

    try {
        const files = fs.readdirSync(subagentsDir);
        return files
            .filter((f) => f.startsWith('agent-') && f.endsWith('.jsonl'))
            .map((f) => path.join(subagentsDir, f));
    } catch {
        return [];
    }
}

/**
 * Get the Claude projects directory
 */
export function getClaudeProjectsDir(): string {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(homeDir, '.claude', 'projects');
}

/**
 * Find the transcript file for a session
 */
export function findTranscriptPath(sessionId: string, projectPath?: string): string | null {
    const projectsDir = getClaudeProjectsDir();

    // If project path is provided, look in that directory
    if (projectPath) {
        // Project paths in .claude/projects are encoded (slashes become something else)
        const encodedPath = projectPath.replace(/\//g, '-');
        const projectDir = path.join(projectsDir, encodedPath);
        const transcriptPath = path.join(projectDir, `${sessionId}.jsonl`);

        if (fs.existsSync(transcriptPath)) {
            return transcriptPath;
        }
    }

    // Search all project directories for the session
    if (fs.existsSync(projectsDir)) {
        try {
            const projectDirs = fs.readdirSync(projectsDir);
            for (const dir of projectDirs) {
                const transcriptPath = path.join(projectsDir, dir, `${sessionId}.jsonl`);
                if (fs.existsSync(transcriptPath)) {
                    return transcriptPath;
                }
            }
        } catch {
            // Ignore errors reading directory
        }
    }

    return null;
}

/**
 * Parse a session's transcript and all subagent transcripts
 */
export function parseSession(transcriptPath: string): SessionUsage {
    const sessionDir = path.dirname(transcriptPath);
    const sessionId = path.basename(transcriptPath, '.jsonl');

    // Determine project path from directory structure
    const projectsDir = getClaudeProjectsDir();
    const projectPath = path.relative(projectsDir, sessionDir);

    // Parse main transcript
    const mainRecords = parseJsonlFile(transcriptPath);

    // Parse subagent transcripts
    const subagentFiles = findSubagentFiles(path.join(sessionDir, sessionId));
    const subagentRecords = subagentFiles.flatMap((f) => parseJsonlFile(f));

    // Combine all records
    const allRecords = [...mainRecords, ...subagentRecords];

    // Calculate totals
    const totals = allRecords.reduce(
        (acc, record) => ({
            inputTokens: acc.inputTokens + record.inputTokens,
            outputTokens: acc.outputTokens + record.outputTokens,
            cacheCreationTokens: acc.cacheCreationTokens + record.cacheCreationTokens,
            cacheReadTokens: acc.cacheReadTokens + record.cacheReadTokens,
            totalTokens:
                acc.totalTokens +
                record.inputTokens +
                record.outputTokens +
                record.cacheCreationTokens +
                record.cacheReadTokens
        }),
        {
            inputTokens: 0,
            outputTokens: 0,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            totalTokens: 0
        }
    );

    // Calculate model breakdown
    const modelBreakdown: Record<string, number> = {};
    for (const record of allRecords) {
        const totalForRecord =
            record.inputTokens +
            record.outputTokens +
            record.cacheCreationTokens +
            record.cacheReadTokens;
        modelBreakdown[record.model] = (modelBreakdown[record.model] || 0) + totalForRecord;
    }

    // Determine primary model (most tokens)
    const primaryModel =
        Object.entries(modelBreakdown).sort(([, a], [, b]) => b - a)[0]?.[0] || 'unknown';

    // Get timestamps
    const stat = fs.statSync(transcriptPath);

    return {
        sessionId,
        projectPath,
        records: allRecords,
        totals,
        modelBreakdown,
        primaryModel,
        createdAt: stat.birthtime,
        updatedAt: stat.mtime
    };
}

/**
 * Find all orphaned transcripts (files without matching DB records)
 */
export function findAllTranscripts(): string[] {
    const projectsDir = getClaudeProjectsDir();
    const transcripts: string[] = [];

    if (!fs.existsSync(projectsDir)) {
        return transcripts;
    }

    try {
        const projectDirs = fs.readdirSync(projectsDir);
        for (const dir of projectDirs) {
            const projectDir = path.join(projectsDir, dir);
            const stat = fs.statSync(projectDir);

            if (!stat.isDirectory()) {
                continue;
            }

            const files = fs.readdirSync(projectDir);
            for (const file of files) {
                if (file.endsWith('.jsonl')) {
                    transcripts.push(path.join(projectDir, file));
                }
            }
        }
    } catch {
        // Ignore errors
    }

    return transcripts;
}

/**
 * Extract session ID from transcript path
 */
export function getSessionIdFromPath(transcriptPath: string): string {
    return path.basename(transcriptPath, '.jsonl');
}

/**
 * API Client
 *
 * Lightweight GraphQL client for syncing session data to the CNaught API.
 * Uses native fetch (Node 18+). All errors are caught and logged, never thrown.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { getClaudeDir } from './data-store';
import type { SessionRecord } from './data-store';
import { log, logError } from './utils/stdin';

const REQUEST_TIMEOUT_MS = 10_000;
const GRAPHQL_PATH = '/graphql/public';
export const DEFAULT_API_URL = 'https://api.cnaught.com';

export interface SyncConfig {
    userId: string;
    userName: string;
}

/**
 * Get the API base URL (without path).
 * Priority: CNAUGHT_API_URL env var > ~/.claude/settings.json > default production URL.
 * The env var takes precedence so .env.local overrides always win during development.
 * The settings.json override lets users point at a staging API without plugin changes.
 */
export function getApiUrl(): string {
    if (process.env.CNAUGHT_API_URL) return process.env.CNAUGHT_API_URL;

    // Check global ~/.claude/settings.json
    try {
        const settingsPath = path.join(getClaudeDir(), 'settings.json');
        if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            const value = settings.carbonTracker?.apiUrl;
            if (typeof value === 'string' && value) return value;
        }
    } catch {
        // Non-critical, fall through to default
    }

    return DEFAULT_API_URL;
}

/**
 * Get the full GraphQL endpoint URL.
 */
export function getGraphqlUrl(): string {
    return `${getApiUrl()}${GRAPHQL_PATH}`;
}

/**
 * Get the emissions dashboard URL for a given user.
 * Points to the API redirect endpoint which forwards to the correct frontend.
 */
export function getDashboardUrl(userId: string): string {
    return `${getApiUrl()}/claude-code-emissions/${userId}`;
}

/**
 * Execute a GraphQL request against the CNaught API.
 * Returns the parsed response data, or null on any error.
 */
async function graphqlRequest<T>(
    query: string,
    variables: Record<string, unknown>
): Promise<T | null> {
    try {
        const response = await fetch(getGraphqlUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            // Bun ignores runtime process.env.NODE_TLS_REJECT_UNAUTHORIZED,
            // so pass it explicitly for local dev with self-signed certs
            ...(process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' && {
                tls: { rejectUnauthorized: false }
            })
        } as RequestInit);

        if (!response.ok) {
            logError(`API request failed: HTTP ${response.status}`);
            return null;
        }

        const json = (await response.json()) as { data?: T; errors?: { message: string }[] };

        if (json.errors?.length) {
            logError(`API returned errors: ${json.errors.map((e) => e.message).join(', ')}`);
            return null;
        }

        return json.data ?? null;
    } catch (error) {
        if (error instanceof Error && error.name === 'TimeoutError') {
            logError('API request timed out');
        } else {
            logError('API request failed', error);
        }
        return null;
    }
}

/**
 * Convert a modelsUsed record to the API's ClaudeCodeModelUsage array format.
 */
function modelsUsedToArray(modelsUsed: Record<string, number>) {
    return Object.entries(modelsUsed).map(([modelId, tokenCount]) => ({ modelId, tokenCount }));
}

/**
 * Build the variables for a single session upsert mutation.
 */
function sessionToInput(config: SyncConfig, session: SessionRecord) {
    return {
        sessionId: session.sessionId,
        claudeCodeUserId: config.userId,
        claudeCodeUserName: config.userName,
        projectPath: session.projectIdentifier || session.projectPath,
        co2Grams: session.co2Grams,
        totalInputTokens: session.inputTokens,
        totalOutputTokens: session.outputTokens,
        totalCacheCreationTokens: session.cacheCreationTokens,
        totalCacheReadTokens: session.cacheReadTokens,
        energyWh: session.energyWh,
        startedAt: session.createdAt.toISOString(),
        primaryModel: session.primaryModel,
        modelsUsed: modelsUsedToArray(session.modelsUsed)
    };
}

const UPSERT_SESSION_MUTATION = `
    mutation UpsertClaudeCodeSession($input: UpsertClaudeCodeSessionInput!) {
        upsertClaudeCodeSession(input: $input) {
            id
        }
    }
`;

const UPSERT_SESSIONS_MUTATION = `
    mutation UpsertClaudeCodeSessions($input: UpsertClaudeCodeSessionsInput!) {
        upsertClaudeCodeSessions(input: $input) {
            id
        }
    }
`;

/**
 * Upsert a single session to the CNaught API.
 * Returns true on success, false on failure.
 */
export async function upsertSession(config: SyncConfig, session: SessionRecord): Promise<boolean> {
    const result = await graphqlRequest(UPSERT_SESSION_MUTATION, {
        input: sessionToInput(config, session)
    });

    if (result) {
        log(`Synced session ${session.sessionId}`);
    }

    return result !== null;
}

/**
 * Batch upsert multiple sessions to the CNaught API.
 * Sessions are sent in a single request (max 100 per API constraint).
 * Returns true on success, false on failure.
 */
export async function upsertSessions(
    config: SyncConfig,
    sessions: SessionRecord[]
): Promise<boolean> {
    if (sessions.length === 0) return true;
    if (sessions.length > 100) {
        logError(`Batch size ${sessions.length} exceeds limit of 100`);
        return false;
    }

    const result = await graphqlRequest(UPSERT_SESSIONS_MUTATION, {
        input: {
            claudeCodeUserId: config.userId,
            claudeCodeUserName: config.userName,
            sessions: sessions.map((s) => ({
                sessionId: s.sessionId,
                projectPath: s.projectIdentifier || s.projectPath,
                co2Grams: s.co2Grams,
                totalInputTokens: s.inputTokens,
                totalOutputTokens: s.outputTokens,
                totalCacheCreationTokens: s.cacheCreationTokens,
                totalCacheReadTokens: s.cacheReadTokens,
                energyWh: s.energyWh,
                startedAt: s.createdAt.toISOString(),
                primaryModel: s.primaryModel,
                modelsUsed: modelsUsedToArray(s.modelsUsed)
            }))
        }
    });

    if (result) {
        log(`Synced ${sessions.length} session(s)`);
    }

    return result !== null;
}

/**
 * Carbon statusline output logic.
 *
 * Shared between the standalone carbon-statusline entry point
 * and the statusline-wrapper entry point.
 */

import { calculateCarbonFromTokens, formatCO2 } from '../carbon-calculator';
import { encodeProjectPath, queryReadonlyDb } from '../data-store';
import type { StatuslineInput } from '../utils/stdin';

function getSessionCO2FromDb(sessionId: string): number | null {
    return queryReadonlyDb((db) => {
        const row = db
            .prepare('SELECT COALESCE(co2_grams, 0) as total FROM sessions WHERE session_id = ?')
            .get(sessionId) as { total: number } | undefined;
        return row?.total ?? null;
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

function getTotalCO2FromDb(projectPath?: string): number | null {
    return queryReadonlyDb((db) => {
        let row: { total: number };
        if (projectPath) {
            row = db
                .prepare(
                    'SELECT COALESCE(SUM(co2_grams), 0) as total FROM sessions WHERE project_path = ?'
                )
                .get(projectPath) as { total: number };
        } else {
            row = db.prepare('SELECT COALESCE(SUM(co2_grams), 0) as total FROM sessions').get() as {
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
    const encodedPath = rawProjectPath ? encodeProjectPath(rawProjectPath) : undefined;

    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
    const cacheReadTokens = usage.cache_read_input_tokens || 0;

    const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;

    // Calculate live CO2 from current context window
    const liveCO2 =
        totalTokens > 0
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

    const totalSuffix =
        totalCO2 !== null && totalCO2 > 0 ? ` / ${formatCO2(totalCO2 + liveCO2)}` : '';

    let syncSuffix = '';
    const syncInfo = getSyncInfo();
    if (syncInfo.enabled && syncInfo.userName && syncInfo.userId) {
        const synced = input.session_id ? getSessionSynced(input.session_id) : null;
        const bold = '\x1b[1m';
        const green = '\x1b[32m';
        const yellow = '\x1b[33m';
        const dim = '\x1b[2m';
        const reset = '\x1b[0m';
        const nameStr = `${dim}${bold}${syncInfo.userName}${reset}`;
        const syncStatus =
            synced === true
                ? ` \u00b7 ${green}\u2713 synced${reset}`
                : synced === false
                  ? ` \u00b7 ${yellow}\u25cb pending${reset}`
                  : '';
        syncSuffix = ` \u00b7 ${nameStr}${syncStatus}`;
    }

    return `\u{1F331} Session: ${formatCO2(sessionCO2)}${totalSuffix} CO\u2082${syncSuffix}`;
}

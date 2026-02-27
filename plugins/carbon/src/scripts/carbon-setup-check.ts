/**
 * Carbon Setup Check Script
 *
 * Checks whether the carbon plugin has been set up before and outputs
 * the current configuration as JSON. Used by the setup command to
 * detect re-runs and adjust the setup flow accordingly.
 */

import '../utils/load-env';

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
    getClaudeDir,
    getConfig,
    getDatabasePath,
    getInstalledAt,
    getProjectConfig,
    queryReadonlyDb
} from '../data-store';
import { shortHash } from '../project-identifier';
import { isCarbonStatusLine } from './setup-helpers';

interface SetupCheckResult {
    isSetup: boolean;
    installedAt?: string;
    syncEnabled?: boolean;
    userName?: string;
    userId?: string;
    projectName?: string | null;
    statusLineConfigured?: boolean;
}

function checkStatusLine(): boolean {
    const settingsPath = path.join(getClaudeDir(), 'settings.json');
    try {
        if (!fs.existsSync(settingsPath)) return false;
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        const command = settings?.statusLine?.command;
        return typeof command === 'string' && isCarbonStatusLine(command);
    } catch {
        return false;
    }
}

function main(): void {
    const dbPath = getDatabasePath();
    if (!fs.existsSync(dbPath)) {
        console.log(JSON.stringify({ isSetup: false }));
        return;
    }

    const result = queryReadonlyDb<SetupCheckResult>((db) => {
        const installedAt = getInstalledAt(db);
        if (!installedAt) {
            return { isSetup: false };
        }

        const projectHash = shortHash(process.cwd());
        const projectName = getProjectConfig(db, projectHash, 'project_name');
        const syncEnabled = getConfig(db, 'sync_enabled') === 'true';
        const userName = getConfig(db, 'claude_code_user_name');
        const userId = getConfig(db, 'claude_code_user_id');

        return {
            isSetup: true,
            installedAt: installedAt.toISOString(),
            syncEnabled,
            userName: userName ?? undefined,
            userId: userId ?? undefined,
            projectName: projectName ?? null,
            statusLineConfigured: checkStatusLine()
        };
    });

    console.log(JSON.stringify(result ?? { isSetup: false }));
}

main();

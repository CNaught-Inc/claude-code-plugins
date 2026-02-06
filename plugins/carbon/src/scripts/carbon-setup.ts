/**
 * Carbon Setup Script
 *
 * Sets up the CNaught carbon tracking plugin:
 * 1. Initializes the local SQLite database
 * 2. Installs the statusline script to ~/.claude/statusline-carbon.mjs
 * 3. Configures ~/.claude/settings.json to enable the statusline
 * 4. Reports MCP integration status
 */

import * as fs from 'fs';
import * as path from 'path';

import { getAuthConfig, getInstalledAt, initializeDatabase, openDatabase, setInstalledAt } from '../data-store.js';
import { formatRelativeTime } from '../sync-service.js';
import { log, logError } from '../utils/stdin.js';

/**
 * Get Claude config directory
 */
function getClaudeDir(): string {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(homeDir, '.claude');
}

/**
 * Statusline script content
 * This is a standalone ES module that reads usage from stdin and outputs CO2
 */
const STATUSLINE_SCRIPT = `#!/usr/bin/env node
/**
 * CNaught Carbon Statusline
 * Displays real-time CO2 emissions in Claude Code's status bar
 */

// Energy per 1000 tokens by model family (Wh)
const MODEL_ENERGY = {
    opus: 0.028,
    sonnet: 0.015,
    haiku: 0.005,
    unknown: 0.015
};

// Carbon intensity (gCO2/kWh)
const CARBON_INTENSITY = 300;

// PUE (Power Usage Effectiveness)
const PUE = 1.2;

function getModelFamily(model) {
    if (!model) return 'unknown';
    const lower = model.toLowerCase();
    if (lower.includes('opus')) return 'opus';
    if (lower.includes('sonnet')) return 'sonnet';
    if (lower.includes('haiku')) return 'haiku';
    return 'unknown';
}

function calculateCO2(tokens, model) {
    const family = getModelFamily(model);
    const whPer1000Tokens = MODEL_ENERGY[family];
    const energyWh = (tokens / 1000) * whPer1000Tokens * PUE;
    const co2Grams = (energyWh / 1000) * CARBON_INTENSITY;
    return co2Grams;
}

function formatCO2(grams) {
    if (grams < 0.01) return '< 0.01g';
    if (grams < 1) return grams.toFixed(2) + 'g';
    if (grams < 1000) return grams.toFixed(1) + 'g';
    return (grams / 1000).toFixed(2) + 'kg';
}

// Read from stdin
let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { data += chunk; });
process.stdin.on('end', () => {
    try {
        const input = JSON.parse(data);
        const ctx = input.context_window || {};
        const totalTokens = (ctx.total_input_tokens || 0) +
                           (ctx.total_output_tokens || 0);

        if (totalTokens === 0) {
            console.log('');
            return;
        }

        const modelId = (input.model && input.model.id) || '';
        const co2 = calculateCO2(totalTokens, modelId);
        console.log('\\u{1F331} ' + formatCO2(co2) + ' CO\\u2082');
    } catch {
        console.log('');
    }
});
`;

/**
 * Install the statusline script
 */
function installStatusline(): { success: boolean; path: string; message: string } {
    const claudeDir = getClaudeDir();
    const statuslinePath = path.join(claudeDir, 'statusline-carbon.mjs');

    try {
        // Ensure directory exists
        if (!fs.existsSync(claudeDir)) {
            fs.mkdirSync(claudeDir, { recursive: true });
        }

        // Write the statusline script
        fs.writeFileSync(statuslinePath, STATUSLINE_SCRIPT, { mode: 0o755 });

        return {
            success: true,
            path: statuslinePath,
            message: `Statusline script installed at ${statuslinePath}`
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            path: statuslinePath,
            message: `Failed to install statusline: ${message}`
        };
    }
}

/**
 * Configure Claude Code settings
 */
function configureSettings(): {
    success: boolean;
    message: string;
    manualSteps?: string[];
} {
    const claudeDir = getClaudeDir();
    const settingsPath = path.join(claudeDir, 'settings.json');
    const statuslinePath = path.join(claudeDir, 'statusline-carbon.mjs');

    try {
        let settings: Record<string, unknown> = {};

        // Read existing settings if present
        if (fs.existsSync(settingsPath)) {
            const content = fs.readFileSync(settingsPath, 'utf-8');
            settings = JSON.parse(content);
        }

        // Check for existing statusLine
        const existingStatusLine = settings.statusLine as Record<string, unknown> | undefined;
        if (
            existingStatusLine &&
            typeof existingStatusLine === 'object' &&
            existingStatusLine.command !== statuslinePath
        ) {
            return {
                success: false,
                message: 'Existing statusLine configuration found',
                manualSteps: [
                    `Current statusLine command: ${existingStatusLine.command}`,
                    `To use carbon tracking statusline, update ~/.claude/settings.json:`,
                    `  "statusLine": { "type": "command", "command": "${statuslinePath}" }`,
                    ``,
                    `Or combine scripts if you want both.`
                ]
            };
        }

        // Set statusLine with correct format
        settings.statusLine = {
            type: 'command',
            command: statuslinePath
        };

        // Write settings
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

        return {
            success: true,
            message: 'Settings configured successfully'
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            message: `Failed to configure settings: ${message}`
        };
    }
}

/**
 * Main setup flow
 */
async function main(): Promise<void> {
    console.log('\n');
    console.log('========================================');
    console.log('  CNaught Carbon Tracker Setup         ');
    console.log('========================================');
    console.log('\n');

    // Step 1: Initialize database
    console.log('Step 1: Initializing database...');
    try {
        const db = openDatabase();
        initializeDatabase(db);

        const isFirstInstall = getInstalledAt(db) === null;
        setInstalledAt(db);

        // Check MCP integration status
        const authConfig = getAuthConfig(db);
        db.close();
        console.log('  Database initialized successfully');
        if (isFirstInstall) {
            console.log('  First install detected — only new sessions will be tracked by default');
        }
        console.log('');

        // Step 2: Install statusline
        console.log('Step 2: Installing statusline script...');
        const statuslineResult = installStatusline();
        if (statuslineResult.success) {
            console.log(`  ${statuslineResult.message}\n`);
        } else {
            console.log(`  Error: ${statuslineResult.message}\n`);
        }

        // Step 3: Configure settings
        console.log('Step 3: Configuring Claude Code settings...');
        const settingsResult = configureSettings();
        if (settingsResult.success) {
            console.log(`  ${settingsResult.message}\n`);
        } else {
            console.log(`  ${settingsResult.message}\n`);
            if (settingsResult.manualSteps) {
                console.log('  Manual steps required:');
                for (const step of settingsResult.manualSteps) {
                    console.log(`    ${step}`);
                }
                console.log('');
            }
        }

        // Step 4: Backend integration status
        console.log('Step 4: Backend integration...');
        if (authConfig) {
            const isExpired = authConfig.refreshTokenExpiresAt < new Date();
            console.log(
                `  Status: ${isExpired ? 'Token expired (re-authenticate below)' : 'Authenticated'}`
            );
            if (authConfig.organizationId) {
                console.log(`  Organization: ${authConfig.organizationId}`);
            }
            console.log(
                `  Last updated: ${formatRelativeTime(authConfig.updatedAt)}`
            );
        } else {
            console.log('  Not configured.');
            console.log('  To enable automatic session syncing and carbon offsetting,');
            console.log('  authenticate with CNaught using the setup command.');
        }
        console.log('');

        // Summary
        console.log('========================================');
        console.log('  Setup Complete!                      ');
        console.log('========================================');
        console.log('\n');
        console.log('The carbon tracker is now active.');
        console.log('You will see CO2 emissions in your status bar.');
        console.log('\n');
        console.log('Commands:');
        console.log('  /carbon:status  - View tracking status');
        console.log('  /carbon:report  - View emissions report');
        console.log('  /carbon:sync    - Manually sync sessions');
        console.log('\n');
    } catch (error) {
        logError('Failed to initialize database', error);
        console.log('  Warning: Database initialization failed\n');
    }
}

main().catch((error) => {
    logError('Setup failed', error);
    process.exit(1);
});

/**
 * Browser OAuth Script
 *
 * Runs the browser-based OAuth PKCE flow directly against Auth0
 * and stores the resulting tokens in the local SQLite database.
 *
 * Usage: node browser-oauth.js
 */

import { initializeDatabase, openDatabase, saveAuthConfig } from '../data-store.js';
import { runBrowserOAuthFlow } from '../oauth-flow.js';
import { resolveOrganizationId, refreshTokenIfNeeded } from '../sync-service.js';
import { logError } from '../utils/stdin.js';

async function main(): Promise<void> {
    console.log('Authenticating with CNaught via Auth0...');

    const result = await runBrowserOAuthFlow();

    const db = openDatabase();
    try {
        initializeDatabase(db);

        const authConfig = {
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            accessTokenExpiresAt: new Date(Date.now() + result.expiresIn * 1000),
            refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            organizationId: null,
            updatedAt: new Date()
        };

        saveAuthConfig(db, authConfig);

        // Resolve and cache organization ID
        console.log('Resolving organization...');
        try {
            const orgId = await resolveOrganizationId(db, authConfig);
            console.log(`Organization resolved: ${orgId}`);
        } catch (error) {
            console.log(
                `Warning: Could not resolve organization: ${error instanceof Error ? error.message : String(error)}`
            );
            console.log('Organization will be resolved on first sync.');
        }

        console.log('\nAuthentication successful! Tokens stored.');
        console.log('Sessions will automatically sync to the CNaught backend.');
    } finally {
        db.close();
    }
}

main().catch((error) => {
    logError('OAuth flow failed', error);
    console.error(
        `\nAuthentication failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
});

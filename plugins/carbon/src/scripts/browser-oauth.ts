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
import { resolveOrganizationId, refreshTokenIfNeeded, checkOnboardingStatus } from '../sync-service.js';
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
        let orgResolved = false;
        try {
            const orgId = await resolveOrganizationId(db, authConfig);
            console.log(`Organization resolved: ${orgId}`);
            orgResolved = true;
        } catch (error) {
            console.log(
                `Warning: Could not resolve organization: ${error instanceof Error ? error.message : String(error)}`
            );
            console.log('Organization will be created in the next step.');
        }

        // Only check onboarding if we have an org
        if (orgResolved) {
            try {
                const freshAuth = { ...authConfig, organizationId: null };
                const onboarding = await checkOnboardingStatus(db, freshAuth);
                if (!onboarding.hasSubscription) {
                    console.log('\nSubscription not found for this organization.');
                    console.log(`Onboarding URL: ${onboarding.onboardingUrl}`);
                } else {
                    console.log('\nSubscription active — auto-offsetting is enabled.');
                }
            } catch (error) {
                console.log(
                    `Warning: Could not check subscription status: ${error instanceof Error ? error.message : String(error)}`
                );
            }
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

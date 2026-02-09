/**
 * Carbon Create Organization Script
 *
 * Creates an organization for the authenticated user.
 * Called by the setup flow when no organization exists after OAuth.
 *
 * Usage: node carbon-create-org.js <org-name>
 */

import { getAuthConfig, initializeDatabase, openDatabase } from '../data-store.js';
import { createOrganization, getUserEmail, refreshTokenIfNeeded } from '../sync-service.js';
import { logError } from '../utils/stdin.js';

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const orgName = args.join(' ').trim();

    if (!orgName) {
        console.error('Usage: carbon-create-org.js <organization-name>');
        process.exit(1);
    }

    const db = openDatabase();
    try {
        initializeDatabase(db);

        const authConfig = getAuthConfig(db);
        if (!authConfig) {
            console.error('Not authenticated. Run /carbon:setup first.');
            process.exit(1);
        }

        const freshAuth = await refreshTokenIfNeeded(db, authConfig);

        // Get user's email for billingEmail
        console.log('Fetching user profile...');
        const email = await getUserEmail(freshAuth.accessToken);

        // Create the organization
        console.log(`Creating organization "${orgName}"...`);
        const org = await createOrganization(db, freshAuth.accessToken, orgName, email);

        console.log(JSON.stringify({
            success: true,
            organizationId: org.id,
            organizationName: org.name
        }));
    } finally {
        db.close();
    }
}

main().catch((error) => {
    logError('Organization creation failed', error);
    console.error(
        `\nFailed to create organization: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
});

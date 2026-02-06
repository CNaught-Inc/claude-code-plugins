/**
 * Manual OAuth Flow Test
 *
 * Runs the full browser-based PKCE flow against Auth0 and prints the result.
 * Does NOT store tokens anywhere — purely for verifying the flow works.
 *
 * Usage: node dist/scripts/test-oauth.js
 */

import { runBrowserOAuthFlow } from '../oauth-flow.js';

async function main(): Promise<void> {
    console.log('=== OAuth Flow Test ===');
    console.log('This will open your browser for Auth0 authentication.');
    console.log('Tokens will NOT be stored.\n');

    const result = await runBrowserOAuthFlow();

    console.log('\n=== OAuth Flow Succeeded ===');
    console.log(`Access token: ${result.accessToken.slice(0, 20)}...`);
    console.log(`Refresh token: ${result.refreshToken.slice(0, 20)}...`);
    console.log(`Expires in: ${result.expiresIn} seconds`);
    console.log('\nNo tokens were stored. Test complete.');
    process.exit(0);
}

main().catch((error) => {
    console.error(`\n=== OAuth Flow Failed ===`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});

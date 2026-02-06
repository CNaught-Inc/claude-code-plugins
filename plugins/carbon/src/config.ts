/**
 * Configuration
 *
 * Required environment variables for Auth0 and API settings.
 * These must be set at build time via esbuild define or at runtime.
 *
 * Note: We use direct process.env.X access (not dynamic property access)
 * so esbuild can statically replace these at build time.
 */

// Allow self-signed certificates for local development.
// This must run before any fetch/https calls, so it's at the top of this module.
const skipTls = process.env.CNAUGHT_SKIP_TLS_VERIFY;
if (skipTls === '1') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// Read env vars with direct access so esbuild can replace them
const auth0Domain = process.env.CNAUGHT_AUTH0_DOMAIN;
const auth0ClientId = process.env.CNAUGHT_AUTH0_CLIENT_ID;
const auth0Audience = process.env.CNAUGHT_AUTH0_AUDIENCE;
const apiUrl = process.env.CNAUGHT_API_URL;

// Validate required vars at runtime (after esbuild replacement)
if (!auth0Domain) throw new Error('Missing required: CNAUGHT_AUTH0_DOMAIN');
if (!auth0ClientId) throw new Error('Missing required: CNAUGHT_AUTH0_CLIENT_ID');
if (!auth0Audience) throw new Error('Missing required: CNAUGHT_AUTH0_AUDIENCE');
if (!apiUrl) throw new Error('Missing required: CNAUGHT_API_URL');

export const CONFIG = {
    auth0Domain,
    auth0ClientId,
    auth0Audience,
    apiUrl
};

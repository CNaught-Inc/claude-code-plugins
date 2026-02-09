/**
 * OAuth Flow
 *
 * Browser-based OAuth 2.0 PKCE authorization code flow directly against Auth0.
 * No client secret needed — uses public client with PKCE.
 */

import * as crypto from 'crypto';
import * as http from 'http';

import { CONFIG } from './config.js';
import { log } from './utils/stdin.js';

const CALLBACK_PORT = 19876;
const CALLBACK_URL = `http://127.0.0.1:${CALLBACK_PORT}/callback`;
const FLOW_TIMEOUT_MS = 300_000; // 5 minutes

export interface OAuthFlowResult {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}

interface OIDCDiscovery {
    authorization_endpoint: string;
    token_endpoint: string;
}

/**
 * Fetch OIDC discovery document from Auth0
 */
async function fetchDiscovery(auth0Domain: string): Promise<OIDCDiscovery> {
    const url = `https://${auth0Domain}/.well-known/openid-configuration`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`OIDC discovery failed (${response.status}): ${await response.text()}`);
    }

    const doc = (await response.json()) as OIDCDiscovery;

    if (!doc.authorization_endpoint || !doc.token_endpoint) {
        throw new Error('OIDC discovery document missing required endpoints');
    }

    return doc;
}

/**
 * Generate PKCE code verifier and challenge
 */
function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    return { codeVerifier, codeChallenge };
}

/**
 * Open a URL in the default browser
 */
function openBrowser(url: string): void {
    const { exec } = require('child_process') as typeof import('child_process');
    const command =
        process.platform === 'darwin'
            ? 'open'
            : process.platform === 'win32'
              ? 'start'
              : 'xdg-open';
    exec(`${command} "${url}"`);
}

/**
 * Exchange an authorization code for tokens at Auth0's token endpoint
 */
async function exchangeCodeForTokens(
    tokenEndpoint: string,
    code: string,
    clientId: string,
    codeVerifier: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'authorization_code',
            code,
            redirect_uri: CALLBACK_URL,
            client_id: clientId,
            code_verifier: codeVerifier
        })
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Token exchange failed (${response.status}): ${body}`);
    }

    return (await response.json()) as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
    };
}

/**
 * Run the full browser-based Auth0 OAuth PKCE flow
 */
export async function runBrowserOAuthFlow(): Promise<OAuthFlowResult> {
    const auth0Domain = CONFIG.auth0Domain;
    const clientId = CONFIG.auth0ClientId;
    const audience = CONFIG.auth0Audience;

    // 1. Fetch OIDC discovery document
    log('Fetching Auth0 OIDC configuration...');
    const discovery = await fetchDiscovery(auth0Domain);
    log('OIDC endpoints discovered');

    // 2. Generate PKCE
    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = crypto.randomBytes(16).toString('hex');

    // 3. Start local callback server and wait for the redirect
    return new Promise<OAuthFlowResult>((resolve, reject) => {
        let settled = false;
        let flowTimeout: ReturnType<typeof setTimeout>;

        function shutdown() {
            settled = true;
            clearTimeout(flowTimeout);
            server.close();
            server.closeAllConnections();
        }

        const server = http.createServer(async (req, res) => {
            if (settled) {
                res.writeHead(200);
                res.end();
                return;
            }

            const url = new URL(req.url!, `http://127.0.0.1:${CALLBACK_PORT}`);
            if (url.pathname !== '/callback') {
                res.writeHead(404);
                res.end();
                return;
            }

            const error = url.searchParams.get('error');
            if (error) {
                const description = url.searchParams.get('error_description') || error;
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(
                    '<html><body><h1>Authentication Failed</h1><p>You can close this window.</p></body></html>'
                );
                shutdown();
                reject(new Error(`OAuth error: ${description}`));
                return;
            }

            const code = url.searchParams.get('code');
            const returnedState = url.searchParams.get('state');

            if (returnedState !== state) {
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end(
                    '<html><body><h1>Error</h1><p>State mismatch. Please try again.</p></body></html>'
                );
                shutdown();
                reject(new Error('OAuth state mismatch'));
                return;
            }

            if (!code) {
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end(
                    '<html><body><h1>Error</h1><p>No authorization code received.</p></body></html>'
                );
                shutdown();
                reject(new Error('No authorization code received'));
                return;
            }

            // 5. Exchange code for tokens
            try {
                const tokens = await exchangeCodeForTokens(
                    discovery.token_endpoint,
                    code,
                    clientId,
                    codeVerifier
                );

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(
                    '<html><body><h1>Authentication Successful!</h1><p>You can close this window and return to Claude Code.</p></body></html>'
                );

                shutdown();
                resolve({
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token,
                    expiresIn: tokens.expires_in
                });
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end(
                    '<html><body><h1>Error</h1><p>Token exchange failed. Please try again.</p></body></html>'
                );
                shutdown();
                reject(err);
            }
        });

        server.listen(CALLBACK_PORT, '127.0.0.1', () => {
            // 4. Build authorize URL and open browser
            const authorizeUrl = new URL(discovery.authorization_endpoint);
            authorizeUrl.searchParams.set('client_id', clientId);
            authorizeUrl.searchParams.set('redirect_uri', CALLBACK_URL);
            authorizeUrl.searchParams.set('response_type', 'code');
            authorizeUrl.searchParams.set('scope', 'openid profile email offline_access');
            authorizeUrl.searchParams.set('audience', audience);
            authorizeUrl.searchParams.set('state', state);
            authorizeUrl.searchParams.set('code_challenge', codeChallenge);
            authorizeUrl.searchParams.set('code_challenge_method', 'S256');
            authorizeUrl.searchParams.set('skip_profile', 'true');
            authorizeUrl.searchParams.set('skip_onboarding', 'true');

            console.log('\nOpening browser for authentication...');
            console.log(`If the browser does not open, visit: ${authorizeUrl.toString()}\n`);

            openBrowser(authorizeUrl.toString());
        });

        server.on('error', (err) => {
            if (!settled) {
                shutdown();
                reject(new Error(`Callback server error: ${err.message}`));
            }
        });

        // Timeout
        flowTimeout = setTimeout(() => {
            if (!settled) {
                shutdown();
                reject(new Error('OAuth flow timed out after 5 minutes'));
            }
        }, FLOW_TIMEOUT_MS);
    });
}

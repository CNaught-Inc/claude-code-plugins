/**
 * Sync Service
 *
 * Handles synchronization of session data directly to the CNaught GraphQL backend.
 * Authenticates with Auth0 tokens stored locally.
 */

import { GraphQLClient, gql } from 'graphql-request';
import type { Database } from 'bun:sqlite';

import { CONFIG } from './config.js';
import type { AuthConfig, SessionRecord } from './data-store.js';
import { getAuthConfig, saveOrganizationId, updateAuthTokens } from './data-store.js';
import { log, logError } from './utils/stdin.js';

/**
 * Sync result for a session
 */
export interface SyncResult {
    sessionId: string;
    success: boolean;
    error?: string;
}

/**
 * Check if backend integration is configured (has stored auth tokens)
 */
export function isIntegrationConfigured(db: Database): boolean {
    return getAuthConfig(db) !== null;
}

/**
 * Create a GraphQL client with auth headers
 */
function createGraphQLClient(accessToken: string, organizationId?: string | null): GraphQLClient {
    const endpoint = `${CONFIG.apiUrl}/graphql`;
    const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`
    };

    if (organizationId) {
        headers['x-organization-id'] = organizationId;
    }

    return new GraphQLClient(endpoint, { headers });
}

/**
 * Refresh the access token if expired.
 * Returns the (possibly refreshed) auth config.
 */
export async function refreshTokenIfNeeded(
    db: Database,
    authConfig: AuthConfig
): Promise<AuthConfig> {
    const now = new Date();
    const bufferMs = 60_000; // 60 second buffer
    const expiresAt = new Date(authConfig.accessTokenExpiresAt.getTime() - bufferMs);

    if (now < expiresAt) {
        return authConfig; // Still valid
    }

    // Check if refresh token is also expired
    if (now >= authConfig.refreshTokenExpiresAt) {
        throw new Error('Refresh token expired. Run /carbon:setup to re-authenticate.');
    }

    log('Access token expired, refreshing...');

    const tokenUrl = `https://${CONFIG.auth0Domain}/oauth/token`;
    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'refresh_token',
            client_id: CONFIG.auth0ClientId,
            refresh_token: authConfig.refreshToken
        })
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Token refresh failed (${response.status}): ${body}`);
    }

    const result = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
    };

    const newAccessTokenExpiresAt = new Date(Date.now() + result.expires_in * 1000);
    // Auth0 may or may not return a new refresh token (rotation setting)
    const newRefreshToken = result.refresh_token || authConfig.refreshToken;
    const newRefreshTokenExpiresAt = result.refresh_token
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days if rotated
        : authConfig.refreshTokenExpiresAt;

    // Update stored tokens
    updateAuthTokens(
        db,
        result.access_token,
        newRefreshToken,
        newAccessTokenExpiresAt,
        newRefreshTokenExpiresAt
    );

    log('Token refreshed successfully');

    return {
        ...authConfig,
        accessToken: result.access_token,
        refreshToken: newRefreshToken,
        accessTokenExpiresAt: newAccessTokenExpiresAt,
        refreshTokenExpiresAt: newRefreshTokenExpiresAt,
        updatedAt: new Date()
    };
}

const MY_ORGANIZATIONS_QUERY = gql`
    query MyOrganizationsForPlugin {
        myOrganizations {
            id
            name
            stripeSubscriptionId
        }
    }
`;

/**
 * Resolve the user's organization ID via GraphQL and cache it
 */
export async function resolveOrganizationId(
    db: Database,
    authConfig: AuthConfig
): Promise<string> {
    // Return cached org ID if available
    if (authConfig.organizationId) {
        return authConfig.organizationId;
    }

    const client = createGraphQLClient(authConfig.accessToken);

    const data = (await client.request(MY_ORGANIZATIONS_QUERY)) as {
        myOrganizations: { id: string; name: string; stripeSubscriptionId: string | null }[];
    };

    if (!data.myOrganizations || data.myOrganizations.length === 0) {
        throw new Error('No organizations found for this user');
    }

    const orgId = data.myOrganizations[0].id;
    saveOrganizationId(db, orgId);

    return orgId;
}

const UPSERT_SESSIONS_MUTATION = gql`
    mutation UpsertMyClaudeCodeSessions($input: UpsertMyClaudeCodeSessionsInput!) {
        upsertMyClaudeCodeSessions(input: $input) {
            sessions {
                id
                co2Grams
            }
        }
    }
`;

/**
 * Sync multiple sessions to the backend in a single batch request
 */
export async function syncSessions(
    sessions: SessionRecord[],
    authConfig: AuthConfig,
    organizationId: string
): Promise<SyncResult[]> {
    if (sessions.length === 0) {
        return [];
    }

    const BATCH_SIZE = 100;
    const client = createGraphQLClient(authConfig.accessToken, organizationId);
    const allResults: SyncResult[] = [];

    for (let i = 0; i < sessions.length; i += BATCH_SIZE) {
        const batch = sessions.slice(i, i + BATCH_SIZE);

        try {
            const sessionsInput = batch.map((session) => ({
                sessionId: session.sessionId,
                projectPath: session.projectPath || '',
                co2Grams: session.co2Grams,
                totalInputTokens: session.inputTokens,
                totalOutputTokens: session.outputTokens,
                totalCacheCreationTokens: session.cacheCreationTokens,
                totalCacheReadTokens: session.cacheReadTokens,
                energyWh: session.energyWh
            }));

            await client.request(UPSERT_SESSIONS_MUTATION, {
                input: {
                    sessions: sessionsInput
                }
            });

            // All succeeded (batch is atomic)
            for (const session of batch) {
                allResults.push({ sessionId: session.sessionId, success: true });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            // All failed (batch is atomic)
            for (const session of batch) {
                allResults.push({ sessionId: session.sessionId, success: false, error: message });
            }
        }
    }

    return allResults;
}

/**
 * Fetch the authenticated user's email from Auth0 /userinfo endpoint
 */
export async function getUserEmail(accessToken: string): Promise<string> {
    const url = `https://${CONFIG.auth0Domain}/userinfo`;
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch user info (${response.status}): ${await response.text()}`);
    }

    const data = (await response.json()) as { email?: string };
    if (!data.email) {
        throw new Error('No email found in user profile');
    }

    return data.email;
}

const CREATE_MY_ORGANIZATION_MUTATION = gql`
    mutation CreateMyOrganization($input: CreateMyOrganizationInput!) {
        createMyOrganization(input: $input) {
            organization {
                id
                name
            }
        }
    }
`;

/**
 * Create an organization for the authenticated user.
 * Returns the new organization's ID and name.
 */
export async function createOrganization(
    db: Database,
    accessToken: string,
    name: string,
    billingEmail: string
): Promise<{ id: string; name: string }> {
    const client = createGraphQLClient(accessToken);

    const data = (await client.request(CREATE_MY_ORGANIZATION_MUTATION, {
        input: {
            name,
            billingEmail,
            previouslyPurchasedOffsets: false
        }
    })) as {
        createMyOrganization: {
            organization: { id: string; name: string };
        };
    };

    const org = data.createMyOrganization.organization;
    saveOrganizationId(db, org.id);

    return org;
}

/**
 * Slugify text for URL construction (matches frontend convention)
 */
function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Check onboarding status for the user's organization.
 * Returns whether the org has a subscription and the onboarding URL if not.
 */
export async function checkOnboardingStatus(
    db: Database,
    authConfig: AuthConfig
): Promise<{ hasSubscription: boolean; onboardingUrl: string }> {
    const client = createGraphQLClient(authConfig.accessToken);

    const data = (await client.request(MY_ORGANIZATIONS_QUERY)) as {
        myOrganizations: { id: string; name: string; stripeSubscriptionId: string | null }[];
    };

    if (!data.myOrganizations || data.myOrganizations.length === 0) {
        throw new Error('No organizations found for this user');
    }

    const org = data.myOrganizations[0];
    const slug = `${slugify(org.name)}-${org.id}`;
    const onboardingUrl = `${CONFIG.appUrl}/${slug}/api-quick-start`;

    return {
        hasSubscription: !!org.stripeSubscriptionId,
        onboardingUrl
    };
}

/**
 * Format relative time for display
 */
export function formatRelativeTime(date: Date | null): string {
    if (!date) {
        return 'never';
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) {
        return 'just now';
    } else if (diffMinutes < 60) {
        return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    } else if (diffHours < 24) {
        return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    } else {
        return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    }
}

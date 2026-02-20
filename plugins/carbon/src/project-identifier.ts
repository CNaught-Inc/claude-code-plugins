/**
 * Project Identifier
 *
 * Resolves a stable project identifier from a raw filesystem path.
 * - Git repos: `<org>_<repo>_<hash>` (e.g., `cnaught_claude-code-plugins_a1b2c3d4`)
 * - Non-git dirs: `local_<hash>`
 * - Custom name configured: `<custom_name>_<hash>`
 *
 * The hash is the first 8 chars of SHA-256 of the raw path, ensuring
 * uniqueness even when org/repo collide across machines.
 */

import * as crypto from 'node:crypto';
import { execSync } from 'node:child_process';

import { getConfig, queryReadonlyDb } from './data-store';

/**
 * Compute the first 8 hex chars of SHA-256 for a string.
 */
export function shortHash(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex').slice(0, 8);
}

/**
 * Parse `<org>/<repo>` from a git remote URL.
 * Handles both HTTPS and SSH formats:
 *   - https://github.com/org/repo.git
 *   - git@github.com:org/repo.git
 * Returns null if the URL doesn't match.
 */
export function parseGitRemote(url: string): { org: string; repo: string } | null {
    // HTTPS: https://github.com/org/repo.git or https://github.com/org/repo
    const httpsMatch = url.match(/https?:\/\/[^/]+\/([^/]+)\/([^/\s]+?)(?:\.git)?$/);
    if (httpsMatch) {
        return { org: httpsMatch[1], repo: httpsMatch[2] };
    }

    // SSH: git@github.com:org/repo.git or git@github.com:org/repo
    const sshMatch = url.match(/git@[^:]+:([^/]+)\/([^/\s]+?)(?:\.git)?$/);
    if (sshMatch) {
        return { org: sshMatch[1], repo: sshMatch[2] };
    }

    return null;
}

/**
 * Try to get the git remote origin URL for a path.
 * Returns null if not a git repo or git is not available.
 */
function getGitRemoteUrl(rawPath: string): string | null {
    try {
        const url = execSync(`git -C "${rawPath}" remote get-url origin`, {
            encoding: 'utf-8',
            timeout: 5000,
            stdio: ['pipe', 'pipe', 'pipe']
        }).trim();
        return url || null;
    } catch {
        return null;
    }
}

/**
 * Get the user-configured project name from the database, if any.
 */
function getConfiguredProjectName(): string | null {
    return queryReadonlyDb((db) => getConfig(db, 'project_name'));
}

/**
 * Resolve a stable project identifier from a raw filesystem path.
 *
 * Priority:
 * 1. User-configured project name → `<custom_name>_<hash>`
 * 2. Git remote → `<org>_<repo>_<hash>`
 * 3. Fallback → `local_<hash>`
 */
export function resolveProjectIdentifier(rawPath: string): string {
    const hash = shortHash(rawPath);

    // Check for user-configured name
    const customName = getConfiguredProjectName();
    if (customName) {
        return `${customName}_${hash}`;
    }

    // Try git remote
    const remoteUrl = getGitRemoteUrl(rawPath);
    if (remoteUrl) {
        const parsed = parseGitRemote(remoteUrl);
        if (parsed) {
            return `${parsed.org}_${parsed.repo}_${hash}`;
        }
    }

    return `local_${hash}`;
}

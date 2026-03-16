/**
 * Project Identifier
 *
 * Resolves a stable project identifier from a raw filesystem path.
 * The identifier is the first 8 chars of SHA-256 of the raw path.
 */

import * as crypto from 'node:crypto';

/**
 * Compute the first 8 hex chars of SHA-256 for a string.
 */
export function shortHash(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex').slice(0, 8);
}

/**
 * Resolve a stable project identifier from a raw filesystem path.
 * Returns the first 8 hex chars of SHA-256 of the path.
 */
export function resolveProjectIdentifier(rawPath: string): string {
    return shortHash(rawPath);
}

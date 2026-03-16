/**
 * Machine Identity
 *
 * Generates a deterministic user ID from machine identifiers.
 * Using hostname + username ensures the same ID is produced if the
 * database is deleted and re-created on the same machine, preventing
 * double-counting on the API backend.
 */

import * as crypto from 'node:crypto';
import * as os from 'node:os';

/**
 * Generate a deterministic user ID from machine identifiers.
 * Returns a UUID-formatted string derived from hostname + username.
 */
export function generateMachineUserId(): string {
    const machineKey = `${os.hostname()}:${os.userInfo().username}`;
    return crypto
        .createHash('sha256')
        .update(machineKey)
        .digest('hex')
        .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/, '$1-$2-$3-$4-$5');
}

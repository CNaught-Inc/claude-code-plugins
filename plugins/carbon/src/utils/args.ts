/**
 * CLI argument parsing and validation helpers for scripts.
 */

const MAX_NAME_LENGTH = 50;

/**
 * Get the value for a named CLI flag (e.g., --name "value").
 * Returns null if the flag is absent or has no valid value.
 * Rejects values that look like flags (start with --).
 */
export function getArgValue(flag: string): string | null {
    const index = process.argv.indexOf(flag);
    if (index === -1) return null;

    const value = process.argv[index + 1];
    if (!value || value.startsWith('--')) return null;

    return value;
}

/**
 * Check if a boolean flag is present in CLI args.
 */
export function hasFlag(flag: string): boolean {
    return process.argv.includes(flag);
}

/**
 * Validate a user-provided name (e.g., organization name).
 * Returns an error message if invalid, or null if valid.
 */
export function validateName(name: string, maxLength: number = MAX_NAME_LENGTH): string | null {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
        return 'Name cannot be empty.';
    }
    if (trimmed.length > maxLength) {
        return `Name must be ${maxLength} characters or fewer (got ${trimmed.length}).`;
    }
    return null;
}

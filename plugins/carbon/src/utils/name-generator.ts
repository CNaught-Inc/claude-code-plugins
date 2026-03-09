/**
 * Name Generator
 *
 * Generates unique anonymous display names for users using adjective-animal patterns.
 * e.g. "Bright Falcon", "Calm Otter"
 */

import { adjectives, animals, uniqueNamesGenerator } from 'unique-names-generator';

/**
 * Generate a unique anonymous display name.
 * Format: Title Case adjective + animal (e.g. "Bright Falcon")
 */
export function generateUserName(): string {
    return uniqueNamesGenerator({
        dictionaries: [adjectives, animals],
        separator: ' ',
        length: 2,
        style: 'capital'
    });
}

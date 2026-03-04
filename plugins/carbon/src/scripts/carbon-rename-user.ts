/**
 * Carbon Rename Script
 *
 * Updates the display name for anonymous carbon tracking.
 *
 * Usage:
 *   carbon-rename.js --name "New Name"
 */

import '../utils/load-env';

import { adjectives, animals, uniqueNamesGenerator } from 'unique-names-generator';

import { getConfig, initializeDatabase, openDatabase, setConfig } from '../data-store';
import { getArgValue, validateName } from '../utils/args';
import { logError } from '../utils/stdin';

function main(): void {
    const newName = getArgValue('--name');

    if (newName !== null) {
        const error = validateName(newName);
        if (error) {
            console.error(`Display name: ${error}`);
            process.exit(1);
        }
    }

    const db = openDatabase();
    try {
        initializeDatabase(db);

        const userId = getConfig(db, 'claude_code_user_id');
        if (!userId) {
            console.log(
                'Sync is not enabled. Run /carbon:setup first to enable anonymous tracking.'
            );
            return;
        }

        const oldName = getConfig(db, 'claude_code_user_name') || 'Unknown';
        const displayName =
            newName ||
            uniqueNamesGenerator({
                dictionaries: [adjectives, animals],
                separator: ' ',
                style: 'capital'
            });

        setConfig(db, 'claude_code_user_name', displayName);

        if (newName) {
            console.log(`Renamed from "${oldName}" to "${displayName}".`);
        } else {
            console.log(`Renamed from "${oldName}" to "${displayName}" (randomly generated).`);
        }
    } catch (error) {
        logError('Failed to rename', error);
    } finally {
        db.close();
    }
}

main();

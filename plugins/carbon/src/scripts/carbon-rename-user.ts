/**
 * Carbon Rename Script
 *
 * Updates the display name for anonymous carbon tracking.
 *
 * Usage:
 *   carbon-rename.js --name "New Name"
 */

import { adjectives, animals, uniqueNamesGenerator } from 'unique-names-generator';

import { getConfig, initializeDatabase, openDatabase, setConfig } from '../data-store';
import { logError } from '../utils/stdin';

function main(): void {
    const nameIndex = process.argv.indexOf('--name');
    const newName = nameIndex !== -1 ? process.argv[nameIndex + 1] : null;

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
